/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { RequestResult } from '../src/auth-request.ts';
import {
  clearSharedFunctionResolveStateForTests,
  functionResolveCacheKey,
  getSharedFunctionResolveState,
} from '../src/function-resolve-cache.ts';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { deferred, signal, within } from './auth-concurrency-fixtures.ts';
import { anonToken, name, resolveWith } from './support/index-facade-resolution.ts';

beforeEach(clearSharedFunctionResolveStateForTests);
afterEach(() => {
  jest.restoreAllMocks();
});

function client(options: { apiUrl?: string; timeout?: number; refreshToken?: string } = {}): VolcanoAuth {
  return new VolcanoAuth({ anonKey: 'ak-test', accessToken: 'access', ...options });
}

function resolvesFromCredentialScopedCache(): void {
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
    state.inFlight.set(key, Promise.resolve({ functionId: 'fresh', invokeUrl: null, error: null, status: 200 }));
    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'fresh',
    });
    expect(state.cache.has(key)).toBe(false);
  });
}

function prunesAndGuardsTheCache(): void {
  test('prunes expired resolutions for other functions when reading the cache', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    const expiredKey = functionResolveCacheKey(sdk.apiUrl, 'invoices', anonToken, true);
    state.cache.set(key, {
      functionId: 'cached-function',
      invokeUrl: null,
      error: null,
      expiresAt: Date.now() + 10_000,
    });
    state.cache.set(expiredKey, { functionId: 'expired', error: null, expiresAt: Date.now() - 1 });

    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'cached-function',
    });
    expect([...state.cache.keys()]).toEqual([key]);
  });

  test('rejects a changed session before returning a cached resolution', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    state.cache.set(key, {
      functionId: 'cached-function',
      invokeUrl: null,
      error: null,
      expiresAt: Date.now() + 10_000,
    });
    const authContext = sdk._captureAuthContext();
    sdk._sessionGeneration += 1;

    await expect(
      sdk._resolveFunctionIdByName(name, { authContext, token: anonToken, useAnonKey: true }),
    ).rejects.toThrow(AuthSessionChangedError);
  });
}

function handlesSessionChangesAndExpiry(): void {
  test('reports a session change instead of a shared resolution failure', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    const settle = signal();
    state.inFlight.set(
      key,
      settle.promise.then(() => {
        throw new Error('resolver unavailable');
      }),
    );

    const resolution = resolveWith(sdk, anonToken, true);
    sdk._sessionGeneration += 1;
    settle.resolve();
    await expect(resolution).rejects.toThrow(AuthSessionChangedError);
  });

  test('treats a resolver cache entry expiring now as stale', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    state.lastPruneAtMs = now;
    state.cache.set(key, { functionId: 'expired', error: null, expiresAt: now });
    state.inFlight.set(key, Promise.resolve({ functionId: 'fresh', invokeUrl: null, error: null, status: 200 }));

    await expect(resolveWith(sdk, anonToken, true)).resolves.toMatchObject({
      functionId: 'fresh',
    });
    expect(state.cache.has(key)).toBe(false);
  });
}

function validatesSharedEntries(): void {
  test('does not delete an absent resolver cache entry', async () => {
    const sdk = client();
    const state = getSharedFunctionResolveState();
    const key = functionResolveCacheKey(sdk.apiUrl, name, anonToken, true);
    state.lastPruneAtMs = Date.now();
    const deleteCache = jest.spyOn(state.cache, 'delete');
    state.inFlight.set(key, Promise.resolve({ functionId: 'fresh', invokeUrl: null, error: null, status: 200 }));

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
    await expect(resolveWith(sdk, anonToken, true)).rejects.toThrow('Invalid in-flight function resolution');
    expect(state.inFlight.get(key)).toBe(borrowed);
  });
}

function keepsReplacementInFlight(): void {
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
}

describe('shared function resolution boundary', () => {
  resolvesFromCredentialScopedCache();
  prunesAndGuardsTheCache();
  handlesSessionChangesAndExpiry();
  validatesSharedEntries();
  keepsReplacementInFlight();
});
