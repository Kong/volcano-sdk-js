/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchUrl, reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { fetchRoutes } from './support/fetch-routes.ts';
import { config, fetchMock, withBrowserWindow } from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN = testAccessToken();
let volcano: VolcanoAuth;

function invalidFunctionName(name?: unknown): Promise<unknown> {
  const invoke: unknown = Reflect.get(volcano.functions, 'invoke');
  if (typeof invoke !== 'function') {
    throw new TypeError('Missing function invoke method');
  }
  const result: unknown = Reflect.apply(invoke, volcano.functions, [name, {}]);
  return Promise.resolve(result);
}

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function rejectsMissingNames(): void {
  it('should reject empty functionName', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const { data, error } = await volcano.functions.invoke('', {});

    expect(data).toBeNull();
    expect(error).toBeDefined();
    expect(error?.message).toBe('functionName must be a non-empty string');
  });

  it('should reject null functionName', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const result = await invalidFunctionName(null);

    expect(result).toMatchObject({
      data: null,
      error: { message: 'functionName must be a non-empty string' },
    });
  });

  it('should reject undefined functionName', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const result = await invalidFunctionName();

    expect(result).toMatchObject({
      data: null,
      error: { message: 'functionName must be a non-empty string' },
    });
  });
}

function acceptsOnlyDnsSafeNames(): void {
  it('should reject path traversal identifiers before network request', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const maliciousIds = ['../admin', '../../etc/passwd', 'func/../other'];
    const results = await Promise.all(maliciousIds.map((id) => volcano.functions.invoke(id, {})));
    for (const { data, error } of results) {
      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toContain('DNS-safe');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject special characters before network request', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const specialIds = ['func;drop', 'func&cmd', 'func|pipe'];
    const results = await Promise.all(specialIds.map((id) => volcano.functions.invoke(id, {})));
    for (const { error } of results) {
      expect(error).toBeDefined();
      expect(error?.message).toContain('DNS-safe');
    }
    expect(fetch).not.toHaveBeenCalled();
  });
}

function allowsDnsSafeNames(): void {
  it('should allow DNS-safe function names', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;
    const invokeUrl = 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/';

    fetchMock.mockImplementation(
      fetchRoutes({
        '/functions/resolve': () =>
          Promise.resolve(
            reply(200, {
              function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
              invoke_url: invokeUrl,
              cache_ttl_seconds: 300,
            }),
          ),
        '/': () => Promise.resolve(reply(200, { result: 'success' })),
      }),
    );

    const validNames = ['my-function', 'func123', 'a'];
    const results = await Promise.all(validNames.map((name) => volcano.functions.invoke(name, {})));
    for (const { error } of results) {
      expect(error).toBeNull();
    }
    const requested = fetchMock.mock.calls.map(([url]) => fetchUrl(url));
    expect(requested).toHaveLength(6);
    expect(requested).toEqual(
      expect.arrayContaining([
        ...validNames.map((name) => `https://api.test.com/functions/resolve?name=${name}`),
        invokeUrl,
      ]),
    );
  });
}

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions - Security', () => {
    rejectsMissingNames();
    acceptsOnlyDnsSafeNames();
    allowsDnsSafeNames();
  });
});
