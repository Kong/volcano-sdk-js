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
   * The start that creates the execution also returns its `client_token`; a
   * repeat under the same name does not. Pass it to `getFromApplication`,
   * `stopFromApplication`, and `durable.messages` so an anon key, or a user who
   * did not start the execution, can reach it. A service key scoped to a list
   * without `*` also needs it to read and stop the execution.
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
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Callers may name the input type they send.
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
   * Read an execution, including its `result` once it has succeeded, on the
   * project-scoped route.
   *
   * Owner-scoped: it takes the project id and needs the project owner's
   * platform user token or a project access token. Auth-user sessions, anon
   * keys, and service keys are rejected. Call it from your backend; an
   * application reads the executions it started with `getFromApplication`.
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
   * Read an execution with the credential that started it, including its
   * `result` once it has succeeded. Poll this to wait for an execution to finish.
   *
   * It uses the client's credential, as `start` does. A service key holding
   * `*`, the default, reaches any execution of the project, and a signed-in
   * user the executions they started. An anon key, a user who did not start
   * it, or a service key scoped to a list without `*` needs
   * `options.clientToken`: the `client_token` its start returned. An execution
   * the caller cannot reach answers 404, like one that does not exist. A 503
   * with `error.retryAfter` means reads of the execution are throttled; wait
   * that many seconds before reading again.
   *
   * @example
   * ```typescript
   * const { data, error } = await volcano.durable.getFromApplication('order-pipeline', execution.id, {
   *   clientToken: execution.client_token,
   * });
   * if (!error && data?.status === 'succeeded') {
   *   console.log(data.result);
   * }
   * ```
   */
  getFromApplication(
    functionName: string,
    executionId: string,
    options?: { clientToken?: string },
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

  /**
   * Ask a running execution to stop, with the credential that started it.
   * Reaches the same executions as `getFromApplication`, with the same
   * `options.clientToken`. Accepted rather than awaited, like `stop`: poll
   * `getFromApplication` to see it reach `stopped`. Only a service key holding
   * `*` reaches an execution that is still `pending`, and stopping one answers
   * 409. A 503 with `error.retryAfter` means reads of the execution are
   * throttled; the stop may already have been sent, so read the execution
   * before stopping it again.
   */
  stopFromApplication(
    functionName: string,
    executionId: string,
    options?: { clientToken?: string },
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
