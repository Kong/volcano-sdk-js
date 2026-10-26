/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  clearSharedFunctionResolveStateForTests,
  getSharedFunctionResolveState,
} from '../src/function-resolve-cache.ts';
import { loadRealtime, VolcanoAuth } from '../src/index.ts';
import { within } from './auth-concurrency-fixtures.ts';

beforeEach(clearSharedFunctionResolveStateForTests);
afterEach(() => {
  jest.restoreAllMocks();
});

function client(options: { apiUrl?: string; timeout?: number; refreshToken?: string } = {}): VolcanoAuth {
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
      .mockResolvedValueOnce(Response.json({ user: { id: 'user', email: 'u@example.test', status: 'active' } }));

    await expect(sdk.auth.getUser()).resolves.toMatchObject({ user: { id: 'user' }, error: null });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(null);
  });
});

function suppliesTransportOptions(): void {
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
}

function loadsModulesAndBoundsCaches(): void {
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
}

describe('facade fetch and module boundaries', () => {
  suppliesTransportOptions();
  loadsModulesAndBoundsCaches();
});
