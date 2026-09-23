import { expect, jest, test } from '@jest/globals';
import { type AuthAccountHost, getUser, signIn, signUp } from '../src/auth-account.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';

const user = { id: 'user-1', email: 'user@example.com', status: 'active' } as const;
const credentials = { email: 'user@example.com', password: 'password' };
const context = {
  generation: 0,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: 'access',
  refreshToken: 'refresh',
};

function fixture(): AuthAccountHost {
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
    _generatedOptions: () => ({}),
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

test('signup with required confirmation never signs in and preserves absent message', async () => {
  const host = fixture();
  const signInSpy = jest.fn(() => Promise.resolve({ user, session: null, error: null }));
  host.signIn = signInSpy;
  host._anonFetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: { confirmation_required: true },
      error: null,
    });

  expect(await signUp(host, { ...credentials, signInWhenAllowed: true })).toEqual({
    user: null,
    session: null,
    confirmationRequired: true,
    message: null,
    error: null,
  });
  expect(signInSpy).not.toHaveBeenCalled();
});

test('sign-in normalizes a primitive transport rejection', async () => {
  const host = fixture();
  host._transport.authSignin = jest
    .fn<AuthAccountHost['_transport']['authSignin']>()
    .mockRejectedValue('network failed');

  expect(await signIn(host, credentials)).toEqual({
    user: null,
    session: null,
    error: new Error('Sign in failed'),
  });
});

test('sign-in refuses a successful custom transport without a session payload', async () => {
  const host = fixture();
  host._transport.authSignin = () =>
    Promise.resolve({
      data: undefined,
      status: 400,
      headers: new Headers(),
    });

  await expect(signIn(host, credentials)).rejects.toThrow('Sign in returned no session');
});

test('getUser rejects a malformed successful response before adopting a user', async () => {
  const host = fixture();
  host._authFetchWithContext = () =>
    Promise.resolve({
      result: { ok: true, status: 200, data: null, error: null },
      context,
    });
  const notify = jest.fn();
  host._notifyAuthCallbacks = notify;

  await expect(getUser(host)).rejects.toThrow('Auth response must be an object');
  expect(notify).not.toHaveBeenCalled();
});
