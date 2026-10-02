import { expect, test } from '@jest/globals';
import { failureDetail } from '../src/durable-failure-detail.ts';

class EngineError extends Error {
  errorType: unknown = undefined;
  errorData: unknown = undefined;
}

test('turns non-error failures into printable data', () => {
  expect(failureDetail(null)).toEqual({ name: 'Error', message: 'null' });
  expect(failureDetail(503)).toEqual({ name: 'Error', message: '503' });
});

test('copies error fields that JSON serialization would otherwise drop', () => {
  const error = new EngineError('request failed');
  error.name = 'RetryError';
  error.errorType = 'Retryable';
  error.errorData = { requestId: 'req-1' };
  expect(failureDetail(error)).toEqual({
    name: 'RetryError',
    message: 'request failed',
    type: 'Retryable',
    data: { requestId: 'req-1' },
  });
  expect(JSON.stringify(failureDetail(error))).toBe(
    '{"name":"RetryError","message":"request failed","type":"Retryable","data":{"requestId":"req-1"}}',
  );
});

test('omits missing and explicitly undefined engine metadata', () => {
  expect(failureDetail(new Error('plain'))).toStrictEqual({ name: 'Error', message: 'plain' });
  expect(failureDetail(new EngineError('empty'))).toStrictEqual({
    name: 'Error',
    message: 'empty',
  });
});
