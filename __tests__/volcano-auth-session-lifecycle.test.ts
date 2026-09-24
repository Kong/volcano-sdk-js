/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, VolcanoAuth } from '../src/index.js';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
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

describe('VolcanoAuth session lifecycle', () => {
  describe('Authentication - updateUser', () => {
    it('should update user password', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-123', email: 'test@example.com', status: 'active' },
        }),
      );

      const result = await volcano.auth.updateUser({ password: 'newPassword123' });

      expect(result.user?.id).toBe('user-123');
      expect(result.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/user'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('should update user metadata', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: {
            id: 'user-123',
            metadata: { name: 'John' },
            email: 'fixture@example.com',
            status: 'active',
          },
        }),
      );

      const result = await volcano.auth.updateUser({ metadata: { name: 'John' } });

      expect(result.user).toMatchObject({ metadata: { name: 'John' } });
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.updateUser({ password: 'newpass' });

      expect(result.user).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should return error on failure', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Password too weak' }));

      const result = await volcano.auth.updateUser({ password: '123' });

      expect(result.user).toBeNull();
      expect(result.error?.message).toBe('Password too weak');
    });
  });

  describe('Authentication - refreshSession', () => {
    it('shares one refresh request for the same session', async () => {
      const response = deferred<Response>();
      const started = signal();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'shared-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const first = volcano.auth.refreshSession();
      const second = volcano.auth.refreshSession();

      await within(started.promise, 'shared refresh request start');

      expect(global.fetch).toHaveBeenCalledTimes(1);

      response.resolve(
        reply(200, {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const [firstResult, secondResult] = await within(
        Promise.all([first, second]),
        'shared refresh completion',
      );
      expect(firstResult).toEqual(secondResult);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('discards a refresh response after the session is replaced', async () => {
      const response = deferred<Response>();
      const started = signal();
      const callback = jest.fn();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      volcano.auth.onAuthStateChange(callback);
      callback.mockClear();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const refresh = volcano.auth.refreshSession();
      await within(started.promise, 'stale refresh request start');

      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
      });
      callback.mockClear();
      clearStorageSpies();

      response.resolve(
        reply(200, {
          access_token: 'stale-access',
          refresh_token: 'stale-refresh',
          user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const result = await within(refresh, 'stale refresh completion');

      expect(result.session).toBeNull();
      expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.refreshToken).toBe('replacement-refresh');
      expect(volcano.currentUser).toEqual({
        id: 'user-2',
        email: 'fixture@example.com',
        status: 'active',
      });
      expect(localStorage.getItem('volcano_access_token')).toBe('replacement-access');
      expect(localStorage.getItem('volcano_refresh_token')).toBe('replacement-refresh');
      expect(Reflect.get(localStorage, 'setItem')).not.toHaveBeenCalled();
      expect(Reflect.get(localStorage, 'removeItem')).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('does not clear a replacement session after a stale refresh failure', async () => {
      const response = deferred<Response>();
      const started = signal();
      const callback = jest.fn();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      volcano.auth.onAuthStateChange(callback);
      callback.mockClear();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const refresh = volcano.auth.refreshSession();
      await within(started.promise, 'failed refresh request start');

      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
      });
      callback.mockClear();
      clearStorageSpies();

      response.resolve(reply(401, { error: 'Old refresh token expired' }));

      const result = await within(refresh, 'failed refresh completion');

      expect(result.session).toBeNull();
      expect(result.error?.message).toBe('Old refresh token expired');
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.refreshToken).toBe('replacement-refresh');
      expect(volcano.currentUser).toEqual({
        id: 'user-2',
        email: 'fixture@example.com',
        status: 'active',
      });
      expect(localStorage.getItem('volcano_access_token')).toBe('replacement-access');
      expect(localStorage.getItem('volcano_refresh_token')).toBe('replacement-refresh');
      expect(Reflect.get(localStorage, 'setItem')).not.toHaveBeenCalled();
      expect(Reflect.get(localStorage, 'removeItem')).not.toHaveBeenCalled();
      expect(callback).not.toHaveBeenCalled();
    });

    it('preserves the current session after a refresh server failure', async () => {
      const established = {
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      };
      volcano._setSession(established);
      fetchMock.mockResolvedValueOnce(reply(503, { error: 'Refresh unavailable' }));

      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeNull();
      expect(result.error).toMatchObject({ message: 'Refresh unavailable', status: 503 });
      await expect(volcano.auth.getSession()).resolves.toEqual({
        data: { session: established },
        error: null,
      });
    });

    it('should refresh session successfully', async () => {
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'valid-refresh',
        user: { id: 'user-123', email: 'alice@example.com', status: 'active' },
      });

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'user-123', email: 'alice@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const result = await volcano.auth.refreshSession();

      expect(result.session?.access_token).toBe('new-access');
      expect(result.session?.refresh_token).toBe('new-refresh');
      expect(result.session?.expires_in).toBe(3600);
      expect(result.error).toBeNull();
      expect(volcano.accessToken).toBe('new-access');
      expect(volcano.refreshToken).toBe('new-refresh');
      await expect(volcano.auth.getSession()).resolves.toEqual({
        data: {
          session: {
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            user: { id: 'user-123', email: 'alice@example.com', status: 'active' },
          },
        },
        error: null,
      });
    });

    it('should return error when no refresh token', async () => {
      volcano.accessToken = 'valid-access';
      volcano.refreshToken = null;

      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeNull();
      expect(result.error?.message).toBe('No refresh token');
      expect(volcano.accessToken).toBe('valid-access');
    });

    it('should clear session on refresh failure', async () => {
      volcano.accessToken = sessionToken();
      volcano.refreshToken = 'expired-refresh';

      fetchMock.mockResolvedValueOnce(reply(401, { error: 'Refresh token expired' }));

      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeNull();
      expect(result.error?.message).toBe('Refresh token expired');
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });
  });

  describe('Authentication - onAuthStateChange', () => {
    it('should call callback with current user', () => {
      volcano.currentUser = { id: 'user-123', email: 'fixture@example.com', status: 'active' };
      const callback = jest.fn();

      volcano.auth.onAuthStateChange(callback);

      expect(callback).toHaveBeenCalledWith({
        id: 'user-123',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('should call callback on session change', async () => {
      const callback = jest.fn();
      volcano.auth.onAuthStateChange(callback);

      // Clear initial call
      callback.mockClear();

      // Simulate signin
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-456', email: 'fixture@example.com', status: 'active' },
          access_token: 'token',
          refresh_token: 'refresh',
          expires_in: 3600,
        }),
      );

      await volcano.auth.signIn({ email: 'test@test.com', password: 'pass' });

      expect(callback).toHaveBeenCalledWith({
        id: 'user-456',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = volcano.auth.onAuthStateChange(callback);

      expect(typeof unsubscribe).toBe('function');

      // Clear initial call
      callback.mockClear();

      // Unsubscribe
      unsubscribe();

      // Trigger session change
      volcano._setSession({
        user: { id: 'user-789', email: 'fixture@example.com', status: 'active' },
        access_token: 'token',
        refresh_token: 'refresh',
      });

      // Callback should NOT be called since we unsubscribed
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      volcano.auth.onAuthStateChange(callback1);
      volcano.auth.onAuthStateChange(callback2);

      // Clear initial calls
      callback1.mockClear();
      callback2.mockClear();

      // Trigger session change
      volcano._setSession({
        user: { id: 'user-multi', email: 'fixture@example.com', status: 'active' },
        access_token: 'token',
        refresh_token: 'refresh',
      });

      expect(callback1).toHaveBeenCalledWith({
        id: 'user-multi',
        email: 'fixture@example.com',
        status: 'active',
      });
      expect(callback2).toHaveBeenCalledWith({
        id: 'user-multi',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('should not crash if callback throws error', () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation((...messages: unknown[]) => {
          expect(messages).not.toHaveLength(0);
        });
      const badCallback = jest.fn<(user: unknown) => void>(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      // Register both callbacks
      volcano.auth.onAuthStateChange(badCallback);
      volcano.auth.onAuthStateChange(goodCallback);

      // Clear initial calls
      badCallback.mockClear();
      goodCallback.mockClear();

      // Trigger session change - should not throw
      expect(() => {
        volcano._setSession({
          user: { id: 'user-err', email: 'fixture@example.com', status: 'active' },
          access_token: 'token',
          refresh_token: 'refresh',
        });
      }).not.toThrow();

      // Bad callback was called (and threw)
      expect(badCallback).toHaveBeenCalled();
      // Good callback still got called despite the error
      expect(goodCallback).toHaveBeenCalledWith({
        id: 'user-err',
        email: 'fixture@example.com',
        status: 'active',
      });
      // Error was logged
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should not crash if callback throws error on initial registration', () => {
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation((...messages: unknown[]) => {
          expect(messages).not.toHaveLength(0);
        });
      volcano.currentUser = { id: 'current-user', email: 'fixture@example.com', status: 'active' };

      const badCallback = jest.fn<(user: unknown) => void>(() => {
        throw new Error('Initial callback error');
      });

      // Should not throw when registering
      expect(() => {
        volcano.auth.onAuthStateChange(badCallback);
      }).not.toThrow();

      expect(badCallback).toHaveBeenCalledWith({
        id: 'current-user',
        email: 'fixture@example.com',
        status: 'active',
      });
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });
  describe('Security - updateUser Validation', () => {
    // SDK no longer validates params - backend handles validation
    it('should pass empty params to backend (backend validates)', async () => {
      volcano.accessToken = sessionToken();

      // Mock backend returning validation error
      fetchMock.mockResolvedValueOnce(
        reply(400, { error: 'At least one of password or metadata is required' }),
      );

      const result = await volcano.auth.updateUser({});

      // SDK passes request to backend, backend returns error
      expect(result.user).toBeNull();
      expect(result.error).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should allow update with password only', async () => {
      volcano.accessToken = sessionToken();

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await volcano.auth.updateUser({ password: 'newpass123' });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
    });

    it('should allow update with metadata only', async () => {
      volcano.accessToken = sessionToken();

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await volcano.auth.updateUser({ metadata: { name: 'Test' } });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
    });

    it('should allow update with both password and metadata', async () => {
      volcano.accessToken = sessionToken();

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await volcano.auth.updateUser({
        password: 'newpass123',
        metadata: { name: 'Test' },
      });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
    });
  });
});
