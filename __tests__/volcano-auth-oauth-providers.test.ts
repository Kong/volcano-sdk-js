/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.js';
import {
  deferred,
  fetchCall,
  jsonField,
  reply,
  signal,
  within,
} from './auth-concurrency-fixtures.ts';

function createTestJwtToken(projectId: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ project_id: projectId })).toString('base64url');
  return `${header}.${payload}.test-signature`;
}

const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN = createTestJwtToken('00000000-0000-0000-0000-000000000001');
const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let volcano: VolcanoAuth;

function providerMethod(name: string, ...args: unknown[]): unknown {
  const method: unknown = Reflect.get(volcano.auth, name);
  if (typeof method !== 'function') {
    throw new TypeError(`Missing OAuth provider method ${name}`);
  }
  const result: unknown = Reflect.apply(method, volcano.auth, args);
  return result;
}

function asyncProviderMethod(name: string, ...args: unknown[]): Promise<unknown> {
  return Promise.resolve(providerMethod(name, ...args));
}

function browserStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key) {
      return values.get(key) ?? null;
    },
    key(index) {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      document: {},
      localStorage,
      sessionStorage: browserStorage(),
      location: { origin: 'https://app.test', pathname: '/auth/callback', assign: jest.fn() },
    },
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

describe('VolcanoAuth OAuth provider operations', () => {
  describe('OAuth', () => {
    it('should redirect to OAuth provider with anon_key and separate client state', () => {
      const url = volcano.auth.signInWithOAuth('google');
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(
        'https://api.test.com/auth/oauth/google/authorize',
      );
      expect(parsed.searchParams.get('anon_key')).toBe('ak-test-anon-key');
      const redirectUrl = parsed.searchParams.get('redirect_url');
      expect(redirectUrl).toBeTruthy();
      expect(new URL(redirectUrl ?? '').searchParams.get('vh_state')).toBe(
        parsed.searchParams.get('client_state'),
      );
    });

    it('should have convenience methods for all providers', () => {
      expect(volcano.auth.signInWithGoogle()).toContain('/oauth/google/');
      expect(volcano.auth.signInWithGitHub()).toContain('/oauth/github/');
      expect(volcano.auth.signInWithMicrosoft()).toContain('/oauth/microsoft/');
      expect(volcano.auth.signInWithApple()).toContain('/oauth/apple/');
    });

    it('should get linked providers', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, { providers: [{ provider: 'google' }, { provider: 'github' }] }),
      );

      const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

      expect(error).toBeNull();
      expect(providers).toEqual([{ provider: 'google' }, { provider: 'github' }]);
    });

    it('should return empty array when no providers linked', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

      expect(error).toBeNull();
      expect(providers).toEqual([]);
    });

    it('should return error on getLinkedOAuthProviders failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(401, { error: 'Unauthorized' }));

      const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

      expect(providers).toBeNull();
      expect(error).toBeDefined();
    });

    it('should discard linked providers from a replaced local session', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.getLinkedOAuthProviders();
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(200, { providers: [{ provider: 'google' }] }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.providers).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error when an obsolete provider request fails', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.getLinkedOAuthProviders();
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(401, { error: 'old session rejected' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.providers).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should link OAuth provider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, { message: 'Provider linked', authorization_url: 'https://...' }),
      );

      const { data, error } = await volcano.auth.linkOAuthProvider('github');

      expect(error).toBeNull();
      expect(data).toMatchObject({ message: 'Provider linked' });
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/auth/oauth/github/link',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return error on linkOAuthProvider failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Provider already linked' }));

      const { data, error } = await volcano.auth.linkOAuthProvider('github');

      expect(data).toBeNull();
      expect(error).toBeDefined();
    });

    it('should discard an OAuth link URL from a replaced local session', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.linkOAuthProvider('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(200, { authorization_url: 'https://accounts.example/link' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.data).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error when an obsolete OAuth link request fails', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.linkOAuthProvider('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(401, { error: 'old session rejected' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.data).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should unlink OAuth provider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const { error } = await volcano.auth.unlinkOAuthProvider('github');

      expect(error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/auth/oauth/github/unlink',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should return error on unlinkOAuthProvider failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Cannot unlink only provider' }));

      const { error } = await volcano.auth.unlinkOAuthProvider('github');

      expect(error).toBeDefined();
    });

    it('should reject an obsolete OAuth unlink success', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.unlinkOAuthProvider('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(204, {}));

      const result = await within(request, 'stale OAuth provider request');

      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error when an obsolete OAuth unlink fails', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.unlinkOAuthProvider('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(401, { error: 'old session rejected' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should refresh OAuth token', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          message: 'Token refreshed',
          provider: 'google',
          expires_in: 3600,
        }),
      );

      const result = await volcano.auth.refreshOAuthToken('google');

      expect(result.message).toBe('Token refreshed');
      expect(result.provider).toBe('google');
      expect(result.expiresIn).toBe(3600);
      expect(result.error).toBeNull();
    });

    it('should return error on refreshOAuthToken failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Refresh not supported' }));

      const result = await volcano.auth.refreshOAuthToken('github');

      expect(result.message).toBeNull();
      expect(result.error?.message).toBe('Refresh not supported');
    });

    it('should reject an obsolete OAuth provider refresh result', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.refreshOAuthToken('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(
        reply(200, {
          message: 'Provider token refreshed successfully',
          provider: 'google',
          expires_in: 3600,
        }),
      );

      const result = await within(request, 'stale OAuth provider request');

      expect(result.message).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error when an obsolete provider refresh fails', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.refreshOAuthToken('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(401, { error: 'old session rejected' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.message).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should get OAuth provider token', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          message: 'Token retrieved',
          provider: 'google',
          expires_in: 3600,
        }),
      );

      const result = await volcano.auth.getOAuthProviderToken('google');

      expect(result.message).toBe('Token retrieved');
      expect(result.provider).toBe('google');
      expect(result.expiresIn).toBe(3600);
      expect(result.error).toBeNull();
    });

    it('should return error on getOAuthProviderToken failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(404, { error: 'Provider not linked' }));

      const result = await volcano.auth.getOAuthProviderToken('apple');

      expect(result.message).toBeNull();
      expect(result.error?.message).toBe('Provider not linked');
    });

    it('should reject an obsolete OAuth provider token status', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.getOAuthProviderToken('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(
        reply(200, {
          message: 'Provider token is valid',
          provider: 'google',
          expires_in: 3600,
        }),
      );

      const result = await within(request, 'stale OAuth provider request');

      expect(result.message).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error when an obsolete token status request fails', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.getOAuthProviderToken('google');
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(401, { error: 'old session rejected' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.message).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should call OAuth API', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          provider: 'github',
          endpoint: '/user/repos',
          status_code: 200,
          data: ['repo1', 'repo2'],
        }),
      );

      const result = await volcano.auth.callOAuthAPI('github', {
        endpoint: '/user/repos',
        method: 'GET',
      });

      expect(result.data).toEqual(['repo1', 'repo2']);
      expect(result.error).toBeNull();

      expect(jsonField(fetchCall(0)[1], 'endpoint')).toBe('/user/repos');
      expect(jsonField(fetchCall(0)[1], 'method')).toBe('GET');
    });

    it('should call OAuth API with POST body', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          data: { success: true },
        }),
      );

      const result = await volcano.auth.callOAuthAPI('github', {
        endpoint: '/user/repos',
        method: 'POST',
        body: { name: 'new-repo' },
      });

      expect(result.data).toEqual({ success: true });

      expect(jsonField(fetchCall(0)[1], 'body')).toEqual({ name: 'new-repo' });
    });

    it('should return error on callOAuthAPI failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(403, { error: 'Insufficient scope' }));

      const result = await volcano.auth.callOAuthAPI('github', {
        endpoint: '/admin/repos',
      });

      expect(result.data).toBeNull();
      expect(result.error?.message).toBe('Insufficient scope');
    });

    it('should reject an obsolete OAuth provider API result', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.callOAuthAPI('github', { endpoint: '/user/repos' });
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(200, { data: { repos: ['obsolete'] } }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.data).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error when an obsolete provider API request fails', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.callOAuthAPI('github', { endpoint: '/user/repos' });
      await within(started.promise, 'OAuth provider request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(401, { error: 'old session rejected' }));

      const result = await within(request, 'stale OAuth provider request');

      expect(result.data).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });
  });
  describe('Security - Provider Sanitization', () => {
    // SDK now sanitizes provider format (lowercase letters, numbers, hyphens only)
    // but does NOT validate against a whitelist - backend handles provider validation

    it('should throw error for invalid provider format in signInWithOAuth', () => {
      // Empty string should fail
      expect(() => providerMethod('signInWithOAuth', '')).toThrow(
        'Provider must be a non-empty string',
      );
      // Uppercase should fail (sanitization)
      expect(() => providerMethod('signInWithOAuth', 'Google')).toThrow(
        'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
      );
      // Special characters should fail
      expect(() => providerMethod('signInWithOAuth', 'my_provider')).toThrow(
        'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
      );
    });

    it('should accept any valid-format provider (backend validates whitelist)', () => {
      // SDK accepts any valid format - backend validates if provider is supported
      expect(() => providerMethod('signInWithOAuth', 'google')).not.toThrow();
      expect(() => providerMethod('signInWithOAuth', 'github')).not.toThrow();
      expect(() => providerMethod('signInWithOAuth', 'facebook')).not.toThrow(); // SDK passes, backend may reject
      expect(() => providerMethod('signInWithOAuth', 'custom-provider')).not.toThrow();
    });

    it('should throw error for invalid format in linkOAuthProvider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      // Empty or invalid format fails
      await expect(asyncProviderMethod('linkOAuthProvider', '')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
      await expect(asyncProviderMethod('linkOAuthProvider', 'My_Provider')).rejects.toThrow(
        'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
      );
    });

    it('should accept valid format in linkOAuthProvider (backend validates whitelist)', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      fetchMock.mockResolvedValueOnce(reply(200, { authorization_url: 'https://example.com' }));
      // 'unknown-provider' has valid format, backend will validate if supported
      const result = await asyncProviderMethod('linkOAuthProvider', 'unknown-provider');
      expect(result).toMatchObject({ error: null });
    });

    it('should throw error for invalid format in unlinkOAuthProvider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(asyncProviderMethod('unlinkOAuthProvider', '')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });

    it('should throw error for invalid format in refreshOAuthToken', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(asyncProviderMethod('refreshOAuthToken', '')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });

    it('should throw error for invalid format in getOAuthProviderToken', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(asyncProviderMethod('getOAuthProviderToken', '')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });

    it('should throw error for invalid format in callOAuthAPI', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(asyncProviderMethod('callOAuthAPI', '', { endpoint: '/test' })).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });
  });
});
