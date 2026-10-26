/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchUrl, reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import {
  config,
  expectFetchSequence,
  fetchMock,
  resolvedFunction,
  withBrowserWindow,
} from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN = testAccessToken();
const CAPPED_FUNCTION_IDS: Record<string, string> = {
  'f-one': '11111111-1111-1111-1111-111111111111',
  'f-two': '22222222-2222-2222-2222-222222222222',
  'f-three': '33333333-3333-3333-3333-333333333333',
};
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function respondByName(url: RequestInfo | URL, onResolve: () => void): Promise<Response> {
  const requestUrl = fetchUrl(url);
  if (requestUrl.startsWith('https://api.test.com/functions/resolve?name=')) {
    onResolve();
    const name = new URL(requestUrl).searchParams.get('name');
    if (name === null) {
      throw new TypeError('Missing function name');
    }
    const functionId = CAPPED_FUNCTION_IDS[name];
    if (functionId === undefined) {
      throw new TypeError('Unexpected function name');
    }
    return Promise.resolve(resolvedFunction(name, functionId));
  }

  return Promise.resolve(reply(200, { ok: true }));
}

function cachesResolvedNames(): void {
  it('should cache name-to-id resolution and skip repeated resolve calls', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function'))
      .mockImplementation(() => Promise.resolve(reply(200, { result: 'ok' })));

    const first = await volcano.functions.invoke('my-function', {});
    const second = await volcano.functions.invoke('my-function', {});

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(3);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
      ['https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/', 'POST'],
      ['https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/', 'POST'],
    ]);
  });

  it('should cache missing-function resolve failures and avoid repeated lookups', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(404, { error: 'function not found' }));

    const first = await volcano.functions.invoke('missing-function', {});
    const second = await volcano.functions.invoke('missing-function', {});

    expect(first.data).toBeNull();
    expect(second.data).toBeNull();
    expect(first.error).toBeDefined();
    expect(second.error).toBeDefined();
    expect(first.error?.message).toBe('function not found');
    expect(second.error?.message).toBe('function not found');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/functions/resolve?name=missing-function',
      expect.objectContaining({ method: 'GET' }),
    );
  });
}

function stopsOnTerminalErrors(): void {
  it('should return resolver auth errors and never call invoke endpoint', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(401, { error: 'invalid token' }));

    const { data, error } = await volcano.functions.invoke('my-function', {});

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error?.message).toBe('Session expired');
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/functions/resolve?name=my-function',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('should return a function-owned 404 without invoking twice', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function', '11111111-1111-1111-1111-111111111111'))
      .mockResolvedValueOnce(
        reply(
          404,
          { error: 'no such route' },
          {
            'x-volcano-version': 'v1',
            'x-volcano-function-invoked': 'true',
          },
        ),
      );

    const { status, version, error } = await volcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(status).toBe(404);
    expect(version).toBe('v1');
    // Resolve plus one invocation: a retry would run the caller's function twice.
    expect(fetch).toHaveBeenCalledTimes(2);
  });
}

function invalidatesStaleFunctionIds(): void {
  it('should invalidate stale function ID mapping on invoke 404 and retry with fresh resolve', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function', '11111111-1111-1111-1111-111111111111'))
      .mockResolvedValueOnce(reply(404, { error: 'function not found' }, { 'x-volcano-version': 'v1' }))
      .mockResolvedValueOnce(resolvedFunction('my-function', '22222222-2222-2222-2222-222222222222'))
      .mockResolvedValueOnce(reply(200, { result: 'recovered' }));

    const { data, error } = await volcano.functions.invoke('my-function', { action: 'retry' });

    expect(error).toBeNull();
    expect(data).toEqual({ result: 'recovered' });
    expect(fetch).toHaveBeenCalledTimes(4);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
      ['https://11111111-1111-1111-1111-111111111111.functions.test.run/', 'POST'],
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
    ]);
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      'https://22222222-2222-2222-2222-222222222222.functions.test.run/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ payload: { action: 'retry' } }),
      }),
    );
  });
}

function failsWhenStaleFunctionStaysMissing(): void {
  it('should fail after stale ID invalidation when second resolve is still missing', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function', '11111111-1111-1111-1111-111111111111'))
      .mockResolvedValueOnce(reply(404, { error: 'function not found' }))
      .mockResolvedValueOnce(reply(404, { error: 'function not found' }));

    const { data, error } = await volcano.functions.invoke('my-function', {});

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error?.message).toBe('function not found');
    expect(fetch).toHaveBeenCalledTimes(3);
    expectFetchSequence([
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
      ['https://11111111-1111-1111-1111-111111111111.functions.test.run/', 'POST'],
      ['https://api.test.com/functions/resolve?name=my-function', 'GET'],
    ]);
  });
}

function capsResolverCache(): void {
  it('should cap resolver cache size and evict oldest-expiring entries', async () => {
    jest.clearAllMocks();
    VolcanoAuth.__setFunctionResolveCacheMaxEntriesForTests(2);
    volcano.accessToken = TEST_ACCESS_TOKEN;

    let resolveCalls = 0;
    fetchMock.mockImplementation((url) =>
      respondByName(url, () => {
        resolveCalls += 1;
      }),
    );

    const first = await volcano.functions.invoke('f-one', {});
    const second = await volcano.functions.invoke('f-two', {});
    const third = await volcano.functions.invoke('f-three', {});
    const fourth = await volcano.functions.invoke('f-one', {});

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(third.error).toBeNull();
    expect(fourth.error).toBeNull();
    expect(resolveCalls).toBe(4);

    const metrics = VolcanoAuth.__getFunctionResolveCacheMetricsForTests();
    expect(metrics.maxEntries).toBe(2);
    expect(metrics.cacheSize).toBeLessThanOrEqual(2);
  });
}

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions', () => {
    cachesResolvedNames();
    stopsOnTerminalErrors();
    invalidatesStaleFunctionIds();
    failsWhenStaleFunctionStaysMissing();
    capsResolverCache();
  });
});
