import { expect, jest, test } from '@jest/globals';
import {
  type AuthAccountHost,
  confirmEmail,
  forgotPassword,
  resendConfirmation,
  resetPassword,
  signInAnonymously,
  signUp,
} from '../src/auth-account.ts';
import { credentials, fixture, user } from './support/auth-boundaries-account-fixtures.ts';

test('signup with required confirmation never signs in and preserves absent message', async () => {
  const host = fixture();
  const signInSpy = jest.fn<AuthAccountHost['signIn']>(() => Promise.resolve({ user, session: null, error: null }));
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

test('signup sends account metadata and signs in only when confirmation is unnecessary', async () => {
  const host = fixture();
  const calls: { path: string; options: RequestInit }[] = [];
  const signInSpy = jest.fn<AuthAccountHost['signIn']>(() => Promise.resolve({ user, session: null, error: null }));
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

test('signup refuses a malformed acknowledgement instead of coercing confirmation', async () => {
  const host = fixture();
  host._anonFetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: { confirmation_required: 'false', message: 'created' },
      error: null,
    });

  await expect(signUp(host, credentials)).rejects.toThrow('Auth response confirmation_required must be a boolean');
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

test('message endpoints reject non-string acknowledgements', async () => {
  const host = fixture();
  host._anonFetch = () => Promise.resolve({ ok: true, status: 200, data: { message: 123 }, error: null });

  await expect(confirmEmail(host, 'confirmation')).rejects.toThrow('Auth response message must be a string');
});
