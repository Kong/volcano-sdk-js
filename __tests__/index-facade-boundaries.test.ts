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

beforeEach(clearSharedFunctionResolveStateForTests);
afterEach(() => {
  jest.restoreAllMocks();
});

function client(
  options: { apiUrl?: string; timeout?: number; refreshToken?: string } = {},
): VolcanoAuth {
  return new VolcanoAuth({ anonKey: 'ak-test', accessToken: 'access', ...options });
}

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
});

describe('facade auth lifecycle boundary', () => {
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

  test('rejects an invalid shared in-flight resolution before returning it', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    state.inFlight.set(key, Promise.resolve({ functionId: 42 }));
    await expect(resolveWith(sdk, anonToken, true)).rejects.toThrow(
      'Invalid in-flight function resolution',
    );
  });

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
