/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import {
  type AuthContext,
  fetchSessionRefresh,
  type RefreshResult,
  refreshSession,
  refreshSessionForContext,
} from '../src/auth-session-lifecycle.ts';
import { fixture, type RequestResult, session } from './support/auth-boundaries-lifecycle-fixtures.ts';

function uninitializedResolver(): never {
  throw new Error('Refresh promise was not initialized');
}

test('refresh returns the pending callback error for a token-only session', async () => {
  const active = fixture();
  await expect(refreshSession(active.host)).resolves.toMatchObject({ error: null });

  const { host } = fixture(null);
  const exchangeError = new Error('OAuth exchange failed');
  host._oauthExchangeError = exchangeError;

  expect(await refreshSession(host)).toEqual({ session: null, error: exchangeError });
  expect(host._oauthExchangeError).toBeNull();

  const empty = fixture('');
  empty.host._oauthExchangeError = exchangeError;
  expect(await refreshSession(empty.host)).toEqual({ session: null, error: exchangeError });
});

test('refresh rejects missing credentials before making a request', async () => {
  const absent = fixture(null);
  await expect(refreshSession(absent.host)).resolves.toEqual({
    session: null,
    error: new Error('No refresh token'),
  });
  await expect(refreshSessionForContext(absent.host, absent.context)).resolves.toEqual({
    session: null,
    error: new Error('No refresh token'),
  });
  expect(Reflect.get(absent.host, '_fetchSessionRefresh')).not.toHaveBeenCalled();
});

test('refresh discards a captured context that no longer owns the client', async () => {
  const { host, context } = fixture();
  host._isAuthContextCurrent = jest.fn(() => false);

  const result = await refreshSessionForContext(host, context);
  expect(result.session).toBeNull();
  expect(result.error?.name).toBe('AuthRefreshDiscardedError');
  expect(Reflect.get(host, '_fetchSessionRefresh')).not.toHaveBeenCalled();
});

test('refresh converts an unexpected nonstandard validation failure into a stable error', async () => {
  const { host, context } = fixture();
  const rejection = new Error('unavailable');
  Object.setPrototypeOf(rejection, null);
  jest.spyOn(context.operations, 'hasVerifiedPair').mockImplementation(() => {
    throw rejection;
  });

  await expect(refreshSessionForContext(host, context)).resolves.toEqual({
    session: null,
    error: new Error('Refresh failed'),
  });
  expect(Reflect.get(host, '_fetchSessionRefresh')).not.toHaveBeenCalled();
});

test('refresh checks the current user rather than a stale captured user ID', async () => {
  const { host, context } = fixture();
  const captured: AuthContext = { ...context, userId: 'stale-user' };
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 200, data: session, error: null } satisfies RequestResult),
  );

  await expect(fetchSessionRefresh(host, captured)).resolves.toMatchObject({ ok: true });
});

test('refresh sends the captured credential in a POST request', async () => {
  const { host, context } = fixture();
  await fetchSessionRefresh(host, context);
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledWith('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: 'refresh' }),
  });
});

test('a non-rate-limit refresh failure does not reverify the old credential pair', async () => {
  const { host, context } = fixture();
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      data: null,
      error: new Error('server failed'),
    } satisfies RequestResult),
  );

  await fetchSessionRefresh(host, context);
  expect(context.operations.hasVerifiedPair('access', 'refresh')).toBe(false);
});

test('a forbidden refresh clears the captured session', async () => {
  const { host, context } = fixture();
  const error = new Error('forbidden');
  host._fetchSessionRefresh = jest.fn(() =>
    Promise.resolve({ ok: false, status: 403, data: null, error } satisfies RefreshResult),
  );

  await expect(refreshSessionForContext(host, context)).resolves.toEqual({ session: null, error });
  expect(Reflect.get(host, '_clearSession')).toHaveBeenCalledWith(context);
  expect(context.operations.refreshClearedSession).toBe(true);
});

test('a refresh completing during sign-out cannot return a usable session', async () => {
  const { host, context } = fixture();
  let complete: (result: RefreshResult) => void = uninitializedResolver;
  const pending = new Promise<RefreshResult>((resolve) => {
    complete = resolve;
  });
  host._fetchSessionRefresh = jest.fn(() => pending);
  const refreshing = refreshSessionForContext(host, context);
  await Promise.resolve();
  const signingOut = context.operations.signOut(() => Promise.resolve({ error: null }));
  complete({ ok: true, status: 200, data: session, error: null });

  const result = await refreshing;
  expect(result.session).toBeNull();
  expect(result.error?.name).toBe('AuthRefreshDiscardedError');
  expect(Reflect.get(host, '_setRefreshedSession')).not.toHaveBeenCalled();
  await signingOut;
});

test('a nonstandard refresh rejection uses a stable error message', async () => {
  const { host, context } = fixture();
  host._fetchSessionRefresh = jest.fn<() => Promise<RefreshResult>>().mockRejectedValue('transport failed');

  await expect(refreshSessionForContext(host, context)).resolves.toEqual({
    session: null,
    error: new Error('Refresh failed'),
  });
});

test('refresh rejects a different user while the captured session still owns the client', async () => {
  const { host, context } = fixture();
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: { ...session, user: { ...session.user, id: 'another-user' } },
      error: null,
    } satisfies RequestResult),
  );

  await expect(fetchSessionRefresh(host, context)).rejects.toThrow('Refreshed session belongs to a different user');
});

test('refresh rejects a token response without an integer lifetime', async () => {
  const { host, context } = fixture();
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: { ...session, expires_in: 1.5 },
      error: null,
    } satisfies RequestResult),
  );

  await expect(fetchSessionRefresh(host, context)).rejects.toThrow('Auth expires_in must be an integer');
});
