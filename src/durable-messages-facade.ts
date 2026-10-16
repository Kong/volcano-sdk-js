import { MAX_NAME_LENGTH, OPERATION_NAME } from './durable-callback.ts';
import {
  credentialMode,
  type DurableClient,
  type DurableResult,
  durableResult,
  failure,
  ownerSession,
} from './durable-facade.ts';
import { isDurableMessage, isDurableMessageList } from './durable-message-response.ts';
import { DurableMessageStream, toError } from './durable-message-stream.ts';
import { durablePathSegments } from './durable-paths.ts';
import type {
  DurableMessage,
  DurableMessageList,
  DurableMessageListOptions,
  DurableMessageSubscription,
} from './sdk-public-types.ts';

type Query = Record<string, unknown>;
type Headers = Record<string, string>;

// The spec's bounds on Idempotency-Key, X-Volcano-Client-Token, and a page.
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_CLIENT_TOKEN_LENGTH = 128;
const MAX_LIST_LIMIT = 500;
// A header value carries printable ASCII only.
const HEADER_VALUE = /^[\u0020-\u007E]+$/;

const LIST_PARAMS = ['direction', 'name', 'after', 'limit'] as const;

interface SendBody {
  name: string;
  data?: unknown;
}

export interface DurableMessagesClient extends Pick<
  DurableClient,
  | 'accessToken'
  | '_oauthExchangeError'
  | '_completeOAuthExchange'
  | '_captureAuthContext'
  | '_generatedOptions'
> {
  readonly _transport: {
    sendDurableMessage(
      projectId: string,
      functionId: string,
      executionId: string,
      body: SendBody,
      options: unknown,
    ): Promise<unknown>;
    sendDurableMessageFromApplication(
      functionId: string,
      executionId: string,
      body: SendBody,
      options: unknown,
    ): Promise<unknown>;
    listDurableMessages(
      projectId: string,
      functionId: string,
      executionId: string,
      params: Query,
      options: unknown,
    ): Promise<unknown>;
    listDurableMessagesFromApplication(
      functionId: string,
      executionId: string,
      params: Query,
      options: unknown,
    ): Promise<unknown>;
  };
}

/** The parts of a realtime channel a subscription drives. */
interface DurableChannel {
  on(event: string, callback: (data: unknown) => void): unknown;
  subscribe(): Promise<void>;
  _onSubscriptionState: ((state: string) => void) | null;
  readonly _paused: boolean;
}

interface DurableRealtime {
  _durableChannel(executionId: string, clientToken: string | null): DurableChannel | null;
  _removeDurableChannel(channel: DurableChannel): void;
}

interface Target {
  projectId: string | null;
  functionName: string;
  executionId: string;
  clientToken: string | null;
}

interface Subscriber {
  deliver(message: DurableMessage): unknown;
  realtime: DurableRealtime;
}

type Checked<T> = { value: T; error?: never } | { error: Error; value?: never };

type Credential = { options: unknown; error?: never } | { error: Error; options?: never };

export class DurableMessagesFacade {
  constructor(private readonly client: DurableMessagesClient) {}

  async send(
    target: unknown,
    name: unknown,
    data?: unknown,
    options: { idempotencyKey?: unknown } = {},
  ): Promise<DurableResult<DurableMessage>> {
    const request = sendRequest(target, name, data, options.idempotencyKey);
    if (request instanceof Error) {
      return failure(request);
    }
    const credential = await this.credential(request.target, request.headers);
    if (credential.error !== undefined) {
      return failure(credential.error);
    }
    return durableResult('Failed to send durable message', isDurableMessage, () =>
      this.sendTo(request.target, request.body, credential.options),
    );
  }

  async list(
    target: unknown,
    options: DurableMessageListOptions = {},
  ): Promise<DurableResult<DurableMessageList>> {
    const addressed = targetOf(target);
    if (addressed instanceof Error) {
      return failure(addressed);
    }
    const query = listQuery(options);
    if (query instanceof Error) {
      return failure(query);
    }
    return this.listTarget(addressed, query);
  }

  async subscribe(
    target: unknown,
    handler: unknown,
    options: { realtime?: unknown } = {},
  ): Promise<DurableResult<DurableMessageSubscription>> {
    const addressed = targetOf(target);
    if (addressed instanceof Error) {
      return failure(addressed);
    }
    const subscriber = subscriberOf(handler, options.realtime);
    if (subscriber instanceof Error) {
      return failure(subscriber);
    }
    const channel = subscriber.realtime._durableChannel(
      addressed.executionId,
      addressed.clientToken,
    );
    if (channel === null) {
      return failure(
        new Error('This realtime client already subscribes to the execution; unsubscribe first'),
      );
    }
    return this.follow(addressed, subscriber, channel);
  }

