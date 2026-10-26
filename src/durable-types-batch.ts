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
  type?: unknown;
  data?: unknown;
}

export interface BatchItem<TResult> {
  index: number;
  status: 'succeeded' | 'failed';
  result?: TResult | undefined;
  error?: BatchFailure | undefined;
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
  completionReason?: BatchCompletionReason | undefined;
  /** Throws the first failure, if there was one. */
  throwIfFailed(): void;
}
