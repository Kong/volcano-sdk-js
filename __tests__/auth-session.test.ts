/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';

const pair = { access_token: 'access', refresh_token: 'refresh' };

function uninitializedResolver(): never {
  throw new Error('Promise executor did not initialize');
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = uninitializedResolver;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

test('starts without verified credentials or pending operations', () => {
  const operations = new AuthSessionOperations();
  expect(operations.verifiedPair).toBeNull();
  expect(operations.hasVerifiedPair('access', 'refresh')).toBe(false);
  expect(operations.pendingSignOut()).toBeNull();
  expect(operations.refreshClearedSession).toBe(false);
});

test.each([
  ['access', 'refresh', true],
  ['other', 'refresh', false],
  ['access', 'other', false],
  ['access', '', false],
  ['access', null, false],
  [null, 'refresh', false],
])('checks the exact verified credential pair: %s, %s', (access, refresh, matches) => {
  const operations = new AuthSessionOperations(pair);
  expect(operations.hasVerifiedPair(access, refresh)).toBe(matches);
});

test.each([null, ''])(
  'does not verify absent refresh credentials even when the stored pair matches: %p',
  (refreshToken) => {
    const operations = new AuthSessionOperations({
      access_token: 'access',
      refresh_token: refreshToken,
    });
    expect(operations.hasVerifiedPair('access', refreshToken)).toBe(false);
  },
);

test('replaces and clears a verified pair', () => {
  const operations = new AuthSessionOperations(pair);
  operations.verifyPair({ access_token: 'new-access', refresh_token: 'new-refresh' });
  expect(operations.hasVerifiedPair('access', 'refresh')).toBe(false);
  expect(operations.hasVerifiedPair('new-access', 'new-refresh')).toBe(true);
  operations.verifyPair(null);
  expect(operations.hasVerifiedPair('new-access', 'new-refresh')).toBe(false);
});

test('local clearing cannot be undone by a stale verification or refresh', () => {
  const operations = new AuthSessionOperations(pair);
  const refresh = jest.fn<() => Promise<string>>().mockResolvedValue('stale');
  operations.clearLocalCredentials();
  operations.verifyPair(pair);
  expect(operations.hasVerifiedPair('access', 'refresh')).toBe(false);
  expect(operations.refresh(refresh)).toBeNull();
  expect(refresh).not.toHaveBeenCalled();
});

test('concurrent refreshes share an operation and allow a later refresh', async () => {
  const operations = new AuthSessionOperations<string, string>();
  const result = deferred<string>();
  const refresh = jest.fn<() => Promise<string>>().mockReturnValueOnce(result.promise);
  const first = operations.refresh(refresh);
  expect(operations.refresh(refresh)).toBe(first);
  await Promise.resolve();
  expect(refresh).toHaveBeenCalledTimes(1);
  result.resolve('first');
  await expect(first).resolves.toBe('first');
  refresh.mockResolvedValue('second');
  await expect(operations.refresh(refresh)).resolves.toBe('second');
  expect(refresh).toHaveBeenCalledTimes(2);
});

test('a rejected refresh is cleared so the caller can retry', async () => {
  const operations = new AuthSessionOperations<string, string>();
  const failure = new Error('refresh failed');
  const refresh = jest
    .fn<() => Promise<string>>()
    .mockRejectedValueOnce(failure)
    .mockResolvedValue('retry');
  await expect(operations.refresh(refresh)).rejects.toBe(failure);
  await expect(operations.refresh(refresh)).resolves.toBe('retry');
});

test('sign-out captures the pending refresh and blocks subsequent refreshes', async () => {
  const operations = new AuthSessionOperations<string, string>(pair);
  const result = deferred<string>();
  const refresh = jest.fn<() => Promise<string>>().mockReturnValue(result.promise);
  const refreshing = operations.refresh(refresh);
  const signOut = jest.fn<(pending: Promise<string> | null) => Promise<string>>(
    async (pending) => `signed out ${String(await pending)}`,
  );
  const first = operations.signOut(signOut);
  expect(operations.signOut(signOut)).toBe(first);
  expect(operations.pendingSignOut()).toBe(first);
  expect(operations.refresh(refresh)).toBeNull();
  operations.clearLocalCredentials();
  expect(operations.hasVerifiedPair('access', 'refresh')).toBe(true);
  result.resolve('refreshed');
  await expect(first).resolves.toBe('signed out refreshed');
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledWith(refreshing);
  expect(operations.pendingSignOut()).toBeNull();
  expect(operations.hasVerifiedPair('access', 'refresh')).toBe(false);
  expect(operations.refresh(refresh)).toBeNull();
});

test('a rejected sign-out still settles and remains idempotent', async () => {
  const operations = new AuthSessionOperations<string, string>(pair);
  const failure = new Error('sign-out failed');
  const signOut = jest
    .fn<(pending: Promise<string> | null) => Promise<string>>()
    .mockRejectedValue(failure);
  const first = operations.signOut(signOut);
  await expect(first).rejects.toBe(failure);
  expect(signOut).toHaveBeenCalledTimes(1);
  expect(signOut).toHaveBeenCalledWith(null);
  expect(operations.pendingSignOut()).toBeNull();
  expect(operations.hasVerifiedPair('access', 'refresh')).toBe(false);
  const repeated = operations.signOut(signOut);
  await expect(repeated).rejects.toBe(failure);
  expect(repeated).toBe(first);
  expect(signOut).toHaveBeenCalledTimes(1);
});
