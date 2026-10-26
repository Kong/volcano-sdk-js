/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchUrl, reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
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
    for (const id of maliciousIds) {
      const { data, error } = await volcano.functions.invoke(id, {});
      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toContain('DNS-safe');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should reject special characters before network request', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const specialIds = ['func;drop', 'func&cmd', 'func|pipe'];
    for (const id of specialIds) {
      const { error } = await volcano.functions.invoke(id, {});
      expect(error).toBeDefined();
      expect(error?.message).toContain('DNS-safe');
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should allow DNS-safe function names', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockImplementation((url) => {
      if (fetchUrl(url).startsWith('https://api.test.com/functions/resolve?name=')) {
        return Promise.resolve(
          reply(200, {
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        );
      }
      return Promise.resolve(reply(200, { result: 'success' }));
    });

    const validNames = ['my-function', 'func123', 'a'];
    for (const name of validNames) {
      const { error } = await volcano.functions.invoke(name, {});
      expect(error).toBeNull();
    }
  });
}

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions - Security', () => {
    rejectsMissingNames();
    acceptsOnlyDnsSafeNames();
  });
});