  private async follow(
    target: Target,
    subscriber: Subscriber,
    channel: DurableChannel,
  ): Promise<DurableResult<DurableMessageSubscription>> {
    const { realtime } = subscriber;
    const stream = new DurableMessageStream(
      (message) => subscriber.deliver(message),
      (after) => this.listTarget(target, { direction: 'out', after }),
    );
    const subscription = {
      unsubscribe(): Promise<void> {
        realtime._removeDurableChannel(channel);
        return Promise.resolve();
      },
    };
    channel.on('*', (data) => {
      stream.live(data);
    });
    // Set before subscribing, so a channel discarded while it subscribes
    // still closes the stream.
    let started = false;
    channel._onSubscriptionState = (state) => {
      // An unsubscribed channel does not come back: it was discarded by
      // unsubscribing, disconnect(), removeAllChannels(), or a change of
      // signed-in user, or the server ended it.
      if (state === 'unsubscribed') {
        stream.close();
        // Before it starts, subscribe() returns the failure instead.
        if (started) {
          leaveIfServerEnded(channel, realtime);
        }
        return;
      }
      // The first catch-up follows subscribing below.
      if (!started) {
        return;
      }
      if (state === 'subscribed') {
        stream.catchUpInBackground();
        return;
      }
      stream.hold();
    };
    try {
      await channel.subscribe();
    } catch (error) {
      await subscription.unsubscribe();
      return failure(toError(error));
    }
    started = true;
    const caughtUp = await stream.catchUp();
    if (caughtUp.error !== null) {
      await subscription.unsubscribe();
      return { data: null, status: caughtUp.status, error: caughtUp.error };
    }
    return { data: subscription, status: caughtUp.status, error: null };
  }

  private sendTo(target: Target, body: SendBody, options: unknown): Promise<unknown> {
    const { functionName, executionId } = target;
    return target.projectId === null
      ? this.client._transport.sendDurableMessageFromApplication(
          functionName,
          executionId,
          body,
          options,
        )
      : this.client._transport.sendDurableMessage(
          target.projectId,
          functionName,
          executionId,
          body,
          options,
        );
  }

  private async listTarget(
    target: Target,
    params: Query,
  ): Promise<DurableResult<DurableMessageList>> {
    const credential = await this.credential(target, {});
    if (credential.error !== undefined) {
      return failure(credential.error);
    }
    return durableResult('Failed to list durable messages', isDurableMessageList, () =>
      target.projectId === null
        ? this.client._transport.listDurableMessagesFromApplication(
            target.functionName,
            target.executionId,
            params,
            credential.options,
          )
        : this.client._transport.listDurableMessages(
            target.projectId,
            target.functionName,
            target.executionId,
            params,
            credential.options,
          ),
    );
  }

