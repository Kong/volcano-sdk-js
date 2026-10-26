import { jest } from '@jest/globals';
import type { AuthAccountHost } from '../../src/auth-account.ts';
import { AuthSessionOperations } from '../../src/auth-session.ts';
import type { RefreshResult, SignOutResult } from '../../src/auth-session-lifecycle.ts';

export const user = { id: 'user-1', email: 'user@example.com', status: 'active' } as const;
export const credentials = { email: 'user@example.com', password: 'password' };
export const context = {
  generation: 0,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: 'access',
  refreshToken: 'refresh',
};

export function fixture(): AuthAccountHost {
  return {
    _sessionGeneration: 0,
    _pendingUrlAuthNotify: false,
    currentUser: null,
    accessToken: null,
    refreshToken: null,
    _authCallbacks: [],
    _transport: {
      authSignin: () =>
        Promise.resolve({
          data: {
            access_token: 'access',
            refresh_token: 'refresh',
            token_type: 'Bearer',
            expires_in: 3600,
            user,
          },
          status: 200,
          headers: new Headers(),
        }),
    },
    _generatedOptions: (mode) => ({ volcanoAuthorization: mode }),
    _anonFetch: () => Promise.resolve({ ok: true, status: 200, data: {}, error: null }),
    _authFetchWithContext: () =>
      Promise.resolve({
        result: { ok: true, status: 200, data: { user }, error: null },
        context,
      }),
    _setSession: () => true,
    _adoptSessionInMemory: jest.fn<AuthAccountHost['_adoptSessionInMemory']>(),
    _consumeSessionFromUrl: () => false,
    _isAuthContextCurrent: () => true,
    _notifyAuthCallbacks: jest.fn<AuthAccountHost['_notifyAuthCallbacks']>(),
    signIn: () => Promise.resolve({ user, session: null, error: null }),
    signInAnonymously: () => Promise.resolve({ user, session: null, error: null }),
    forgotPassword: () => Promise.resolve({ message: null, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
  };
}
