import { expect, jest, test } from '@jest/globals';
import {
  type AuthAccountHost,
  cancelEmailChange,
  confirmEmail,
  confirmEmailChange,
  convertAnonymous,
  forgotPassword,
  getSession,
  getUser,
  onAuthStateChange,
  requestEmailChange,
  resendConfirmation,
  resetPassword,
  setSession,
  signIn,
  signInAnonymously,
  signUp,
  updateUser,
} from '../src/auth-account.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import { VolcanoAuth } from '../src/index.js';

const user = { id: 'user-1', email: 'user@example.com', status: 'active' } as const;
const credentials = { email: 'user@example.com', password: 'password' };
const context = {
  generation: 0,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: 'access',
  refreshToken: 'refresh',
};

test('a new client starts with no auth-state subscribers', () => {
  const client = new VolcanoAuth({ anonKey: 'ak-test' });

  expect(Reflect.get(client, '_authCallbacks')).toEqual([]);
});

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
  const signInSpy = jest.fn<AuthAccountHost['signIn']>(() =>
    Promise.resolve({ user, session: null, error: null }),
  );
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

test('signup sends account metadata and signs in only when confirmation is unnecessary', async () => {
  const host = fixture();
  const calls: { path: string; options: RequestInit }[] = [];
  const signInSpy = jest.fn<AuthAccountHost['signIn']>(() =>
    Promise.resolve({ user, session: null, error: null }),
  );
  host.signIn = signInSpy;
  host._anonFetch = (path, options) => {
    calls.push({ path, options });
    return Promise.resolve({
      ok: true,
      status: 200,
      data: { confirmation_required: false, message: 'created' },
      error: null,
    });
  };

  expect(
    await signUp(host, {
      ...credentials,
      metadata: { plan: 'pro' },
      signInWhenAllowed: true,
    }),
  ).toEqual({ user, session: null, confirmationRequired: false, message: 'created', error: null });
  expect(signInSpy).toHaveBeenCalledWith(credentials);
  expect(calls).toEqual([
    {
      path: '/auth/signup',
      options: {
        method: 'POST',
        body: JSON.stringify({ ...credentials, user_metadata: { plan: 'pro' } }),
      },
    },
  ]);
});

test('signup failure reports no confirmation or session and never signs in', async () => {
  const host = fixture();
  const failure = new Error('signup rejected');
  const signInSpy = jest.fn<AuthAccountHost['signIn']>();
  host.signIn = signInSpy;
  host._anonFetch = () => Promise.resolve({ ok: false, status: 400, data: null, error: failure });

  expect(await signUp(host, { ...credentials, signInWhenAllowed: true })).toEqual({
    user: null,
    session: null,
    confirmationRequired: false,
    message: null,
    error: failure,
  });
  expect(signInSpy).not.toHaveBeenCalled();
});

test('sign-in sends exact credentials and adopts the returned session generation', async () => {
  const host = fixture();
  host._sessionGeneration = 4;
  const transport = jest.fn(host._transport.authSignin);
  const adopt = jest.fn<AuthAccountHost['_setSession']>(() => true);
  host._transport.authSignin = transport;
  host._setSession = adopt;

  const result = await signIn(host, credentials);

  expect(transport).toHaveBeenCalledWith(credentials, {});
  expect(adopt).toHaveBeenCalledWith(
    expect.objectContaining({ access_token: 'access', refresh_token: 'refresh', user }),
    4,
  );
  expect(result).toEqual({
    user,
    session: { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 },
    error: null,
  });
});

test('getSession returns independent user data and no session without an access token', async () => {
  const host = fixture();
  host.currentUser = { id: 'user-1', metadata: { team: 'Volcano' } };
  host.refreshToken = 'refresh';

  expect(await getSession(host)).toEqual({ data: { session: null }, error: null });
  host.accessToken = '';
  expect(await getSession(host)).toEqual({ data: { session: null }, error: null });
  host.accessToken = 'access';
  const result = await getSession(host);
  expect(result.data.session).toEqual({
    access_token: 'access',
    refresh_token: 'refresh',
    user: { id: 'user-1', metadata: { team: 'Volcano' } },
  });
  expect(result.data.session?.user).not.toBe(host.currentUser);
  host.currentUser = null;
  const withoutUser = await getSession(host);
  expect(withoutUser.data.session?.user).toBeNull();
});

test('setSession adopts only a validated clone', async () => {
  const host = fixture();
  const session = { access_token: 'access', refresh_token: 'refresh', user: { id: 'user-1' } };
  const adopt = jest.fn<AuthAccountHost['_adoptSessionInMemory']>();
  host._adoptSessionInMemory = adopt;

  await setSession(host, session);

  expect(adopt).toHaveBeenCalledWith(session);
  expect(adopt.mock.calls[0]?.[0]).not.toBe(session);
  expect(adopt.mock.calls[0]?.[0].user).not.toBe(session.user);
});