  // The project route takes the owner's session; the application route takes
  // whichever credential the client has, as a start does.
  private async credential(target: Target, headers: Headers): Promise<Credential> {
    if (target.projectId !== null) {
      const sessionError = await ownerSession(this.client);
      if (sessionError !== null) {
        return { error: sessionError };
      }
      return { options: this.client._generatedOptions('session', headers) };
    }
    await this.client._completeOAuthExchange();
    const mode = credentialMode(this.client._captureAuthContext().accessToken);
    const token =
      target.clientToken === null ? {} : { 'X-Volcano-Client-Token': target.clientToken };
    return { options: this.client._generatedOptions(mode, { ...headers, ...token }) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function targetOf(target: unknown): Target | Error {
  if (!isRecord(target)) {
    return new Error('target must be an object');
  }
  const path = durablePathSegments({
    functionName: target['functionName'],
    executionId: target['executionId'],
  });
  if (path.error !== undefined) {
    return path.error;
  }
  const projectId = optionalProject(target['projectId']);
  if (projectId.error !== undefined) {
    return projectId.error;
  }
  const clientToken = optionalClientToken(target['clientToken']);
  if (clientToken.error !== undefined) {
    return clientToken.error;
  }
  return { projectId: projectId.value, ...path.segments, clientToken: clientToken.value };
}

function optionalProject(value: unknown): Checked<string | null> {
  if (value === undefined) {
    return { value: null };
  }
  const path = durablePathSegments({ projectId: value });
  if (path.error !== undefined) {
    return { error: path.error };
  }
  return { value: path.segments.projectId };
}

function optionalClientToken(value: unknown): Checked<string | null> {
  return optionalHeaderValue(value, 'clientToken', MAX_CLIENT_TOKEN_LENGTH);
}

function optionalHeaderValue(value: unknown, field: string, limit: number): Checked<string | null> {
  if (value === undefined) {
    return { value: null };
  }
  if (typeof value !== 'string' || value === '') {
    return { error: new Error(`${field} must be a non-empty string when provided`) };
  }
  const error = headerValueError(value, field, limit);
  return error === null ? { value } : { error };
}

function headerValueError(value: string, field: string, limit: number): Error | null {
  if (!HEADER_VALUE.test(value)) {
    return new Error(`${field} must be printable ASCII`);
  }
  return value.length > limit
    ? new Error(`${field} must be at most ${String(limit)} characters`)
    : null;
}

function sendRequest(
  target: unknown,
  name: unknown,
  data: unknown,
  idempotencyKey: unknown,
): { target: Target; headers: Headers; body: SendBody } | Error {
  const addressed = targetOf(target);
  if (addressed instanceof Error) {
    return addressed;
  }
  const checkedName = messageName(name);
  if (checkedName.error !== undefined) {
    return checkedName.error;
  }
  const headers = idempotencyHeaders(idempotencyKey);
  if (headers instanceof Error) {
    return headers;
  }
  const body = data === undefined ? { name: checkedName.value } : { name: checkedName.value, data };
  return { target: addressed, headers, body };
}

// The names ctx.publish and ctx.waitForMessage accept.
function messageName(name: unknown): Checked<string> {
  if (typeof name !== 'string' || name.trim() === '') {
    return { error: new Error('name must be a non-empty string') };
  }
  if (name.length > MAX_NAME_LENGTH || !OPERATION_NAME.test(name)) {
    return {
      error: new Error(
        `name must be at most ${String(MAX_NAME_LENGTH)} printable ASCII characters`,
      ),
    };
  }
  return { value: name };
}

// The SDK pauses a channel before it unsubscribes one, so one unsubscribed
// unpaused was ended by the server, refusing a resubscription for one. Leaving
// it lets the execution be subscribed to again.
function leaveIfServerEnded(channel: DurableChannel, realtime: DurableRealtime): void {
  if (channel._paused) {
    return;
  }
  console.error(
    '[Realtime] The server ended the durable message subscription; subscribe again to resume',
  );
  realtime._removeDurableChannel(channel);
}

function subscriberOf(handler: unknown, realtime: unknown): Subscriber | Error {
  if (typeof handler !== 'function') {
    return new Error('subscribe requires a handler function');
  }
  if (!isDurableRealtime(realtime)) {
    return new Error('subscribe requires options.realtime, a connected VolcanoRealtime');
  }
  return {
    deliver(message) {
      const result: unknown = Reflect.apply(handler, undefined, [message]);
      return result;
    },
    realtime,
  };
}

function idempotencyHeaders(key: unknown): Headers | Error {
  const checked = optionalHeaderValue(key, 'idempotencyKey', MAX_IDEMPOTENCY_KEY_LENGTH);
  if (checked.error !== undefined) {
    return checked.error;
  }
  return checked.value === null ? {} : { 'Idempotency-Key': checked.value };
}

function isIntegerBetween(value: unknown, min: number, max: number): boolean {
  return Number.isSafeInteger(value) && Number(value) >= min && Number(value) <= max;
}

const LIST_FILTER_ERRORS: Record<(typeof LIST_PARAMS)[number], (value: unknown) => Error | null> = {
  direction: (value) =>
    value === 'in' || value === 'out' ? null : new Error("direction must be 'in' or 'out'"),
  name: (value) => messageName(value).error ?? null,
  after: (value) =>
    isIntegerBetween(value, 0, Number.MAX_SAFE_INTEGER)
      ? null
      : new Error('after must be a non-negative integer'),
  limit: (value) =>
    isIntegerBetween(value, 1, MAX_LIST_LIMIT)
      ? null
      : new Error(`limit must be an integer between 1 and ${String(MAX_LIST_LIMIT)}`),
};

function listQuery(options: object): Query | Error {
  const params: Query = {};
  for (const name of LIST_PARAMS) {
    const value: unknown = Reflect.get(options, name);
    if (value === undefined) {
      continue;
    }
    const error = LIST_FILTER_ERRORS[name](value);
    if (error !== null) {
      return error;
    }
    params[name] = value;
  }
  return params;
}

function isDurableRealtime(value: unknown): value is DurableRealtime {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, '_durableChannel') === 'function' &&
    typeof Reflect.get(value, '_removeDurableChannel') === 'function'
  );
}
