import { jest } from '@jest/globals';
import { AuthSessionOperations } from '../../src/auth-session.ts';
import type { AuthContext, AuthLifecycleHost, RefreshResult, SignOutResult } from '../../src/auth-session-lifecycle.ts';

export const session = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  user: { id: 'user-1', email: 'user@example.com', status: 'active' } as const,
};

export type RequestResult = Awaited<ReturnType<AuthLifecycleHost['_anonFetch']>>;

export function fixture(refreshToken: string | null = 'refresh'): {
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
