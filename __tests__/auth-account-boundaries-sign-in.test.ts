import { expect, jest, test } from '@jest/globals';
import { type AuthAccountHost, signIn, signInAnonymously } from '../src/auth-account.ts';
import { credentials, fixture, user } from './support/auth-boundaries-account-fixtures.ts';

test('sign-in uses anonymous credential scope even when a session exists', async () => {
  const host = fixture();
  host.accessToken = 'existing-session';
  const signin = jest.spyOn(host._transport, 'authSignin');

  await signIn(host, credentials);

  expect(signin).toHaveBeenCalledWith(credentials, { volcanoAuthorization: 'anon' });
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

test('sign-in preserves an omitted cookie refresh token without inventing credentials', async () => {
  const host = fixture();
  const adopt = jest.fn<AuthAccountHost['_setSession']>(() => true);
  host._setSession = adopt;
  host._transport.authSignin = () =>
    Promise.resolve({
      data: {
        access_token: 'cookie-access',
        token_type: 'Bearer',
        expires_in: 3600,
        user,
      },
      status: 200,
      headers: new Headers(),
    });

  expect(await signIn(host, credentials)).toEqual({
    user,
    session: { access_token: 'cookie-access', refresh_token: undefined, expires_in: 3600 },
    error: null,
  });
  expect(adopt).toHaveBeenCalledWith(expect.objectContaining({ access_token: 'cookie-access', user }), 0);
});

test('sign-in rejects a token response without an integer lifetime before adopting it', async () => {
  const host = fixture();
  const adopt = jest.fn<AuthAccountHost['_setSession']>(() => true);
  host._setSession = adopt;
  host._transport.authSignin = () =>
    Promise.resolve({
      data: {
        access_token: 'access',
        refresh_token: 'refresh',
        token_type: 'Bearer',
        expires_in: 1.5,
        user,
      },
      status: 200,
      headers: new Headers(),
    });

  await expect(signIn(host, credentials)).rejects.toThrow('Auth expires_in must be an integer');
  expect(adopt).not.toHaveBeenCalled();
});

test.each([
  [{ access_token: 'access', expires_in: 3600, user }, 'Session refresh_token must be a non-empty string'],
  [{ access_token: 'access', refresh_token: 'refresh', expires_in: 1.5, user }, 'Auth expires_in must be an integer'],
])('anonymous sign-in rejects an incomplete session before adopting it', async (data, message) => {
  const host = fixture();
  const adopt = jest.fn<AuthAccountHost['_setSession']>(() => true);
  host._setSession = adopt;
  host._anonFetch = () => Promise.resolve({ ok: true, status: 200, data, error: null });

  await expect(signInAnonymously(host, {})).rejects.toThrow(message);
  expect(adopt).not.toHaveBeenCalled();
});

test('sign-in sends exact credentials and adopts the returned session generation', async () => {
  const host = fixture();
  host._sessionGeneration = 4;
  const transport = jest.fn(host._transport.authSignin);
  const adopt = jest.fn<AuthAccountHost['_setSession']>(() => true);
  host._transport.authSignin = transport;
  host._setSession = adopt;

  const result = await signIn(host, credentials);

  expect(transport).toHaveBeenCalledWith(credentials, { volcanoAuthorization: 'anon' });
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
