import { failureDetail } from './durable-failure-detail.ts';

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

interface FlattenedBatchResult<Result> {
  items: {
    index: number;
    status: string;
    result: Result | undefined;
    error: ReturnType<typeof failureDetail> | undefined;
  }[];
  results: Result[];
  errors: ReturnType<typeof failureDetail>[];
  succeeded: number;
  failed: number;
  completed: number;
  completionReason: string | undefined;
  throwIfFailed(): void;
}

/**
 * In-flight items and the live total can change on replay after early
 * completion. Expose completed items and their count so handlers see the same
 * JSON-safe result when resumed.
 */
export function batchResult<Result>(batch: EngineBatch<Result>): FlattenedBatchResult<Result> {
  const items = batch.all
    .filter((item) => item.status !== 'STARTED')
    .map((item) => ({
      index: item.index,
      status: item.status.toLowerCase(),
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

function completionReason(batch: EngineBatch<unknown>): string | undefined {
  return typeof batch.completionReason === 'string'
    ? batch.completionReason.toLowerCase()
    : undefined;
}
