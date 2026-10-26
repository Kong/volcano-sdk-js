import type { components as GeneratedComponents } from './generated/openapi';
import type { DurableApprovals } from './sdk-public-types-durable-approvals.ts';
import type { DurableMessages } from './sdk-public-types-durable-messages.ts';
import type { JsonValue } from './sdk-public-types-json.ts';

/** Handle a durable start answers with, straight off the wire contract. */
export type DurableExecution = GeneratedComponents['schemas']['DurableExecution'];
export type DurableExecutionStatus = GeneratedComponents['schemas']['DurableExecutionStatus'];
export type PaginatedDurableExecutions = GeneratedComponents['schemas']['PaginatedDurableExecutions'];

export interface Durable {
  /**
   * Start a durable execution and get back a handle to it.
   *
   * A durable function is never invoked synchronously: it can run for up to 366 days, so
   * the platform accepts the start and answers with an execution to poll.
   * Besides messaging an execution through `durable.messages`, starting is the
   * only durable operation an application credential may perform — reading a
   * result or stopping an execution needs the project owner's platform user
   * token, so poll from your own backend or with the CLI.
   *
   * @param functionName - Durable function name, or its id.
   * @param input - JSON-serializable input handed to the function.
   * @param options.executionName - Idempotency key. Starting again under the
   *        same name returns the execution that already exists rather than
   *        beginning a second one, and is charged once. Up to 255 characters.
   *
   * @example
   * ```typescript
   * const { data, error } = await volcano.durable.start(
   *   'order-pipeline',
   *   { order_id: orderId },
   *   { executionName: `order-${orderId}` },
   * );
   * if (!error && data) {
   *   console.log(data.id, data.status); // 'running'
   * }
   * ```
   */
  start<TInput = JsonValue>(
    functionName: string,
    input?: TInput,
    options?: { executionName?: string },
  ): Promise<{
    data: DurableExecution | null;
    /** HTTP status: 202 on a start, the platform's refusal status otherwise. */
    status: number | null;
    error: Error | null;
  }>;

  /**
   * Read an execution, including its `result` once it has succeeded. This is
   * how you find out how a started execution went.
   *
   * Owner-scoped: it takes the project id and needs the project owner's
   * platform user token or a project access token. Auth-user sessions, anon
   * keys, and service keys are rejected. Poll it from your backend, not a browser.
   *
   * @example
   * ```typescript
   * const { data, error } = await volcano.durable.get(projectId, 'order-pipeline', executionId);
   * if (!error && data?.status === 'succeeded') {
   *   console.log(data.result);
   * }
   * ```
   */
  get(
    projectId: string,
    functionName: string,
    executionId: string,
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;

  /**
   * List a durable function's executions, most recent first. Each entry carries
   * the status the platform last observed rather than a live one; read a single
   * execution for that. Owner-scoped, like `get`.
   */
  list(
    projectId: string,
    functionName: string,
    options?: { status?: DurableExecutionStatus; page?: number; limit?: number },
  ): Promise<{
    data: PaginatedDurableExecutions | null;
    status: number | null;
    error: Error | null;
  }>;

  /**
   * Ask a running execution to stop. Accepted rather than awaited: what
   * resolves here is the execution read back after asking, and it often still
   * says `running`, so poll `get` to see it reach `stopped`. Completed steps
   * are not undone. Repeating a stop is safe — an execution that has already
   * finished reports the state it is in. Owner-scoped, like `get`.
   */
  stop(
    projectId: string,
    functionName: string,
    executionId: string,
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;

  /** Approvals that durable executions requested with `ctx.waitForApproval`. */
  approvals: DurableApprovals;

  /**
   * Messages sent to running executions, which they take with
   * `ctx.waitForMessage`, and the ones they publish with `ctx.publish`.
   */
  messages: DurableMessages;
}
