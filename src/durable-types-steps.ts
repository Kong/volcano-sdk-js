/**
 * A duration: `'30s'`, `'5m'`, `'2h'`, `'1d'`, a compound string like `'1m30s'`,
 * a number of seconds, or the explicit form.
 *
 * Whole seconds only. There is no millisecond unit, and a fraction is refused
 * rather than rounded: the platform holds a wait between invocations.
 */
export type DurableDuration = string | number | { days?: number; hours?: number; minutes?: number; seconds?: number };

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
