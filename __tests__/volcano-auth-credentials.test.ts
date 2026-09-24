/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.js';
import { deferred, fetchCall, reply, signal, within } from './auth-concurrency-fixtures.ts';

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

function storageWriteKeys(): string[] {
  const write: unknown = Reflect.get(localStorage, 'setItem');
  if (!jest.isMockFunction(write)) {
    throw new Error('Missing storage spy');
  }
  return write.mock.calls.flatMap((args) => (typeof args[0] === 'string' ? [args[0]] : []));
}

function clearStorageSpies(): void {
  for (const name of ['setItem', 'removeItem']) {
    const method: unknown = Reflect.get(localStorage, name);
    if (!jest.isMockFunction(method)) {
      throw new Error(`Missing ${name} storage spy`);
    }
    method.mockClear();
  }
}

describe('VolcanoAuth credentials', () => {
  describe('Authentication - signUp', () => {
    it('should acknowledge a session-less signup without issuing a session', async () => {
      // Session-less signup (VOL-309): the server returns an acknowledgement only.
      const mockResponse = {
        confirmation_required: true,
        message: 'If the account was created, a confirmation email has been sent.',
      };

      fetchMock.mockResolvedValueOnce(reply(200, mockResponse));

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.confirmationRequired).toBe(true);
      expect(result.message).toBe(mockResponse.message);
      expect(result.error).toBeNull();
      // No session is issued, so neither token key is persisted (any value, incl. undefined/null).
      const persistedKeys = storageWriteKeys();
      expect(persistedKeys).not.toContain('volcano_access_token');
      expect(persistedKeys).not.toContain('volcano_refresh_token');
    });

    it('should return error on signup failure', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Email already exists' }));

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('Email already exists');
    });

    it('should include error:null on successful signup', async () => {
      const mockResponse = {
        confirmation_required: false,
        message: 'If the account was created, you can now sign in.',
      };

      fetchMock.mockResolvedValueOnce(reply(200, mockResponse));

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.error).toBeNull();
      expect(result.confirmationRequired).toBe(false);
      expect(result.message).toBe(mockResponse.message);
    });

    it('signs in after signup when confirmation is not required and signInWhenAllowed is set', async () => {
      fetchMock
        .mockResolvedValueOnce(reply(200, { confirmation_required: false, message: 'ok' }))
        .mockResolvedValueOnce(
          reply(200, {
            user: { id: 'user-123', email: 'test@example.com', status: 'active' },
            access_token: 'access-token-123',
            refresh_token: 'refresh-token-123',
            expires_in: 3600,
          }),
        );

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
        signInWhenAllowed: true,
      });

      // A follow-up signin was issued, establishing and persisting a session.
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.confirmationRequired).toBe(false);
      expect(result.user).toEqual({ id: 'user-123', email: 'test@example.com', status: 'active' });
      expect(result.session?.access_token).toBe('access-token-123');
      expect(result.error).toBeNull();
      expect(Reflect.get(localStorage, 'setItem')).toHaveBeenCalledWith(
        'volcano_access_token',
        'access-token-123',
      );
    });

    it('does not sign in when confirmation is required, even with signInWhenAllowed', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, { confirmation_required: true, message: 'check your email' }),
      );

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
        signInWhenAllowed: true,
      });

      // Only the signup request is made; no session is established.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.confirmationRequired).toBe(true);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      const persistedKeys = storageWriteKeys();
      expect(persistedKeys).not.toContain('volcano_access_token');
      expect(persistedKeys).not.toContain('volcano_refresh_token');
    });

    it('surfaces the sign-in error when the follow-up sign-in fails', async () => {
      fetchMock
        .mockResolvedValueOnce(reply(200, { confirmation_required: false, message: 'ok' }))
        .mockResolvedValueOnce(reply(429, { error: 'rate limit exceeded' }));

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
        signInWhenAllowed: true,
      });

      expect(result.confirmationRequired).toBe(false);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error?.message).toBe('rate limit exceeded');
    });
  });

  describe('Authentication - signIn', () => {
    it('discards a sign-in response after another session wins', async () => {
      const response = deferred<Response>();
      const requestStarted = signal();
      const callback = jest.fn();
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
      await within(
        Promise.all([firstStarted.promise, secondStarted.promise]),
        'concurrent sign-in requests',
      );
      firstResponse.resolve(
        reply(200, {
          access_token: 'first-access',
          refresh_token: 'first-refresh',
          expires_in: 3600,
          user: { id: 'first-user', email: 'fixture@example.com', status: 'active' },
        }),
      );
      await expect(within(first, 'first sign-in completion')).resolves.toEqual(
        expect.objectContaining({
          user: { id: 'first-user', email: 'fixture@example.com', status: 'active' },
          error: null,
        }),
      );
      secondResponse.resolve(
        reply(200, {
          access_token: 'second-access',
          refresh_token: 'second-refresh',
          expires_in: 3600,
          user: { id: 'second-user', email: 'fixture@example.com', status: 'active' },
        }),
      );

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
  });

  describe('Authentication - signOut', () => {
    it('succeeds without a session or network request', async () => {
      await expect(volcano.auth.signOut()).resolves.toEqual({ error: null });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('clears the session and surfaces a revocation server failure', async () => {
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockResolvedValueOnce(reply(503, { error: 'Logout unavailable' }));

      const result = await volcano.auth.signOut();

      expect(result.error).toMatchObject({ message: 'Logout unavailable', status: 503 });
      await expect(volcano.auth.getSession()).resolves.toEqual({
        data: { session: null },
        error: null,
      });
    });

    it('does not clear a session established while sign-out is pending', async () => {
      const response = deferred<Response>();
      const started = signal();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const signOut = volcano.auth.signOut();
      await within(started.promise, 'sign-out request start');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(200, {}));

      const result = await within(signOut, 'stale sign-out completion');

      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      const [, options] = fetchCall(0);
      if (typeof options?.body !== 'string') {
        throw new TypeError('Expected JSON revocation body');
      }
      const body: unknown = JSON.parse(options.body);
      expect(body).toEqual({
        refresh_token: 'old-refresh',
      });
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.currentUser).toEqual({
        id: 'replacement-user',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('rejects a new refresh while opaque-token logout is pending', async () => {
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementation(() => {
        started.resolve();
        return response.promise;
      });
      const operation = volcano.auth.signOut();
      await within(started.promise, 'opaque sign-out request start');
      const refresh = await within(volcano.auth.refreshSession(), 'overlapping refresh completion');
      expect(AuthRefreshDiscardedError.is(refresh.error)).toBe(true);
      response.resolve(reply(204));
      await expect(within(operation, 'opaque sign-out completion')).resolves.toEqual({
        error: null,
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      await expect(volcano.auth.getSession()).resolves.toEqual({
        data: { session: null },
        error: null,
      });
    });

    it('preserves a revocation failure when the session changes', async () => {
      const response = deferred<Response>();
      const started = signal();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const signOut = volcano.auth.signOut();
      await within(started.promise, 'failing sign-out request start');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(503, { error: 'Logout unavailable' }));

      const result = await within(signOut, 'failing sign-out completion');

      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(result.error?.cause).toMatchObject({ message: 'Logout unavailable', status: 503 });
      expect(volcano.accessToken).toBe('replacement-access');
    });

    it('should clear session on signout', async () => {
      volcano.accessToken = 'test-access-token';
      volcano.refreshToken = 'test-refresh';

      fetchMock.mockResolvedValueOnce(reply(200, {}));

      await volcano.auth.signOut();

      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
      expect(Reflect.get(localStorage, 'removeItem')).toHaveBeenCalledWith('volcano_access_token');
      expect(Reflect.get(localStorage, 'removeItem')).toHaveBeenCalledWith('volcano_refresh_token');
    });
  });
});
