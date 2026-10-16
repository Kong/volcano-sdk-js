import { createHash } from 'node:crypto';
import {
  callbackConfig,
  type CallbackContext,
  callbackResult,
  callbacks,
  isCallbackTimeout,
  isRecord,
  MAX_NAME_LENGTH,
  OPERATION_NAME,
  platformApiUrl,
  requiredExecutionRef,
} from './durable-callback.ts';
import { postToPlatform } from './durable-platform-request.ts';
import type { MessageSender, PublishedMessage, ReceivedMessage } from './durable-types.ts';

export interface PublishContext extends CallbackContext {
  step<Result>(
    name: string | undefined,
    run: () => Promise<Result>,
    config: Record<string, unknown>,
  ): Promise<Result>;
}

export type Publish = (name: unknown, data?: unknown) => Promise<PublishedMessage>;

const WAIT = 'ctx.waitForMessage()';
const PUBLISH = 'ctx.publish()';
const SESSION_NAME = 'volcano:messages-session';
const MAX_DATA_BYTES = 64 * 1024;

/**
 * Open a callback, register it with Volcano as a wait for the named message,
 * and resolve with the message, or null once the timeout passes. Registration
 * runs inside the runtime's checkpointed submitter, so a replay never
 * registers the same wait twice.
 */
export async function waitForMessage(
  context: CallbackContext,
  executionRef: string | undefined,
  name: unknown,
  options: unknown = {},
): Promise<ReceivedMessage | null> {
  if (!isRecord(options)) {
    throw new TypeError(`${WAIT} options must be an object`);
  }
  const messageName = checkedName(WAIT, name);
  const config = callbackConfig(options['timeout']);
  const apiUrl = platformApiUrl(WAIT, 'wait for messages');
  const execution = requiredExecutionRef(WAIT, executionRef);
  const waitForCallback = callbacks(context, 'messages');
  const submit = async (callbackId: string): Promise<void> => {
    await postToPlatform(apiUrl, {
      path: '/durable-messages/waits',
      body: { execution_ref: execution, callback_id: callbackId, name: messageName },
      action: 'register the message wait',
      subject: 'the message wait',
      notReadyCode: 'callback_not_ready',
      closedCode: 'callback_closed',
    });
  };
  try {
    return received(await waitForCallback(messageName, submit, config));
  } catch (error) {
    if (isCallbackTimeout(error)) {
      return null;
    }
    throw error;
  }
}

/**
 * `ctx.publish` for one durable context. The context's first publish opens a
 * messages session, a callback Volcano completes with the token the
 * publishes carry; the runtime checkpoints it, so a replay reuses it. A
 * session that fails to open fails every later publish in the context.
 */
export function messagePublisher(
  context: PublishContext,
  executionRef: string | undefined,
): Publish {
  let session: Promise<string> | undefined;
  let published = 0;
  return async (name, data) => {
    const message = { name: checkedName(PUBLISH, name), data: messageData(data) };
    const apiUrl = platformApiUrl(PUBLISH, 'publish messages');
    const execution = requiredExecutionRef(PUBLISH, executionRef);
    // Counted when called, as the runtime numbers operations, so a replay
    // gives every publish the position it had before.
    published += 1;
    const position = published;
    // Kept when it fails. Whether a later publish found the open still pending
    // depends on timing a replay does not reproduce, so reopening could give
    // the replay a session callback the run never made.
    session ??= openSession(context, apiUrl, execution);
    const token = await session;
    const key = publishKey(token, position);
    return context.step(
      message.name,
      async () => publishedMessage(await publish(apiUrl, token, key, message)),
      { retryStrategy: () => ({ shouldRetry: false }) },
    );
  };
}

function openSession(context: CallbackContext, apiUrl: string, execution: string): Promise<string> {
  const waitForCallback = callbacks(context, 'messages');
  const submit = async (callbackId: string): Promise<void> => {
    await postToPlatform(apiUrl, {
      path: '/durable-messages/sessions',
      body: { execution_ref: execution, callback_id: callbackId },
      action: 'open the messages session',
      subject: 'the messages session',
      notReadyCode: 'callback_not_ready',
      closedCode: 'callback_closed',
    });
  };
  return waitForCallback(SESSION_NAME, submit, callbackConfig()).then(sessionToken);
}

