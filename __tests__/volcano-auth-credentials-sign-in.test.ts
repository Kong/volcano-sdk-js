/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, type AuthStateCallback, VolcanoAuth } from '../src/index.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let volcano: VolcanoAuth;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, localStorage },
  });
  volcano = new VolcanoAuth(config);
});

afterEach(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', previousWindow);
  }
});

function clearStorageSpies(): void {
  for (const name of ['setItem', 'removeItem']) {
    const method: unknown = Reflect.get(localStorage, name);
    if (!jest.isMockFunction(method)) {
      throw new Error(`Missing ${name} storage spy`);
    }
    method.mockClear();
  }
}

function signInReply(account: string): Response {
  return reply(200, {
    access_token: `${account}-access`,
    refresh_token: `${account}-refresh`,
    expires_in: 3600,
    user: { id: `${account}-user`, email: 'fixture@example.com', status: 'active' },
  });
}

function discardsStaleSignIns(): void {
  it('discards a sign-in response after another session wins', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    const callback = jest.fn<AuthStateCallback>();
    volcano.auth.onAuthStateChange(callback);
    callback.mockClear();
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const signIn = volcano.auth.signIn({ email: 'old@example.com', password: 'password123' });
    await within(requestStarted.promise, 'sign-in request start');
    volcano._setSession({
      access_token: 'replacement-access',
      refresh_token: 'replacement-refresh',
      user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
    });
    callback.mockClear();
    clearStorageSpies();
    response.resolve(
      reply(200, {
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        expires_in: 3600,
        user: { id: 'stale-user', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await within(signIn, 'stale sign-in completion');

    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.accessToken).toBe('replacement-access');
    expect(volcano.currentUser).toEqual({
      id: 'replacement-user',
      email: 'fixture@example.com',
      status: 'active',
    });
    expect(Reflect.get(localStorage, 'setItem')).not.toHaveBeenCalled();
    expect(Reflect.get(localStorage, 'removeItem')).not.toHaveBeenCalled();
    expect(callback).not.toHaveBeenCalled();
  });
}

function acceptsFirstConcurrentSignIn(): void {
  it('lets only the first of two concurrent sign-ins establish a session', async () => {
    const firstResponse = deferred<Response>();
    const secondResponse = deferred<Response>();
    const firstStarted = signal();
    const secondStarted = signal();
    fetchMock
      .mockImplementationOnce(() => {
        firstStarted.resolve();
        return firstResponse.promise;
      })
      .mockImplementationOnce(() => {
        secondStarted.resolve();
        return secondResponse.promise;
      });

    const first = volcano.auth.signIn({ email: 'first@example.com', password: 'password123' });
    const second = volcano.auth.signIn({ email: 'second@example.com', password: 'password123' });
    await within(Promise.all([firstStarted.promise, secondStarted.promise]), 'concurrent sign-in requests');
    firstResponse.resolve(signInReply('first'));
    await expect(within(first, 'first sign-in completion')).resolves.toEqual(
      expect.objectContaining({
        user: { id: 'first-user', email: 'fixture@example.com', status: 'active' },
        error: null,
      }),
    );
    secondResponse.resolve(signInReply('second'));

    const secondResult = await within(second, 'second sign-in completion');

    expect(secondResult.user).toBeNull();
    expect(secondResult.session).toBeNull();
    expect(AuthSessionChangedError.is(secondResult.error)).toBe(true);
    expect(volcano.accessToken).toBe('first-access');
    expect(volcano.currentUser).toEqual({
      id: 'first-user',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

function signsInWithPassword(): void {
  it('should sign in user successfully', async () => {
    const mockResponse = {
      user: { id: 'user-123', email: 'test@example.com', status: 'active' },
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_in: 3600,
    };

    fetchMock.mockResolvedValueOnce(reply(200, mockResponse));

    const result = await volcano.auth.signIn({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.user?.id).toBe('user-123');
    expect(volcano.accessToken).toBe('access-token-123');
  });

  it('should return error on invalid credentials', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Invalid credentials' }));

    const result = await volcano.auth.signIn({
      email: 'test@example.com',
      password: 'wrong',
    });

    expect(result.user).toBeNull();
    expect(result.session).toBeNull();
    expect(result.error).toBeDefined();
    expect(result.error?.message).toBe('Invalid credentials');
  });
}

function reportsSignInSuccess(): void {
  it('should include error:null on successful signin', async () => {
    const mockResponse = {
      user: { id: 'user-123', email: 'test@example.com', status: 'active' },
      access_token: 'access-token-123',
      refresh_token: 'refresh-token-123',
      expires_in: 3600,
    };

    fetchMock.mockResolvedValueOnce(reply(200, mockResponse));

    const result = await volcano.auth.signIn({
      email: 'test@example.com',
      password: 'password123',
    });

    expect(result.error).toBeNull();
    expect(result.user).toBeDefined();
    expect(result.session).toBeDefined();
  });
}

describe('VolcanoAuth credentials', () => {
  describe('Authentication - signIn', () => {
    discardsStaleSignIns();
    acceptsFirstConcurrentSignIn();
    signsInWithPassword();
    reportsSignInSuccess();
  });
});
