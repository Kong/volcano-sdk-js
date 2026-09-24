/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { RequestResult } from '../src/auth-request.ts';
import { AuthRefreshDiscardedError } from '../src/errors.ts';
import {
  clearSharedFunctionResolveStateForTests,
  functionResolveCacheKey,
  getSharedFunctionResolveState,
} from '../src/function-resolve-cache.ts';
import { loadRealtime, VolcanoAuth } from '../src/index.ts';
import type { User } from '../src/sdk-public-types.ts';
import { deferred, within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';

beforeEach(clearSharedFunctionResolveStateForTests);
afterEach(() => {
  jest.restoreAllMocks();
});

function client(
  options: { apiUrl?: string; timeout?: number; refreshToken?: string } = {},
): VolcanoAuth {
  return new VolcanoAuth({ anonKey: 'ak-test', accessToken: 'access', ...options });
}

describe('auth facade delegates', () => {
  test('returns the HTTP response from the anonymous transport', async () => {
    const sdk = client();
    jest.mocked(globalThis.fetch).mockResolvedValue(Response.json({ ok: true }));

    await expect(within(sdk._anonFetch('/probe'), 'anonymous transport')).resolves.toMatchObject({
      ok: true,
      status: 200,
      data: { ok: true },
      error: null,
    });
  });

  test('captures and compares the current session generation', () => {
    const sdk = client({ refreshToken: 'refresh' });
    const context = sdk._captureAuthContext();

    expect(context.accessToken).toBe('access');
    expect(context.refreshToken).toBe('refresh');
    expect(sdk._isAuthContextCurrent(context)).toBe(true);
    sdk._sessionGeneration += 1;
    expect(sdk._isAuthContextCurrent(context)).toBe(false);
  });

  test('sets a validated session through the facade', () => {
    const sdk = client();
    const changed = sdk._setSession({
      access_token: 'replacement-access',
      refresh_token: 'replacement-refresh',
      user: { id: 'user-1', email: 'user@example.test', status: 'active' },
    });

    expect(changed).toBe(true);
    expect(sdk.accessToken).toBe('replacement-access');
    expect(sdk.refreshToken).toBe('replacement-refresh');
    expect(sdk.currentUser?.id).toBe('user-1');
  });
});

describe('facade configuration boundaries', () => {
  test('normalizes the default and explicitly empty API URL', () => {
    expect(client().apiUrl).toBe('https://api.volcano.dev');
    expect(client({ apiUrl: '' }).apiUrl).toBe('https://api.volcano.dev');
    expect(client({ apiUrl: 'https://api.example.test/' }).apiUrl).toBe('https://api.example.test');
  });

  test('accepts a finite nonzero timeout and defaults invalid timeout values', () => {
    expect(client().timeout).toBe(60_000);
    expect(client({ timeout: 0 }).timeout).toBe(60_000);
    expect(client({ timeout: Number.NaN }).timeout).toBe(60_000);
    expect(client({ timeout: 250 }).timeout).toBe(250);
  });

  test('does not retain an empty refresh token supplied with an access token', () => {
    expect(client({ refreshToken: '' }).refreshToken).toBeNull();
  });

  test('does not report a URL adoption for an explicit server credential', async () => {
    const sdk = client();
    const onChange = jest.fn();
    sdk.auth.onAuthStateChange(onChange);
    jest
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        Response.json({ user: { id: 'user', email: 'u@example.test', status: 'active' } }),
      );

    await expect(sdk.auth.getUser()).resolves.toMatchObject({ user: { id: 'user' }, error: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

describe('facade log request boundary', () => {
  test('rejects an empty project without sending a request', async () => {
    const sdk = client();
    const fetch = jest.spyOn(sdk, '_authFetch');
    await expect(sdk._postProjectLogRequest(' ', 'search', {})).resolves.toMatchObject({
      data: null,
      error: expect.any(Error),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('rejects a non-string project identifier at the runtime boundary', async () => {
    const sdk = client();
    const fetch = jest.spyOn(sdk, '_authFetch');
    const send: unknown = Reflect.get(sdk, '_postProjectLogRequest');
    if (typeof send !== 'function') {
      throw new TypeError('Missing project log method');
    }

    await expect(Reflect.apply(send, sdk, [42, 'search', {}])).resolves.toMatchObject({
      data: null,
      error: new Error('projectId must be a non-empty string'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('uses an empty object for an absent log request body', async () => {
    const sdk = client();
    const result: RequestResult = { ok: true, status: 200, data: {}, error: null };
    const fetch = jest.spyOn(sdk, '_authFetch').mockResolvedValue(result);
    await expect(sdk._postProjectLogRequest('project/id', 'search', null)).resolves.toEqual({
      data: {},
      error: null,
    });
    expect(fetch).toHaveBeenCalledWith('/projects/project%2Fid/logs/search', {
      method: 'POST',
      body: '{}',
    });
  });

  test('returns a failed authenticated log request without decoding a payload', async () => {
    const sdk = client();
    const error = new Error('network unavailable');
    const result: RequestResult = { ok: false, status: null, data: null, error };
    jest.spyOn(sdk, '_authFetch').mockResolvedValue(result);
    await expect(sdk.searchLogs('project', { resource: { type: 'function' } })).resolves.toEqual({
      data: null,
      error,
    });
    await expect(
      sdk.getLogActivity('project', { resource: { type: 'function' } }),
    ).resolves.toEqual({
      data: null,
      error,
    });
  });
});

describe('facade fetch and module boundaries', () => {
  test('omits unspecified generated transport options while preserving supplied ones', () => {
    const sdk = client();
    const defaults = sdk._generatedOptions('anon');
    expect(Object.keys(defaults)).toEqual(['volcanoAuthorization', 'volcanoClient']);
    expect(defaults).toEqual({ volcanoAuthorization: 'anon', volcanoClient: sdk });
    expect(sdk._generatedOptions('session', { 'X-Trace': 'one' }, 'blob')).toEqual({
      volcanoAuthorization: 'session',
      volcanoClient: sdk,
      headers: { 'X-Trace': 'one' },
      volcanoResponseType: 'blob',
    });
  });

  test('supplies default options to authenticated and anonymous requests', async () => {
    const sdk = client();
    const response = new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
    const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(response);
    await expect(sdk._authFetch('/auth/user')).resolves.toMatchObject({ ok: true });
    await expect(sdk._authFetchWithContext('/auth/user')).resolves.toMatchObject({
      result: { ok: true },
    });
    await expect(sdk._anonFetch('/auth/user')).resolves.toMatchObject({ ok: true });
    await expect(sdk._authFetchUrl(`${sdk.apiUrl}/auth/user`)).resolves.toMatchObject({ ok: true });
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  test('loads the realtime entrypoint only when requested', async () => {
    const module = await loadRealtime();
    expect(module.VolcanoRealtime).toBeDefined();
    expect(module.RealtimeChannel).toBeDefined();
  });

  test('rejects invalid resolver cache limits', () => {
    expect(() => {
      VolcanoAuth.__setFunctionResolveCacheMaxEntriesForTests(0);
    }).toThrow('maxEntries must be a positive integer');
  });

  test('accepts a one-entry resolver cache and immediately prunes excess entries', () => {
    const state = getSharedFunctionResolveState();
    const expiresAt = Date.now() + 10_000;
    state.cache.set('first', { functionId: 'first', error: null, expiresAt });
    state.cache.set('second', { functionId: 'second', error: null, expiresAt });
    state.lastPruneAtMs = Date.now();

    VolcanoAuth.__setFunctionResolveCacheMaxEntriesForTests(1);

    expect(VolcanoAuth.__getFunctionResolveCacheMetricsForTests()).toMatchObject({
      cacheSize: 1,
      maxEntries: 1,
    });
  });
});

describe('facade auth lifecycle boundary', () => {
  test.each([
    { access: null, refresh: null, hasSession: false },
    { access: '', refresh: null, hasSession: false },
    { access: null, refresh: '', hasSession: false },
    { access: 'access', refresh: null, hasSession: true },
    { access: null, refresh: 'refresh', hasSession: true },
    { access: '', refresh: 'refresh', hasSession: true },
    { access: 'access', refresh: '', hasSession: true },
  ])(
    'initializes only when a nonempty credential exists: access=$access refresh=$refresh',
    async ({ access, refresh, hasSession }) => {
      const sdk = client();
      sdk.accessToken = access;
      sdk.refreshToken = refresh;
      const user: User = { id: 'user', email: 'u@example.test', status: 'active' };
      const getUser = jest.spyOn(sdk, 'getUser').mockResolvedValue({ user, error: null });

      const result = await sdk.initialize();

      expect(getUser).toHaveBeenCalledTimes(hasSession ? 1 : 0);
      expect(result).toEqual(hasSession ? { user, error: null } : { user: null, error: null });
    },
  );

  test('passes empty anonymous metadata when omitted', async () => {
    const sdk = client();
    const error = new Error('signup refused');
    const response: RequestResult = { ok: false, status: 403, data: null, error };
    const fetch = jest.spyOn(sdk, '_anonFetch').mockResolvedValue(response);
    await expect(sdk.signInAnonymously()).resolves.toEqual({
      user: null,
      session: null,
      error,
    });
    expect(fetch).toHaveBeenCalledWith('/auth/signup-anonymous', {
      method: 'POST',
      body: '{"user_metadata":{}}',
    });
  });

  test('refuses hosted auth without a browser, including default options', () => {
    const sdk = client();
    expect(() => {
      sdk.getHostedAuthUrl();
    }).toThrow('only available in the browser');
    expect(() => {
      sdk.signInWithHostedAuth();
    }).toThrow('only available in the browser');
  });

  test('removes OAuth response credentials from a callback URL by default', () => {
    const sdk = client();
    const url = new URL('https://app.example.test/callback?code=secret&state=nonce&keep=ok#token');
    sdk._removeOAuthResponseParams(url);
    expect(url.toString()).toBe('https://app.example.test/callback?keep=ok');
  });

  test('finishes a captured sign-out and clears the old credential', async () => {
    const sdk = client();
    const context = sdk._captureAuthContext();
    await expect(sdk._signOutCaptured(context, null)).resolves.toEqual({ error: null });
    expect(sdk.accessToken).toBeNull();
  });

  test('revokes the captured session with its original credential', async () => {
    const sdk = client();
    const context = sdk._captureAuthContext();
    const response: RequestResult = { ok: true, status: 204, data: null, error: null };
    const fetch = jest.spyOn(sdk, '_anonFetch').mockResolvedValue(response);
    await expect(sdk._revokeAccessSession(context, 'session/id', null)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith('/auth/user/sessions/session%2Fid', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer access' },
    });
  });

  test('returns a failed captured refresh without replacing the session', async () => {
    const sdk = client({ refreshToken: 'refresh' });
    const context = sdk._captureAuthContext();
    const error = new Error('expired');
    jest.spyOn(sdk, '_fetchSessionRefresh').mockResolvedValue({
      ok: false,
      status: 401,
      data: null,
      error,
    });
    await expect(sdk._performSessionRefresh(context)).resolves.toEqual({ session: null, error });
  });
});

describe('shared function resolution boundary', () => {
  const name = 'orders';
  const anonToken = 'ak-test';

  function resolveWith(sdk: VolcanoAuth, token: string, useAnonKey: boolean) {
    return sdk._resolveFunctionIdByName(name, {
      authContext: sdk._captureAuthContext(),
      token,
      useAnonKey,
    });
  }

  test('rejects resolution without a credential', async () => {
    const sdk = client();
    await expect(
      sdk._resolveFunctionIdByName(name, {
        authContext: sdk._captureAuthContext(),
        token: null,
        useAnonKey: true,
      }),
    ).rejects.toThrow('No credential available');
  });

  test('uses a credential-scoped cached resolution and removes an expired one', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    state.lastPruneAtMs = Date.now();
    state.cache.set(key, {
      functionId: 'cached-function',
      invokeUrl: 'https://invoke.example.test',
      error: null,
      expiresAt: Date.now() + 10_000,
    });
    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'cached-function',
      token: anonToken,
    });

    state.cache.set(key, { functionId: 'old', error: null, expiresAt: Date.now() - 1 });
    state.inFlight.set(
      key,
      Promise.resolve({ functionId: 'fresh', invokeUrl: null, error: null, status: 200 }),
    );
    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'fresh',
    });
    expect(state.cache.has(key)).toBe(false);
  });

  test('treats a resolver cache entry expiring now as stale', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    state.lastPruneAtMs = now;
    state.cache.set(key, { functionId: 'expired', error: null, expiresAt: now });
    state.inFlight.set(
      key,
      Promise.resolve({ functionId: 'fresh', invokeUrl: null, error: null, status: 200 }),
    );

    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'fresh',
    });
    expect(state.cache.has(key)).toBe(false);
  });

  test('does not delete an absent resolver cache entry', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    state.lastPruneAtMs = Date.now();
    const deleteCache = jest.spyOn(state.cache, 'delete');
    state.inFlight.set(
      key,
      Promise.resolve({ functionId: 'fresh', invokeUrl: null, error: null, status: 200 }),
    );

    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'fresh',
    });
    expect(deleteCache).not.toHaveBeenCalled();
  });

  test('rejects an invalid shared in-flight resolution before returning it', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    const borrowed = Promise.resolve({ functionId: 42 });
    state.inFlight.set(key, borrowed);
    await expect(resolveWith(sdk, anonToken, true)).rejects.toThrow(
      'Invalid in-flight function resolution',
    );
    expect(state.inFlight.get(key)).toBe(borrowed);
  });

  test('leaves a replacement in-flight resolution owned by another caller', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    const response = deferred<RequestResult>();
    jest.spyOn(sdk, '_anonFetch').mockReturnValue(response.promise);

    const resolution = resolveWith(sdk, anonToken, true);
    expect(state.inFlight.has(key)).toBe(true);
    const replacement = Promise.resolve({
      functionId: 'replacement',
      error: null,
      status: 200,
    });
    state.inFlight.set(key, replacement);
    response.resolve({
      ok: true,
      status: 200,
      data: { function_id: 'first', cache_ttl_seconds: 60 },
      error: null,
    });

    await expect(within(resolution, 'first function resolution')).resolves.toMatchObject({
      functionId: 'first',
    });
    expect(state.inFlight.get(key)).toBe(replacement);
  });

  test.each([
    { status: 403, useAnonKey: false, message: 'forbidden' },
    { status: 401, useAnonKey: true, message: 'anonymous key rejected' },
  ])(
    'does not refresh a $status resolver error with useAnonKey=$useAnonKey',
    async ({ status, useAnonKey, message }) => {
      const token = useAnonKey ? anonToken : testAccessToken();
      const sdk = new VolcanoAuth({
        anonKey: anonToken,
        accessToken: token,
        refreshToken: 'refresh',
      });
      const key = functionResolveCacheKey(sdk.apiUrl, name, token, useAnonKey);
      getSharedFunctionResolveState().inFlight.set(
        key,
        Promise.resolve({ functionId: null, error: new Error(message), status }),
      );
      const refresh = jest
        .spyOn(sdk, '_refreshSessionForContext')
        .mockRejectedValue(new Error('unexpected refresh'));

      await expect(resolveWith(sdk, token, useAnonKey)).rejects.toThrow(message);
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  test('does not refresh a repeated 401 when refresh is explicitly disabled', async () => {
    const token = testAccessToken();
    const sdk = new VolcanoAuth({
      anonKey: anonToken,
      accessToken: token,
      refreshToken: 'refresh',
    });
    const key = functionResolveCacheKey(sdk.apiUrl, name, token, false);
    getSharedFunctionResolveState().inFlight.set(
      key,
      Promise.resolve({ functionId: null, error: new Error('still unauthorized'), status: 401 }),
    );
    const refresh = jest
      .spyOn(sdk, '_refreshSessionForContext')
      .mockRejectedValue(new Error('unexpected refresh'));

    await expect(
      sdk._resolveFunctionIdByName(name, {
        authContext: sdk._captureAuthContext(),
        token,
        useAnonKey: false,
        allowRefresh: false,
      }),
    ).rejects.toThrow('still unauthorized');
    expect(refresh).not.toHaveBeenCalled();
  });

  test('retries a 401 resolver response once after a successful session refresh', async () => {
    const oldToken = testAccessToken();
    const newToken = testAccessToken(undefined, { renewed: true });
    const sdk = new VolcanoAuth({
      anonKey: anonToken,
      accessToken: oldToken,
      refreshToken: 'refresh',
    });
    const key = functionResolveCacheKey(sdk.apiUrl, name, oldToken, false);
    getSharedFunctionResolveState().inFlight.set(
      key,
      Promise.resolve({ functionId: null, error: new Error('expired'), status: 401 }),
    );
    const refresh = jest
      .spyOn(sdk, '_refreshSessionForContext')
      .mockImplementationOnce(() => {
        sdk.accessToken = newToken;
        sdk.refreshToken = 'rotated';
        return Promise.resolve({
          session: { access_token: newToken, refresh_token: 'rotated', expires_in: 3600 },
          error: null,
        });
      })
      .mockRejectedValue(new Error('unexpected second refresh'));
    const fetch = jest.spyOn(sdk, '_anonFetch').mockResolvedValue({
      ok: true,
      status: 200,
      data: { function_id: 'resolved-function', cache_ttl_seconds: 60 },
      error: null,
    });

    await expect(within(resolveWith(sdk, oldToken, false), 'refreshed resolver')).resolves.toEqual({
      functionId: 'resolved-function',
      invokeUrl: undefined,
      token: newToken,
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('stops after a second resolver 401 without refreshing again', async () => {
    const oldToken = testAccessToken();
    const newToken = testAccessToken(undefined, { renewed: true });
    const sdk = new VolcanoAuth({
      anonKey: anonToken,
      accessToken: oldToken,
      refreshToken: 'refresh',
    });
    const key = functionResolveCacheKey(sdk.apiUrl, name, oldToken, false);
    getSharedFunctionResolveState().inFlight.set(
      key,
      Promise.resolve({ functionId: null, error: new Error('expired'), status: 401 }),
    );
    const refresh = jest
      .spyOn(sdk, '_refreshSessionForContext')
      .mockImplementationOnce(() => {
        sdk.accessToken = newToken;
        sdk.refreshToken = 'rotated';
        return Promise.resolve({
          session: { access_token: newToken, refresh_token: 'rotated', expires_in: 3600 },
          error: null,
        });
      })
      .mockRejectedValue(new Error('unexpected second refresh'));
    const fetch = jest.spyOn(sdk, '_anonFetch').mockResolvedValue({
      ok: false,
      status: 401,
      data: null,
      error: new Error('still unauthorized'),
    });

    await expect(within(resolveWith(sdk, oldToken, false), 'second resolver 401')).rejects.toThrow(
      'still unauthorized',
    );
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('the public test reset clears shared resolver state', () => {
    const state = getSharedFunctionResolveState();
    state.cache.set('cached', { functionId: 'f', error: null, expiresAt: Date.now() + 60_000 });
    state.inFlight.set('pending', Promise.resolve({ functionId: 'f', error: null, status: 200 }));
    state.maxEntries = 1;

    VolcanoAuth.__resetFunctionResolveCacheForTests();

    expect(VolcanoAuth.__getFunctionResolveCacheMetricsForTests()).toEqual({
      cacheSize: 0,
      inFlightSize: 0,
      maxEntries: 1024,
    });
  });

  test.each([null, ''])(
    'does not refresh a 401 resolution with %p refresh credential',
    async (refreshToken) => {
      const token = `x.${Buffer.from(JSON.stringify({ project_id: 'project' })).toString('base64url')}.x`;
      const sdk = new VolcanoAuth({ anonKey: 'ak-test', accessToken: token });
      // Browser storage can restore an empty refresh token even though constructor input normalizes it.
      sdk.refreshToken = refreshToken;
      const key = functionResolveCacheKey(sdk.apiUrl, name, token, false);
      getSharedFunctionResolveState().inFlight.set(
        key,
        Promise.resolve({ functionId: null, error: new Error('unauthorized'), status: 401 }),
      );
      const refresh = jest.spyOn(sdk, '_refreshSessionForContext');

      await expect(resolveWith(sdk, token, false)).rejects.toThrow('Session expired');
      expect(refresh).not.toHaveBeenCalled();
    },
  );

  test.each(['discarded', 'changed'] as const)(
    'does not overwrite the session after a %s refresh',
    async (outcome) => {
      const sdk = client({ refreshToken: 'refresh' });
      const token = `x.${Buffer.from(JSON.stringify({ project_id: 'project' })).toString('base64url')}.x`;
      const key = functionResolveCacheKey(sdk.apiUrl, name, token, false);
      getSharedFunctionResolveState().inFlight.set(
        key,
        Promise.resolve({ functionId: null, error: new Error('unauthorized'), status: 401 }),
      );
      jest.spyOn(sdk, '_refreshSessionForContext').mockImplementation(() => {
        if (outcome === 'changed') {
          sdk.accessToken = 'other-session';
          sdk._sessionGeneration += 1;
          return Promise.resolve({ session: null, error: null });
        }
        return Promise.resolve({ session: null, error: new AuthRefreshDiscardedError() });
      });
      await expect(resolveWith(sdk, token, false)).rejects.toBeInstanceOf(
        AuthRefreshDiscardedError,
      );
    },
  );
});
