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
import {
  type Headers,
  listQuery,
  type Query,
  type SendBody,
  sendRequest,
  type Target,
  targetOf,
} from './durable-messages-request.ts';
import {
  type DurableChannel,
  type Subscriber,
  subscriberOf,
  subscriptionStateListener,
} from './durable-messages-subscription.ts';
import type {
  DurableMessage,
  DurableMessageList,
  DurableMessageListOptions,
  DurableMessageSubscription,
} from './sdk-public-types.ts';

export interface DurableMessagesClient extends Pick<
  DurableClient,
  'accessToken' | '_oauthExchangeError' | '_completeOAuthExchange' | '_captureAuthContext' | '_generatedOptions'
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

  async list(target: unknown, options: DurableMessageListOptions = {}): Promise<DurableResult<DurableMessageList>> {
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
    const channel = subscriber.realtime._durableChannel(addressed.executionId, addressed.clientToken);
    if (channel === null) {
      return failure(new Error('This realtime client already subscribes to the execution; unsubscribe first'));
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
    channel._onSubscriptionState = subscriptionStateListener(stream, channel, realtime, () => started);
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
      ? this.client._transport.sendDurableMessageFromApplication(functionName, executionId, body, options)
      : this.client._transport.sendDurableMessage(target.projectId, functionName, executionId, body, options);
  }

  private async listTarget(target: Target, params: Query): Promise<DurableResult<DurableMessageList>> {
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
    const token = target.clientToken === null ? {} : { 'X-Volcano-Client-Token': target.clientToken };
    return { options: this.client._generatedOptions(mode, { ...headers, ...token }) };
  }
}
