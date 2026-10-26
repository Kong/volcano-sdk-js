import { expect, jest, test } from '@jest/globals';
import { type AuthAccountHost, getSession, onAuthStateChange, setSession } from '../src/auth-account.ts';
import { VolcanoAuth } from '../src/index.ts';
import { fixture, user } from './support/auth-boundaries-account-fixtures.ts';

test('a new client starts with no auth-state subscribers', () => {
  const client = new VolcanoAuth({ anonKey: 'ak-test' });

  expect(Reflect.get(client, '_authCallbacks')).toEqual([]);
});

test('getSession returns independent user data and no session without an access token', async () => {
  const host = fixture();
  host.currentUser = { ...user, user_metadata: { team: 'Volcano' } };
  host.refreshToken = 'refresh';

  expect(await getSession(host)).toEqual({ data: { session: null }, error: null });
  host.accessToken = '';
  expect(await getSession(host)).toEqual({ data: { session: null }, error: null });
  host.accessToken = 'access';
  const result = await getSession(host);
  expect(result.data.session).toEqual({
    access_token: 'access',
    refresh_token: 'refresh',
    user: { ...user, user_metadata: { team: 'Volcano' } },
  });
  expect(result.data.session?.user).not.toBe(host.currentUser);
  host.currentUser = null;
  const withoutUser = await getSession(host);
  expect(withoutUser.data.session?.user).toBeNull();
});

test('getSession rejects corrupted in-memory user data before exposing it', () => {
  const host = fixture();
  host.accessToken = 'access';
  Reflect.set(host, 'currentUser', { id: 'user-1', email: 'user@example.com', status: null });

  expect(() => getSession(host)).toThrow('Auth user status must be active, banned, or deleted');
});

test('setSession adopts only a validated clone', async () => {
  const host = fixture();
  const session = { access_token: 'access', refresh_token: 'refresh', user };
  const adopt = jest.fn<AuthAccountHost['_adoptSessionInMemory']>();
  host._adoptSessionInMemory = adopt;

  await setSession(host, session);

  expect(adopt).toHaveBeenCalledWith(session);
  expect(adopt.mock.calls[0]?.[0]).not.toBe(session);
  expect(adopt.mock.calls[0]?.[0].user).not.toBe(session.user);
});

test.each([
  [{ id: 'user-1' }, 'Auth user email must be a string'],
  [{ id: 'user-1', email: 'user@example.com', status: null }, 'Auth user status must be active, banned, or deleted'],
])('setSession rejects an incomplete user before adoption', async (candidate, message) => {
  const host = fixture();
  const adopt = jest.fn<AuthAccountHost['_adoptSessionInMemory']>();
  host._adoptSessionInMemory = adopt;

  expect(await setSession(host, { access_token: 'access', refresh_token: 'refresh', user: candidate })).toEqual({
    data: { session: null },
    error: new TypeError(message),
  });
  expect(adopt).not.toHaveBeenCalled();
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
