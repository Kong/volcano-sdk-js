import type { DurableDuration } from './durable-types-steps.ts';

export interface WaitForApprovalOptions {
  /** What reviewers see first. Up to 200 characters. */
  title: string;
  /** Longer context for the reviewer. Up to 4000 characters. */
  description?: string;
  /**
   * Any JSON value shown with the request, such as the record under review.
   * The whole request, details included, is limited to 64 KiB.
   */
  details?: unknown;
  /**
   * How long reviewers have to decide. Unset, the approval stays open until
   * the execution ends. When it runs out the decision resolves as `expired`.
   */
  timeout?: DurableDuration;
}

export interface ApprovalDecider {
  id: string;
  email: string;
}

/**
 * The outcome of an approval. A denial or an expiry is a decision like any
 * other, so it resolves rather than throws: branch on `approved`.
 */
export interface ApprovalDecision {
  approved: boolean;
  status: 'approved' | 'denied' | 'expired';
  /** The reviewer's comment, or `''` when they left none. */
  comment: string;
  /**
   * Who decided, or `null` when the approval expired or the deciding account
   * was deleted before the decision reached the workflow.
   */
  decidedBy: ApprovalDecider | null;
  /** When it was decided, as an ISO 8601 timestamp, or `null` when it expired. */
  decidedAt: string | null;
}

export interface WaitForMessageOptions {
  /**
   * How long to wait. Unset, the wait lasts as long as the execution. When it
   * runs out the wait resolves with `null`.
   */
  timeout?: DurableDuration;
}

/**
 * Hands the callback's token to the system that will complete it. It runs as
 * a step, so it may run again after a crash; the token is the same each time.
 * A returned promise is awaited; whatever it or the submitter returns is
 * ignored.
 */
export type CallbackSubmitter = (token: string) => unknown;

export interface WaitForCallbackOptions {
  /**
   * How long to wait for the callback to complete. Unset, the wait lasts as
   * long as the execution. When it runs out the wait resolves with `null`.
   */
  timeout?: DurableDuration;
  /**
   * How long the wait may go without a heartbeat from the token's holder.
   * When it runs out the wait resolves with `null`, as a timeout does.
   */
  heartbeatTimeout?: DurableDuration;
}

export interface MessageSender {
  /** The credential it was sent with: `service_key`, `user`, `anon`, or `project`. */
  type: string;
  /** The user who sent it, when `type` is `user`. */
  userId: string | null;
}

/** A message sent to the execution, as `ctx.waitForMessage` receives it. */
export interface ReceivedMessage {
  id: string;
  name: string;
  /** The JSON value sent, or `null`. */
  data: unknown;
  sender: MessageSender;
  /** When it was sent, as an ISO 8601 timestamp. */
  sentAt: string;
}

export interface PublishedMessage {
  id: string;
  /** Orders the execution's messages. Read the ones after it with `after`. */
  seq: number;
}
