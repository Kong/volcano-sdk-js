/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import {
  type AuthContext,
  type AuthLifecycleHost,
  type RefreshResult,
  refreshSession,
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
  const { host } = fixture(null);
  const exchangeError = new Error('OAuth exchange failed');
  host._oauthExchangeError = exchangeError;

  expect(await refreshSession(host)).toEqual({ session: null, error: exchangeError });
  expect(host._oauthExchangeError).toBeNull();
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
