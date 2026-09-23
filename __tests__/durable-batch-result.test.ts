/** @jest-environment node */
import { expect, jest, test } from '@jest/globals';
import { batchResult, type EngineBatch } from '../src/durable-batch-result.ts';

test('keeps completed results stable across early-completion replay', () => {
  const throwIfError = jest.fn();
  const batch: EngineBatch<string> = {
    all: [
      { index: 0, status: 'SUCCEEDED', result: 'a' },
      { index: 1, status: 'FAILED', error: new Error('could not ship') },
      { index: 2, status: 'STARTED' },
    ],
    getResults: () => ['a'],
    getErrors: () => [new Error('could not ship')],
    successCount: 1,
    failureCount: 1,
    completionReason: 'MIN_SUCCESSFUL_REACHED',
    throwIfError,
  };

  const result = batchResult(batch);

  expect(result.items).toEqual([
    { index: 0, status: 'succeeded', result: 'a', error: undefined },
    {
      index: 1,
      status: 'failed',
      result: undefined,
      error: { name: 'Error', message: 'could not ship' },
    },
  ]);
  expect(result.results).toEqual(['a']);
  expect(result.errors).toEqual([{ name: 'Error', message: 'could not ship' }]);
  expect(result.completed).toBe(2);
  expect(result.completionReason).toBe('min_successful_reached');
  result.throwIfFailed();
  expect(throwIfError).toHaveBeenCalledTimes(1);
});

test('omits a non-string completion reason', () => {
  const batch: EngineBatch<never> = {
    all: [],
    getResults: () => [],
    getErrors: () => [],
    successCount: 0,
    failureCount: 0,
    completionReason: null,
    throwIfError: jest.fn(),
  };

  expect(batchResult(batch).completionReason).toBeUndefined();
});
