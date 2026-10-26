/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import {
  clearSharedFunctionResolveStateForTests,
  functionResolveCacheKey,
  getSharedFunctionResolveState,
} from '../src/function-resolve-cache.ts';
import { AuthRefreshDiscardedError, VolcanoAuth } from '../src/index.ts';
import { within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { anonToken, name, resolveWith } from './support/index-facade-resolution.ts';

beforeEach(clearSharedFunctionResolveStateForTests);
afterEach(() => {
  jest.restoreAllMocks();
});

function client(options: { apiUrl?: string; timeout?: number; refreshToken?: string } = {}): VolcanoAuth {
  return new VolcanoAuth({ anonKey: 'ak-test', accessToken: 'access', ...options });
}

function skipsRefreshForRejectedCredentials(): void {
  test.each([
    { status: 403, useAnonKey: false, message: 'forbidden', token: testAccessToken() },
    { status: 401, useAnonKey: true, message: 'anonymous key rejected', token: anonToken },
  ])(
    'does not refresh a $status resolver error with useAnonKey=$useAnonKey',
    async ({ status, useAnonKey, message, token }) => {
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
      const refresh = jest.spyOn(sdk, '_refreshSessionForContext').mockRejectedValue(new Error('unexpected refresh'));

      await expect(resolveWith(sdk, token, useAnonKey)).rejects.toThrow(message);
      expect(refresh).not.toHaveBeenCalled();
    },
  );
}

function skipsRefreshWhenDisabled(): void {
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
    const refresh = jest.spyOn(sdk, '_refreshSessionForContext').mockRejectedValue(new Error('unexpected refresh'));

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
}

function retriesOnceAfterRefresh(): void {
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
}

function stopsAfterASecond401(): void {
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
}

function resetsStateAndRefusesEmptyRefresh(): void {
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

  test.each([null, ''])('does not refresh a 401 resolution with %p refresh credential', async (refreshToken) => {
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
  });
}

type RefreshOutcome = (sdk: VolcanoAuth) => ReturnType<VolcanoAuth['_refreshSessionForContext']>;

function discardRefresh(): ReturnType<RefreshOutcome> {
  return Promise.resolve({ session: null, error: new AuthRefreshDiscardedError() });
}

function changeSessionDuringRefresh(sdk: VolcanoAuth): ReturnType<RefreshOutcome> {
  sdk.accessToken = 'other-session';
  sdk._sessionGeneration += 1;
  return Promise.resolve({ session: null, error: null });
}

function keepsTheCurrentSession(): void {
  test.each<[string, RefreshOutcome]>([
    ['discarded', discardRefresh],
    ['changed', changeSessionDuringRefresh],
  ])('does not overwrite the session after a %s refresh', async (_outcome, refresh) => {
    const sdk = client({ refreshToken: 'refresh' });
    const token = `x.${Buffer.from(JSON.stringify({ project_id: 'project' })).toString('base64url')}.x`;
    const key = functionResolveCacheKey(sdk.apiUrl, name, token, false);
    getSharedFunctionResolveState().inFlight.set(
      key,
      Promise.resolve({ functionId: null, error: new Error('unauthorized'), status: 401 }),
    );
    jest.spyOn(sdk, '_refreshSessionForContext').mockImplementation(() => refresh(sdk));
    await expect(resolveWith(sdk, token, false)).rejects.toBeInstanceOf(AuthRefreshDiscardedError);
  });
}

describe('shared function resolution boundary', () => {
  skipsRefreshForRejectedCredentials();
  skipsRefreshWhenDisabled();
  retriesOnceAfterRefresh();
  stopsAfterASecond401();
  resetsStateAndRefusesEmptyRefresh();
  keepsTheCurrentSession();
});
