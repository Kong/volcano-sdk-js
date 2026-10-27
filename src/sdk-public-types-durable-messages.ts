import type { components as GeneratedComponents } from './generated/openapi';

export type DurableMessage = GeneratedComponents['schemas']['DurableMessage'];
export type DurableMessageDirection = GeneratedComponents['schemas']['DurableMessageDirection'];
export type DurableMessageList = GeneratedComponents['schemas']['DurableMessageList'];

/**
 * The execution a message call addresses.
 *
 * Without `projectId`, the call uses the client's own credential: the
 * function's visibility has to admit it, and then a service key reaches any
 * execution, a signed-in user the executions they started, and anyone the
 * execution whose `clientToken` they send. With `projectId`, it uses the
 * project endpoint and the owner's token or a project access token.
 */
export interface DurableMessageTarget {
  /** Durable function name, or its id. */
  functionName: string;
  executionId: string;
  /** The `client_token` the start that created the execution returned. */
  clientToken?: string;
  projectId?: string;
}

export interface DurableMessageSendOptions {
  /**
   * Makes a retry safe: a repeat with a key the same sender has used on the
   * execution returns the first message with status 200 and sends nothing. Up
   * to 255 characters.
   */
  idempotencyKey?: string;
}

export interface DurableMessageListOptions {
  /** `in` for messages sent to the execution, `out` for what it published. Both by default. */
  direction?: DurableMessageDirection;
  name?: string;
  /** Only messages with a greater `seq`. Pass the last one you read. */
  after?: number;
  /** 1 to 500, 100 by default. */
  limit?: number;
}

export interface DurableMessageSubscribeOptions {
  /** A connected realtime client. Live delivery counts as Realtime messages. */
  realtime: import('./realtime').VolcanoRealtime;
}

export interface DurableMessageSubscription {
  unsubscribe(): Promise<void>;
}

export interface DurableMessages {
  /**
   * Send a message to a running execution. It resolves with status 201, and
   * the message's `status` is `delivered` when a wait took it at once,
   * `delivering` while the handover to that wait is still being confirmed,
   * or `queued` until one does. An execution that has ended answers 409
   * `execution_not_running`, and one holding 100 untaken messages 409
   * `too_many_queued_messages`.
   *
   * @example
   * ```typescript
   * const { data, error } = await volcano.durable.messages.send(
   *   { functionName: 'checkout', executionId, clientToken },
   *   'address-confirmed',
   *   { address_id: 'addr_19' },
   *   { idempotencyKey: 'confirm-addr_19' },
   * );
   * ```
   */
  send(
    target: DurableMessageTarget,
    name: string,
    data?: unknown,
    options?: DurableMessageSendOptions,
  ): Promise<{
    data: DurableMessage | null;
    status: number | null;
    error: Error | null;
  }>;

  /** List the execution's messages in both directions, oldest first. */
  list(
    target: DurableMessageTarget,
    options?: DurableMessageListOptions,
  ): Promise<{
    data: DurableMessageList | null;
    status: number | null;
    error: Error | null;
  }>;

  /**
   * Receive what the execution publishes, in `seq` order and once each. It
   * catches up from the list after subscribing, whenever the connection
   * resubscribes, and when a live message shows an earlier one was lost,
   * retrying a read that fails, so no published message is missed. One
   * subscription per execution per realtime client;
   * `disconnect()` and `removeAllChannels()` on it end the subscription.
   * Delivery does not wait for a handler's promise; a rejection is logged
   * with `console.error`.
   *
   * @example
   * ```typescript
   * const { data: subscription } = await volcano.durable.messages.subscribe(
   *   { functionName: 'report-builder', executionId, clientToken },
   *   (message) => console.log(message.name, message.data),
   *   { realtime },
   * );
   * await subscription?.unsubscribe();
   * ```
   */
  subscribe(
    target: DurableMessageTarget,
    handler: (message: DurableMessage) => unknown,
    options: DurableMessageSubscribeOptions,
  ): Promise<{
    data: DurableMessageSubscription | null;
    status: number | null;
    error: Error | null;
  }>;
}
