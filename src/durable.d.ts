/**
 * Volcano SDK - Durable function authoring type definitions
 */

/**
 * A duration: `'30s'`, `'5m'`, `'2h'`, `'1d'`, a compound string like `'1m30s'`,
 * a number of seconds, or the explicit form.
 *
 * Whole seconds only. There is no millisecond unit, and a fraction is refused
 * rather than rounded: the platform holds a wait between invocations.
 */
export type DurableDuration =
  | string
  | number
  | { days?: number; hours?: number; minutes?: number; seconds?: number };

/** What a retry strategy decides after an attempt fails. */
export type RetryDecision =
  | { shouldRetry: false }
  | {
      shouldRetry: true;
      delay: { days?: number; hours?: number; minutes?: number; seconds?: number };
    };

export interface RetryOptions {
  /** Total attempts, including the first. Defaults to 3. */
  attempts?: number;
  /** Delay before the first retry. Defaults to 5 seconds. */
  initialDelay?: DurableDuration;
  /** Ceiling for the backoff delay. Defaults to 5 minutes. */
  maxDelay?: DurableDuration;
  /** Multiplier applied to the delay after each attempt. Defaults to 2. */
  backoffRate?: number;
  /** Retry only errors whose message matches one of these. */
  retryOn?: (string | RegExp)[];
  /** Retry only errors of these types. */
  retryOnTypes?: (new (...args: never[]) => Error)[];
}

/**
 * `false` fails on the first error; an options object configures backoff; a
 * function decides per attempt. Unset means the platform's default retry: 6
 * attempts, 5 seconds apart doubling to a minute, with the delays jittered.
 */
export type Retry = false | RetryOptions | ((error: Error, attempt: number) => RetryDecision);

export interface DurableLog {
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, error?: unknown, data?: Record<string, unknown>): void;
  debug(message: string, data?: Record<string, unknown>): void;
}

/** What a step's function is given: logging, and which attempt it is on. */
export interface DurableStepScope {
  log: DurableLog;
  /** 1 on the first attempt. */
  attempt: number;
}

export interface StepOptions {
  retry?: Retry;
  /**
   * Checkpoint before running rather than after, so an attempt interrupted
   * mid-flight is not repeated on replay. Use it for work that must not run
   * twice within an attempt, and pair it with `retry: false` to make that
   * hold across attempts too.
   */
  atMostOnce?: boolean;
}

export interface WaitUntilOptions<TState> {
  /** Stop waiting once this returns true for the state the check returned. */
  until: (state: TState) => boolean;
  /** The state the first check receives. Required: the wait starts by asking
   *  `until` about it. */
  initialState: TState;
  /** Delay before the second check. Defaults to 5 seconds. */
  interval?: DurableDuration;
  /** Ceiling for the backoff delay between checks. Defaults to 5 minutes. */
  maxInterval?: DurableDuration;
  /** Multiplier applied to the delay after each check. Defaults to 1.5. */
  backoffRate?: number;
  /**
   * How many times to check before giving up. Defaults to 60, and running out
   * fails the execution rather than returning the last state. A condition is
   * bounded by checks, not by a deadline: the platform holds the wait between
   * them and has no clock to compare against when it resumes.
   */
  maxAttempts?: number;
}

export interface BatchOptions {
  /** How many items or branches run at once. Unlimited by default. */
  concurrency?: number;
  /** Finish as soon as this many items have succeeded. */
  minSucceeded?: number;
}

/** Why a batch ended, which is the same on a replay as it was live. */
export type BatchCompletionReason =
  | 'all_completed'
  | 'min_successful_reached'
  | 'failure_tolerance_exceeded'
  | 'custom_completion_succeeded'
  | 'custom_completion_failed';

/**
 * A failure as data rather than as an `Error`, so it survives
 * `JSON.stringify`. `type` and `data` are the platform's own classification,
 * present when it has one.
 */
export interface BatchFailure {
  name: string;
  message: string;
  type?: string;
  data?: string;
}

export interface BatchItem<TResult> {
  index: number;
  status: 'succeeded' | 'failed';
  result?: TResult;
  error?: BatchFailure;
}

export interface BatchResult<TResult> {
  /**
   * The items that finished, in input order.
   *
   * A batch that ends early leaves items in flight, and those are left out:
   * whether they come back at all after a replay is not guaranteed, so branching
   * on them would make the handler take a different path the second time
   * through. `completionReason` is how to tell that the batch ended early.
   */
  items: BatchItem<TResult>[];
  /** The results of the items that succeeded, so not aligned with the input when some failed. */
  results: TResult[];
  errors: BatchFailure[];
  succeeded: number;
  failed: number;
  /** How many items finished, which is `succeeded + failed`. */
  completed: number;
  completionReason?: BatchCompletionReason;
  /** Throws the first failure, if there was one. */
  throwIfFailed(): void;
}

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
  step<TResult>(
    fn: (scope: DurableStepScope) => Promise<TResult>,
    options?: StepOptions,
  ): Promise<TResult>;

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

/**
 * Wraps a handler so Volcano runs it as a durable execution.
 *
 * @example
 * ```javascript
 * const { durable } = require('@volcano.dev/sdk/durable');
 *
 * exports.handler = durable(async (input, ctx) => {
 *   const charge = await ctx.step('charge', () => chargeCard(input.order_id));
 *   await ctx.wait('settle', '30s');
 *   return { charged: charge.id };
 * });
 * ```
 */
export declare function durable<TInput = unknown, TResult = unknown>(
  handler: DurableHandler<TInput, TResult>,
  options?: DurableOptions,
): (event: unknown, functionContext: unknown) => Promise<unknown>;

/** Thrown on the first invocation when the durable runtime is not installed. */
export declare class DurableRuntimeMissingError extends Error {
  name: 'DurableRuntimeMissingError';
  cause?: unknown;
}
