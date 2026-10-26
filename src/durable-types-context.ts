import type { BatchOptions, BatchResult } from './durable-types-batch.ts';
import type {
  DurableDuration,
  DurableLog,
  DurableStepScope,
  StepOptions,
  WaitUntilOptions,
} from './durable-types-steps.ts';
import type {
  ApprovalDecision,
  CallbackSubmitter,
  PublishedMessage,
  ReceivedMessage,
  WaitForApprovalOptions,
  WaitForCallbackOptions,
  WaitForMessageOptions,
} from './durable-types-waits.ts';

/** A branch of `ctx.parallel`, named for the execution history. */
export interface ParallelBranch<TResult> {
  name?: string;
  run: (ctx: DurableContext) => Promise<TResult>;
}

/**
 * The durable context. Every method on it is checkpointed: a resumed execution
 * replays what already finished instead of running it again.
 */
export interface DurableContext {
  /** Logs, suppressed while an operation is being replayed. */
  log: DurableLog;

  /**
   * Runs one atomic operation and records its result. A step cannot contain
   * durable operations; use `child` to group those.
   */
  step<TResult>(
    name: string,
    fn: (scope: DurableStepScope) => Promise<TResult>,
    options?: StepOptions,
  ): Promise<TResult>;
  step<TResult>(fn: (scope: DurableStepScope) => Promise<TResult>, options?: StepOptions): Promise<TResult>;

  /**
   * Suspends the execution for a duration. The execution is not running, and
   * not billed, while it waits.
   */
  wait(name: string, duration: DurableDuration): Promise<void>;
  wait(duration: DurableDuration): Promise<void>;

  /** Groups operations under one recorded context, with its own replay scope. */
  child<TResult>(name: string, fn: (ctx: DurableContext) => Promise<TResult>): Promise<TResult>;
  child<TResult>(fn: (ctx: DurableContext) => Promise<TResult>): Promise<TResult>;

  /**
   * Polls until a condition holds, suspending between checks. The check returns
   * the state handed to the next one, and `until` decides when to stop.
   */
  waitUntil<TState>(
    name: string,
    check: (state: TState, scope: DurableStepScope) => Promise<TState>,
    options: WaitUntilOptions<TState>,
  ): Promise<TState>;
  waitUntil<TState>(
    check: (state: TState, scope: DurableStepScope) => Promise<TState>,
    options: WaitUntilOptions<TState>,
  ): Promise<TState>;

  /**
   * Asks the project's owners to approve or deny, and suspends until one of
   * them decides in the dashboard, the CLI, or the API. The execution is not
   * running, and not billed, while it waits.
   */
  waitForApproval(name: string, options: WaitForApprovalOptions): Promise<ApprovalDecision>;

  /**
   * Suspends until a message with this name is sent to the execution, and
   * resolves with it, or with `null` once the timeout passes. Messages sent
   * before anything waits are kept, and each wait takes the oldest one. A
   * message never decides an approval.
   */
  waitForMessage(name: string, options?: WaitForMessageOptions): Promise<ReceivedMessage | null>;

  /**
   * Registers a callback, hands its token to `submitter`, and suspends until
   * whoever holds the token succeeds or fails it. Resolves with the JSON
   * result it succeeded with, or with `null` once the timeout or heartbeat
   * timeout passes. A failure throws `CallbackFailedError` with its type and
   * message.
   */
  waitForCallback(name: string, submitter: CallbackSubmitter, options?: WaitForCallbackOptions): Promise<unknown>;

  /**
   * Records a message that applications list, or receive live by subscribing
   * to the execution. Checkpointed, so a replay never publishes it twice.
   */
  publish(name: string, data?: unknown): Promise<PublishedMessage>;

  /** Runs the same work over every item, each in its own child context. */
  map<TItem, TResult>(
    name: string,
    items: TItem[],
    fn: (item: TItem, ctx: DurableContext, index: number) => Promise<TResult>,
    options?: BatchOptions,
  ): Promise<BatchResult<TResult>>;
  map<TItem, TResult>(
    items: TItem[],
    fn: (item: TItem, ctx: DurableContext, index: number) => Promise<TResult>,
    options?: BatchOptions,
  ): Promise<BatchResult<TResult>>;

  /** Runs different branches at the same time, each in its own child context. */
  parallel<TResult>(
    name: string,
    branches: (((ctx: DurableContext) => Promise<TResult>) | ParallelBranch<TResult>)[],
    options?: BatchOptions,
  ): Promise<BatchResult<TResult>>;
  parallel<TResult>(
    branches: (((ctx: DurableContext) => Promise<TResult>) | ParallelBranch<TResult>)[],
    options?: BatchOptions,
  ): Promise<BatchResult<TResult>>;
}

export interface DurableOptions {
  /** Replaces the default logger behind `ctx.log`. */
  logger?: DurableLog;
}

export type DurableHandler<TInput = unknown, TResult = unknown> = (
  input: TInput,
  ctx: DurableContext,
) => Promise<TResult>;