test('setSession rejects an uncloneable session without adopting it', async () => {
  const host = fixture();
  const adopt = jest.fn<AuthAccountHost['_adoptSessionInMemory']>();
  host._adoptSessionInMemory = adopt;
  const cyclic: Record<string, unknown> = {};
  cyclic['self'] = cyclic;

  expect(await setSession(host, cyclic)).toEqual({
    data: { session: null },
    error: new TypeError('Session must be cloneable'),
  });
  expect(adopt).not.toHaveBeenCalled();
});

test('auth callback unsubscription removes only the registered listener', () => {
  const host = fixture();
  const first = jest.fn<(value: unknown) => void>();
  const second = jest.fn<(value: unknown) => void>();
  const unsubscribe = onAuthStateChange(host, first);
  onAuthStateChange(host, second);

  expect(first).toHaveBeenCalledWith(null);
  expect(second).toHaveBeenCalledWith(null);
  unsubscribe();
  expect(host._authCallbacks).toEqual([second]);
});

test('a callback error is logged without aborting subscription', () => {
  const host = fixture();
  const failure = new Error('listener failed');
  const error = jest.spyOn(console, 'error').mockImplementation((message: unknown) => {
    expect(message).toBe('[VolcanoAuth] Error in auth state callback:');
  });

  const unsubscribe = onAuthStateChange(host, () => {
    throw failure;
  });

  expect(error).toHaveBeenCalledWith('[VolcanoAuth] Error in auth state callback:', failure);
  expect(host._authCallbacks).toHaveLength(1);
  unsubscribe();
  error.mockRestore();
});

test('anonymous and email actions send exact public auth requests', async () => {
  const host = fixture();
  const calls: { path: string; options: RequestInit }[] = [];
  const data = {
    access_token: 'access',
    refresh_token: 'refresh',
    user,
    expires_in: 3600,
    message: 'sent',
  };
  host._anonFetch = (path, options) => {
    calls.push({ path, options });
    return Promise.resolve({ ok: true, status: 200, data, error: null });
  };

  expect(await signInAnonymously(host, { team: 'volcano' })).toEqual({
    user,
    session: { access_token: 'access', refresh_token: 'refresh', expires_in: 3600 },
    error: null,
  });
  await confirmEmail(host, 'confirmation');
  await resendConfirmation(host, credentials.email);
  await forgotPassword(host, credentials.email);
  await resetPassword(host, { token: 'reset', newPassword: 'strong-password' });

  expect(calls).toEqual([
    {
      path: '/auth/signup-anonymous',
      options: { method: 'POST', body: JSON.stringify({ user_metadata: { team: 'volcano' } }) },
    },
    { path: '/auth/confirm', options: { method: 'POST', body: '{"token":"confirmation"}' } },
    {
      path: '/auth/resend-confirmation',
      options: { method: 'POST', body: JSON.stringify({ email: credentials.email }) },
    },
    {
      path: '/auth/forgot-password',
      options: { method: 'POST', body: JSON.stringify({ email: credentials.email }) },
    },
    {
      path: '/auth/reset-password',
      options: { method: 'POST', body: '{"token":"reset","new_password":"strong-password"}' },
    },
  ]);
});

test('user and email-change actions send exact authenticated requests', async () => {
  const host = fixture();
  const calls: { path: string; options: RequestInit | undefined }[] = [];
  const data = {
    user,
    message: 'sent',
    new_email: 'new@example.com',
    email_change_token: 'change-token',
  };
  host._authFetchWithContext = (path, options) => {
    calls.push({
      path: typeof path === 'function' ? path() : path,
      options: typeof options === 'function' ? options() : options,
    });
    return Promise.resolve({ result: { ok: true, status: 200, data, error: null }, context });
  };

  expect(await getUser(host)).toEqual({ user, error: null });
  expect(
    await updateUser(host, { password: 'new-password', metadata: { team: 'volcano' } }),
  ).toEqual({
    user,
    error: null,
  });
  expect(await convertAnonymous(host, { ...credentials, metadata: { team: 'volcano' } })).toEqual({
    user,
    error: null,
  });
  expect(await requestEmailChange(host, 'new@example.com')).toEqual({
    message: 'sent',
    newEmail: 'new@example.com',
    emailChangeToken: 'change-token',
    error: null,
  });
  expect(await confirmEmailChange(host, 'change-token')).toEqual({ user, error: null });
  expect(await cancelEmailChange(host)).toEqual({ message: 'sent', error: null });
  expect(calls).toEqual([
    { path: '/auth/user', options: undefined },
    {
      path: '/auth/user',
      options: {
        method: 'PUT',
        body: '{"password":"new-password","user_metadata":{"team":"volcano"}}',
      },
    },
    {
      path: '/auth/user/convert-anonymous',
      options: {
        method: 'POST',
        body: '{"email":"user@example.com","password":"password","user_metadata":{"team":"volcano"}}',
      },
    },
    {
      path: '/auth/user/change-email',
      options: { method: 'POST', body: '{"new_email":"new@example.com"}' },
    },
    {
      path: '/auth/user/confirm-email-change',
      options: { method: 'POST', body: '{"email_change_token":"change-token"}' },
    },
    { path: '/auth/user/cancel-email-change', options: { method: 'DELETE' } },
  ]);
});