// Unique within the execution, because every context has its own session,
// and the same when a step runs again. Hashed, so Volcano never stores the
// token itself.
function publishKey(token: string, position: number): string {
  return `${createHash('sha256').update(token).digest('hex')}:${String(position)}`;
}

function publish(
  apiUrl: string,
  token: string,
  key: string,
  message: { name: string; data: unknown },
): Promise<unknown> {
  return postToPlatform(apiUrl, {
    path: '/durable-messages/publish',
    body: message,
    headers: { 'X-Volcano-Durable-Session': token, 'Idempotency-Key': key },
    action: 'publish the message',
    subject: 'the message',
    readsAnswer: true,
  });
}

function checkedName(operation: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${operation} requires a non-empty name`);
  }
  if (value.length > MAX_NAME_LENGTH) {
    throw new TypeError(`${operation} name must be at most ${String(MAX_NAME_LENGTH)} characters`);
  }
  if (!OPERATION_NAME.test(value)) {
    throw new TypeError(`${operation} name must be printable ASCII`);
  }
  return value;
}

// Send a snapshot, so data that changes later, or serializes differently a
// second time, cannot slip past the size check.
function messageData(value: unknown): unknown {
  if (value === undefined) {
    return null;
  }
  const text = messageJson(value);
  if (new TextEncoder().encode(text).byteLength > MAX_DATA_BYTES) {
    throw new TypeError(`${PUBLISH} data must be at most 64 KiB as JSON`);
  }
  const snapshot: unknown = JSON.parse(text);
  if (hasNul(snapshot)) {
    throw new TypeError(`${PUBLISH} data must not contain NUL characters`);
  }
  return snapshot;
}

function messageJson(value: unknown): string {
  // A function or symbol serializes to nothing rather than throwing.
  let text: unknown;
  try {
    text = JSON.stringify(value);
  } catch (cause) {
    throw notJson({ cause });
  }
  if (typeof text !== 'string') {
    throw notJson();
  }
  return text;
}

// Volcano refuses a NUL anywhere in message data, keys included. An array's
// entries are its items, under index keys.
function hasNul(value: unknown): boolean {
  if (typeof value === 'string') {
    return value.includes('\0');
  }
  return (
    isRecord(value) &&
    Object.entries(value).some(([key, item]) => key.includes('\0') || hasNul(item))
  );
}

function notJson(options?: ErrorOptions): TypeError {
  return new TypeError(`${PUBLISH} data must be serializable as JSON`, options);
}

function received(result: unknown): ReceivedMessage {
  const value = callbackResult(result, unreadableMessage);
  const message = isRecord(value) ? readMessage(value) : null;
  if (message === null) {
    throw unreadableMessage();
  }
  return message;
}

function readMessage(value: Record<string, unknown>): ReceivedMessage | null {
  const envelope = messageEnvelope(value);
  const sender = messageSender(value['sender']);
  if (envelope === null || sender === null) {
    return null;
  }
  return { ...envelope, data: value['data'] ?? null, sender };
}

function messageEnvelope(
  value: Record<string, unknown>,
): Pick<ReceivedMessage, 'id' | 'name' | 'sentAt'> | null {
  const { id, name, sent_at: sentAt } = value;
  if (typeof id !== 'string' || typeof name !== 'string' || typeof sentAt !== 'string') {
    return null;
  }
  return { id, name, sentAt };
}

function messageSender(value: unknown): MessageSender | null {
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    return null;
  }
  const userId = value['user_id'];
  return { type: value['type'], userId: typeof userId === 'string' ? userId : null };
}

function unreadableMessage(options?: ErrorOptions): TypeError {
  return new TypeError(
    'Volcano resumed the message wait with a message this SDK cannot read',
    options,
  );
}

function sessionToken(result: unknown): string {
  const value = callbackResult(result, unreadableSession);
  const token = isRecord(value) ? value['token'] : undefined;
  if (typeof token !== 'string' || token === '') {
    throw unreadableSession();
  }
  return token;
}

function unreadableSession(options?: ErrorOptions): TypeError {
  return new TypeError(
    'Volcano opened the messages session with a token this SDK cannot read',
    options,
  );
}

function publishedMessage(body: unknown): PublishedMessage {
  if (!isRecord(body) || typeof body['id'] !== 'string' || typeof body['seq'] !== 'number') {
    throw new TypeError('Volcano answered the publish with a message this SDK cannot read');
  }
  return { id: body['id'], seq: body['seq'] };
}
