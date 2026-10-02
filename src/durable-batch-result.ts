import { failureDetail } from './durable-failure-detail.ts';
import type { BatchCompletionReason, BatchResult } from './durable-types.ts';

interface EngineBatchItem<Result> {
  index: number;
  status: 'SUCCEEDED' | 'FAILED' | 'STARTED';
  result?: Result;
  error?: unknown;
}

export interface EngineBatch<Result> {
  all: readonly EngineBatchItem<Result>[];
  getResults(): Result[];
  getErrors(): unknown[];
  successCount: number;
  failureCount: number;
  completionReason?: unknown;
  throwIfError(): void;
}

/**
 * In-flight items and the live total can change on replay after early
 * completion. Expose completed items and their count so handlers see the same
 * JSON-safe result when resumed.
 */
export function batchResult<Result>(batch: EngineBatch<Result>): BatchResult<Result> {
  const items = batch.all
    .filter((item) => item.status !== 'STARTED')
    .map((item) => ({
      index: item.index,
      status: item.status === 'SUCCEEDED' ? ('succeeded' as const) : ('failed' as const),
      result: item.result,
      error: item.error === undefined ? undefined : failureDetail(item.error),
    }));

  return {
    items,
    results: batch.getResults(),
    errors: batch.getErrors().map((error) => failureDetail(error)),
    succeeded: batch.successCount,
    failed: batch.failureCount,
    completed: batch.successCount + batch.failureCount,
    completionReason: completionReason(batch),
    throwIfFailed(): void {
      batch.throwIfError();
    },
  };
}

const completionReasons = new Map<unknown, BatchCompletionReason>([
  ['ALL_COMPLETED', 'all_completed'],
  ['MIN_SUCCESSFUL_REACHED', 'min_successful_reached'],
  ['FAILURE_TOLERANCE_EXCEEDED', 'failure_tolerance_exceeded'],
  ['CUSTOM_COMPLETION_SUCCEEDED', 'custom_completion_succeeded'],
  ['CUSTOM_COMPLETION_FAILED', 'custom_completion_failed'],
]);

function completionReason(batch: EngineBatch<unknown>): BatchCompletionReason | undefined {
  return completionReasons.get(batch.completionReason);
}
