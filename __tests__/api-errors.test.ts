/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { apiRequestError, errorResult } from '../src/api-errors.ts';

test('keeps an existing error and spreads result metadata', () => {
  const cause = new Error('database unavailable');
  expect(errorResult(cause, { count: 0 })).toEqual({ data: null, error: cause, count: 0 });
  expect(errorResult('database unavailable')).toEqual({ data: null, error: cause });
});

test('reads validated response metadata from a failed request', () => {
  const error = apiRequestError(
    { status: 429, headers: { get: () => '12' } },
    { error: 'Rate limited', code: 'rate_limited' },
  );
  expect(error).toMatchObject({
    message: 'Rate limited',
    status: 429,
    code: 'rate_limited',
    retryAfter: 12,
  });
});

test.each([null, undefined, 0, '', {}, { error: '' }, { error: null }])(
  'uses a safe default message for %p',
  (data) => {
    expect(apiRequestError({ status: 400 }, data).message).toBe('Request failed');
  },
);

test('rejects a non-string JSON error and honors an explicit message', () => {
  expect(apiRequestError({ status: 400 }, { error: 42 }).message).toBe('Request failed');
  expect(apiRequestError({ status: 401 }, { error: 'No' }, 'Session expired').message).toBe(
    'Session expired',
  );
});

test.each([{}, { code: '' }, { code: 42 }, { code: null }])(
  'ignores non-string or empty error codes: %p',
  (data) => {
    expect(apiRequestError({ status: 400 }, data).code).toBeUndefined();
  },
);

test.each(['not-a-delay', '', 4, null])('ignores invalid retry-after metadata: %p', (header) => {
  const error = apiRequestError({ status: 429, headers: { get: () => header } }, null);
  expect(error.retryAfter).toBeUndefined();
});
