/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import {
  type AuthContext,
  type AuthLifecycleHost,
  fetchSessionRefresh,
  type RefreshResult,
  refreshSession,
  refreshSessionForContext,
  revokeAccessSession,
  signOutCaptured,
  type SignOutResult,
} from '../src/auth-session-lifecycle.ts';

const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  user: { id: 'user-1', email: 'user@example.com', status: 'active' } as const,
};

type RequestResult = Awaited<ReturnType<AuthLifecycleHost['_anonFetch']>>;

function uninitializedResolver(): never {
  throw new Error('Refresh promise was not initialized');
}

function fixture(refreshToken: string | null = 'refresh'): {
  host: AuthLifecycleHost;
  context: AuthContext;
} {
  const operations = new AuthSessionOperations<RefreshResult, SignOutResult>(session);
  const context: AuthContext = {
    generation: 0,
    operations,
    userId: 'user-1',
    accessToken: 'access',
    refreshToken,
  };
  const host: AuthLifecycleHost = {
    refreshToken,
    currentUser: session.user,
    _oauthExchangeError: null,
    _oauthExchangePromise: null,
    _completeOAuthExchange: jest.fn(() => Promise.resolve()),
    _captureAuthContext: jest.fn(() => context),
    _isAuthContextCurrent: jest.fn(() => true),
    _anonFetch: jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        data: null,
        error: new Error('unauthorized'),
      } satisfies RequestResult),
    ),
    _fetchSessionRefresh: jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        data: session,
        error: null,
      } satisfies RefreshResult),
    ),
    _setRefreshedSession: jest.fn(() => true),
    _clearSession: jest.fn(() => true),
    _clearSessionAtGeneration: jest.fn(() => true),
  };
  return { host, context };
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

test('sign-out normalizes a rejected concurrent refresh and still clears the session', async () => {
  const { host, context } = fixture();
  context.operations.verifyPair(null);
  const failedRefresh = jest
    .fn<() => Promise<RefreshResult>>()
    .mockRejectedValue('transport failed');

  expect(await signOutCaptured(host, context, failedRefresh())).toEqual({
    error: new Error('Session revocation failed'),
  });
  expect(Reflect.get(host, '_clearSession')).toHaveBeenCalledWith(context);
  expect(Reflect.get(host, '_anonFetch')).not.toHaveBeenCalled();
});

test('sign-out accepts a completed preceding refresh even when its old pair is unverified', async () => {
  const { host, context } = fixture();
  context.operations.verifyPair(null);
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204, data: null, error: null } satisfies RequestResult),
  );

  await expect(
    signOutCaptured(
      host,
      context,
      Promise.resolve({ ok: true, status: 200, data: session, error: null }),
    ),
  ).resolves.toEqual({ error: null });
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledWith('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: 'refresh' }),
  });
});

test('sign-out clears a session ID by generation without clearing a replacement session', async () => {
  const { host, context } = fixture();
  const accessToken = `x.${Buffer.from(JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000001' })).toString('base64url')}.x`;
  const captured: AuthContext = { ...context, accessToken };
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204, data: null, error: null } satisfies RequestResult),
  );

  await expect(signOutCaptured(host, captured, null)).resolves.toEqual({ error: null });
  expect(Reflect.get(host, '_clearSessionAtGeneration')).toHaveBeenCalledWith(context.generation);
  expect(Reflect.get(host, '_clearSession')).not.toHaveBeenCalled();
});

test('a stale sign-out retains the revocation error as a writable cause', async () => {
  const { host, context } = fixture();
  const revocationError = new Error('revoke failed');
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 500,
      data: null,
      error: revocationError,
    } satisfies RequestResult),
  );
  host._clearSession = jest.fn(() => false);

  const result = await signOutCaptured(host, context, null);
  expect(result.error?.name).toBe('AuthSessionChangedError');
  expect(Object.getOwnPropertyDescriptor(result.error, 'cause')).toEqual({
    configurable: true,
    enumerable: false,
    value: revocationError,
    writable: true,
  });
});

test('a stale sign-out without revocation error has no cause', async () => {
  const { host, context } = fixture();
  host._anonFetch = jest.fn(() =>
    Promise.resolve({ ok: true, status: 204, data: null, error: null } satisfies RequestResult),
  );
  host._clearSession = jest.fn(() => false);

  const result = await signOutCaptured(host, context, null);
  expect(result.error?.name).toBe('AuthSessionChangedError');
  if (result.error === null) {
    throw new Error('Expected a stale session error');
  }
  expect(Object.hasOwn(result.error, 'cause')).toBe(false);
});

test('sign-out normalizes a nonstandard failure retained from an in-flight refresh', async () => {
  const { host, context } = fixture();
  const accessToken = `x.${Buffer.from(JSON.stringify({ session_id: '00000000-0000-4000-8000-000000000001' })).toString('base64url')}.x`;
  const captured: AuthContext = { ...context, accessToken };
  captured.operations.verifyPair(null);
  const rejection = new Error('transport failed');
  Object.setPrototypeOf(rejection, null);

  await expect(signOutCaptured(host, captured, Promise.reject(rejection))).resolves.toEqual({
    error: new Error('Sign out failed'),
  });
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledTimes(1);
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
  host._fetchSessionRefresh = jest
    .fn<() => Promise<RefreshResult>>()
    .mockRejectedValue('transport failed');

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

  await expect(fetchSessionRefresh(host, context)).rejects.toThrow(
    'Refreshed session belongs to a different user',
  );
});

test('access-session revocation reports a failed refresh after an unauthorized delete', async () => {
  const { host, context } = fixture();
  const refreshError = new Error('refresh denied');
  host._fetchSessionRefresh = jest.fn(() =>
    Promise.resolve<RefreshResult>({ ok: false, status: 403, data: null, error: refreshError }),
  );

  expect(await revokeAccessSession(host, context, 'session-1', null)).toBe(refreshError);
  expect(Reflect.get(host, '_anonFetch')).toHaveBeenCalledTimes(1);
});

test('access-session revocation keeps the delete failure after a preceding refresh', async () => {
  const { host, context } = fixture();
  const deleteError = new Error('delete unauthorized');
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      data: null,
      error: deleteError,
    } satisfies RequestResult),
  );
  const preceding: RefreshResult = { ok: true, status: 200, data: session, error: null };

  expect(await revokeAccessSession(host, context, 'session-1', preceding)).toBe(deleteError);
  expect(Reflect.get(host, '_fetchSessionRefresh')).not.toHaveBeenCalled();
});

test('access-session revocation falls back to the delete error for an empty prior error', async () => {
  const { host, context } = fixture();
  const deleteError = new Error('delete unauthorized');
  host._anonFetch = jest.fn(() =>
    Promise.resolve({
      ok: false,
      status: 401,
      data: null,
      error: deleteError,
    } satisfies RequestResult),
  );
  const preceding = { ok: false, error: null } satisfies Parameters<typeof revokeAccessSession>[3];

  expect(await revokeAccessSession(host, context, 'session-1', preceding)).toBe(deleteError);
});
