/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { bodyText, fetchUrl, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { fetchRoutes } from './support/fetch-routes.ts';
import {
  config,
  fetchMock,
  resolvedFunction,
  session,
  withBrowserWindow,
} from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN_PROJECT_B = testAccessToken('00000000-0000-0000-0000-000000000002');
const TEST_ACCESS_TOKEN_SHARED_TWO = testAccessToken('00000000-0000-0000-0000-000000000011');
const REFRESHED_TOKEN = testAccessToken('00000000-0000-0000-0000-000000000011', {
  session_id: '00000000-0000-4000-8000-000000000013',
});

interface RefreshProbe {
  resolveStarted: ReturnType<typeof signal>;
  resolveGate: ReturnType<typeof signal>;
  resolveCalls: number;
  refreshCalls: number;
  refreshBodies: unknown[];
}

withBrowserWindow();

async function answerAfterSharedRefresh(
  probe: RefreshProbe,
  url: RequestInfo | URL,
  options: RequestInit,
): Promise<Response> {
  const requestUrl = fetchUrl(url);
  if (requestUrl === 'https://api.test.com/functions/resolve?name=my-function') {
    probe.resolveCalls += 1;
    if (probe.resolveCalls === 1) {
      probe.resolveStarted.resolve();
      await within(probe.resolveGate.promise, 'shared function resolve release');
      return reply(401, { error: 'Token expired' });
    }
    return resolvedFunction('my-function');
  }
  if (requestUrl === 'https://api.test.com/auth/refresh') {
    probe.refreshCalls += 1;
    const body: unknown = JSON.parse(bodyText(options));
    probe.refreshBodies.push(body);
    return reply(200, {
      access_token: REFRESHED_TOKEN,
      refresh_token: 'rotated-refresh-token-b',
      user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
      expires_in: 3600,
    });
  }
  return reply(200, { result: 'ok' });
}

function dedupesResolveAcrossContexts(): void {
  it('should isolate auth context while deduping resolve requests across instances', async () => {
    jest.clearAllMocks();
    const sharedToken = TEST_ACCESS_TOKEN_SHARED_TWO;
    const instanceA = new VolcanoAuth({ ...config, accessToken: sharedToken });
    const instanceB = new VolcanoAuth({ ...config, accessToken: sharedToken });

    let resolveCalls = 0;
    const resolveStarted = signal();
    const resolveGate = signal();

    fetchMock.mockImplementation(
      fetchRoutes({
        '/functions/resolve': async () => {
          resolveCalls += 1;
          resolveStarted.resolve();
          await within(resolveGate.promise, 'shared resolver release');
          return resolvedFunction('my-function');
        },
        '/': () => Promise.resolve(reply(200, { result: 'ok' })),
      }),
    );

    const invokeA = instanceA.functions.invoke('my-function', { call: 'a' });
    const invokeB = instanceB.functions.invoke('my-function', { call: 'b' });
    await within(resolveStarted.promise, 'shared resolver request');
    instanceA._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'refresh-token-b', 'user-b'));
    resolveGate.resolve();
    const [resultA, resultB] = await within(Promise.all([invokeA, invokeB]), 'shared function invocations');

    expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
    expect(resultB.error).toBeNull();
    expect(resolveCalls).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => fetchUrl(url))).toEqual([
      'https://api.test.com/functions/resolve?name=my-function',
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
    ]);
  });
}

function validatesEachSharedResolveCaller(): void {
  it('should validate each caller when a shared resolve request fails', async () => {
    jest.clearAllMocks();
    const sharedToken = TEST_ACCESS_TOKEN_SHARED_TWO;
    const instanceA = new VolcanoAuth({ ...config, accessToken: sharedToken });
    const instanceB = new VolcanoAuth({ ...config, accessToken: sharedToken });

    const resolveStarted = signal();
    const resolveGate = signal();
    fetchMock.mockImplementationOnce(async () => {
      resolveStarted.resolve();
      await within(resolveGate.promise, 'shared function resolve release');
      return reply(404, { error: 'Function not found' });
    });

    const invokeA = instanceA.functions.invoke('missing-function');
    const invokeB = instanceB.functions.invoke('missing-function');
    await within(resolveStarted.promise, 'shared function resolve request');
    instanceA._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'refresh-token-b', 'user-b'));
    resolveGate.resolve();
    const [resultA, resultB] = await within(Promise.all([invokeA, invokeB]), 'shared function invocations');

    expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
    expect(resultB.error).toEqual(expect.objectContaining({ message: 'Function not found' }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
}

function refreshesSharedResolveRejection(): void {
  it('should refresh a shared resolver 401 in each unchanged caller context', async () => {
    jest.clearAllMocks();
    const sharedToken = testAccessToken('00000000-0000-0000-0000-000000000011', {
      session_id: '00000000-0000-4000-8000-000000000013',
      renewed: false,
    });
    const instanceA = new VolcanoAuth({ ...config, accessToken: sharedToken, refreshToken: 'refresh-token-a' });
    const instanceB = new VolcanoAuth({ ...config, accessToken: sharedToken, refreshToken: 'refresh-token-b' });
    const probe: RefreshProbe = {
      resolveStarted: signal(),
      resolveGate: signal(),
      resolveCalls: 0,
      refreshCalls: 0,
      refreshBodies: [],
    };
    fetchMock.mockImplementation((url, options = {}) => answerAfterSharedRefresh(probe, url, options));

    const invokeA = instanceA.functions.invoke('my-function');
    const invokeB = instanceB.functions.invoke('my-function');
    await within(probe.resolveStarted.promise, 'shared function resolve request');
    instanceA._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'replacement-refresh-token', 'replacement-user'));
    probe.resolveGate.resolve();
    const [resultA, resultB] = await within(Promise.all([invokeA, invokeB]), 'shared function invocations');

    expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
    expect(resultB).toEqual(expect.objectContaining({ data: { result: 'ok' }, error: null }));
    expect(instanceB.accessToken).toBe(REFRESHED_TOKEN);
    expect(probe.resolveCalls).toBe(2);
    expect(probe.refreshCalls).toBe(1);
    expect(probe.refreshBodies).toEqual([{ refresh_token: 'refresh-token-b' }]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });
}

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions', () => {
    dedupesResolveAcrossContexts();
    validatesEachSharedResolveCaller();
    refreshesSharedResolveRejection();
  });
});
