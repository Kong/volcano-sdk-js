/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.js';
import { bodyText, fetchUrl, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN_PROJECT_A = testAccessToken();
const TEST_ACCESS_TOKEN_PROJECT_B = testAccessToken('00000000-0000-0000-0000-000000000002');
const TEST_ACCESS_TOKEN_SHARED = testAccessToken('00000000-0000-0000-0000-000000000010');
const TEST_ACCESS_TOKEN_SHARED_TWO = testAccessToken('00000000-0000-0000-0000-000000000011');
const TEST_ACCESS_TOKEN = TEST_ACCESS_TOKEN_PROJECT_A;
let volcano: VolcanoAuth;

function invalidFunctionName(name?: unknown): Promise<unknown> {
  const invoke: unknown = Reflect.get(volcano.functions, 'invoke');
  if (typeof invoke !== 'function') {
    throw new TypeError('Missing function invoke method');
  }
  const result: unknown = Reflect.apply(invoke, volcano.functions, [name, {}]);
  return Promise.resolve(result);
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, localStorage },
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

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions', () => {
    describe('local mode invoke fallback', () => {
      it('positive: resolves by name and invokes via direct API path', async () => {
        const localVolcano = new VolcanoAuth({
          apiUrl: 'http://127.0.0.1:8000',
          anonKey: 'ak-test-anon-key',
        });
        localVolcano.accessToken = TEST_ACCESS_TOKEN;

        fetchMock.mockResolvedValueOnce(
          reply(200, {
            name: 'notes-summary',
            function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            cache_ttl_seconds: 300,
          }),
        );
        fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

        const result = await localVolcano.functions.invoke('notes-summary', {
          limit: 5,
        });

        expect(result.error).toBeNull();
        expect(fetch).toHaveBeenNthCalledWith(
          1,
          'http://127.0.0.1:8000/functions/resolve?name=notes-summary',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(fetch).toHaveBeenNthCalledWith(
          2,
          'http://127.0.0.1:8000/functions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/invoke',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ payload: { limit: 5 } }),
          }),
        );
      });

      it('negative: returns function not found when local resolve returns 404', async () => {
        const localVolcano = new VolcanoAuth({
          apiUrl: 'http://localhost:8000',
          anonKey: 'ak-test-anon-key',
        });
        localVolcano.accessToken = TEST_ACCESS_TOKEN;

        fetchMock.mockResolvedValueOnce(reply(404, { error: 'Function not found' }));

        const result = await localVolcano.functions.invoke('missing-function', {});

        expect(result.data).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error?.message.toLowerCase()).toBe('function not found');
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      it('negative: fails when local resolve response has invalid function_id', async () => {
        const localVolcano = new VolcanoAuth({
          apiUrl: 'http://localhost:8000',
          anonKey: 'ak-test-anon-key',
        });
        localVolcano.accessToken = TEST_ACCESS_TOKEN;

        fetchMock.mockResolvedValueOnce(
          reply(200, {
            name: 'notes-summary',
            function_id: 'INVALID-ID',
            cache_ttl_seconds: 300,
          }),
        );

        const result = await localVolcano.functions.invoke('notes-summary', {});

        expect(result.data).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error?.message).toBe('Resolve response missing valid function_id');
        expect(fetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should reject invocation when access token is not a JWT', async () => {
      volcano.accessToken = 'not-a-jwt-token';

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toBe('accessToken must be a JWT with project_id claim');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should send the fixed local anon key to the function resolver', async () => {
      const localAnonKey = 'ak-0000000000000000000000000000000000000000';
      const anonymousVolcano = new VolcanoAuth({
        apiUrl: 'http://localhost:8000',
        anonKey: localAnonKey,
      });
      fetchMock.mockResolvedValueOnce(reply(404, { error: 'Function not found' }));

      const { data, error } = await anonymousVolcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toEqual(expect.objectContaining({ message: 'Function not found' }));
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/functions/resolve?name=my-function',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${localAnonKey}` }),
        }),
      );
    });

    it('should reject invocation when JWT is missing project_id claim', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString(
        'base64url',
      );
      const payload = Buffer.from(JSON.stringify({ sub: 'user-123' })).toString('base64url');
      volcano.accessToken = `${header}.${payload}.test-signature`;

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toBe('accessToken missing project_id claim');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject resolver responses without valid cache_ttl_seconds', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          name: 'my-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        }),
      );

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toBe('Resolve response missing valid cache_ttl_seconds');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle server errors gracefully', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          name: 'my-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
          cache_ttl_seconds: 300,
        }),
      );
      fetchMock.mockResolvedValueOnce(reply(500, { error: 'Internal server error' }));

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
    });

    it('should handle rate limit errors', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          name: 'my-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
          cache_ttl_seconds: 300,
        }),
      );
      fetchMock.mockResolvedValueOnce(reply(429, { error: 'Rate limit exceeded' }));

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
    });

    it('should passthrough a non-2xx the function itself returned', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          name: 'my-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
          cache_ttl_seconds: 300,
        }),
      );
      // The dispatch marker is what makes this the function's answer. The
      // version stamp alone cannot: the server puts it on every response,
      // including the ones it refuses before the function runs.
      fetchMock.mockResolvedValueOnce(
        reply(
          402,
          { error: 'payment required' },
          {
            'x-volcano-version': 'staging-xyz',
            'x-volcano-function-invoked': 'true',
          },
        ),
      );

      const { data, status, headers, version, error } = await volcano.functions.invoke(
        'my-function',
        {},
      );

      expect(error).toBeNull();
      expect(status).toBe(402);
      expect(version).toBe('staging-xyz');
      expect(headers['x-volcano-version']).toBe('staging-xyz');
      expect(data).toEqual({ error: 'payment required' });
    });
    it('should cache name-to-id resolution and skip repeated resolve calls', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockImplementation(() => Promise.resolve(reply(200, { result: 'ok' })));

      const first = await volcano.functions.invoke('my-function', {});
      const second = await volcano.functions.invoke('my-function', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
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
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: '11111111-1111-1111-1111-111111111111',
            invoke_url: 'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
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

    it('should invalidate stale function ID mapping on invoke 404 and retry with fresh resolve', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: '11111111-1111-1111-1111-111111111111',
            invoke_url: 'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(
          reply(404, { error: 'function not found' }, { 'x-volcano-version': 'v1' }),
        )
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: '22222222-2222-2222-2222-222222222222',
            invoke_url: 'https://22222222-2222-2222-2222-222222222222.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'recovered' }));

      const { data, error } = await volcano.functions.invoke('my-function', { action: 'retry' });

      expect(error).toBeNull();
      expect(data).toEqual({ result: 'recovered' });
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://22222222-2222-2222-2222-222222222222.functions.test.run/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ payload: { action: 'retry' } }),
        }),
      );
    });

    it('should fail after stale ID invalidation when second resolve is still missing', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: '11111111-1111-1111-1111-111111111111',
            invoke_url: 'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(404, { error: 'function not found' }))
        .mockResolvedValueOnce(reply(404, { error: 'function not found' }));

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error?.message).toBe('function not found');
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should share resolver cache across instances with the same server-side token', async () => {
      jest.clearAllMocks();
      const sharedToken = TEST_ACCESS_TOKEN_SHARED;
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockImplementation(() => Promise.resolve(reply(200, { result: 'ok' })));

      const first = await instanceA.functions.invoke('my-function', { call: 1 });
      const second = await instanceB.functions.invoke('my-function', { call: 2 });

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      const storageRead: unknown = Reflect.get(localStorage, 'getItem');
      expect(storageRead).not.toHaveBeenCalled();
    });

    it('should isolate resolver cache across different auth scopes', async () => {
      jest.clearAllMocks();
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: TEST_ACCESS_TOKEN_PROJECT_A,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: TEST_ACCESS_TOKEN_PROJECT_B,
      });

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'shared-name',
            function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            invoke_url: 'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'from-a' }))
        .mockResolvedValueOnce(
          reply(200, {
            name: 'shared-name',
            function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            invoke_url: 'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'from-b' }));

      const a = await instanceA.functions.invoke('shared-name', {});
      const b = await instanceB.functions.invoke('shared-name', {});

      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=shared-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=shared-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should isolate resolver cache for different tokens in the same project', async () => {
      jest.clearAllMocks();
      const tokenOne = testAccessToken('00000000-0000-0000-0000-0000000000aa', { sid: 'one' });
      const tokenTwo = testAccessToken('00000000-0000-0000-0000-0000000000aa', { sid: 'two' });

      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: tokenOne,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: tokenTwo,
      });

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'same-name',
            function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            invoke_url: 'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'token-one' }))
        .mockResolvedValueOnce(
          reply(200, {
            name: 'same-name',
            function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            invoke_url: 'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'token-two' }));

      const first = await instanceA.functions.invoke('same-name', {});
      const second = await instanceB.functions.invoke('same-name', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=same-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=same-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should not reuse resolver cache after auth token changes on the same instance', async () => {
      jest.clearAllMocks();
      volcano.accessToken = TEST_ACCESS_TOKEN_PROJECT_A;

      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            invoke_url: 'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'from-a' }))
        .mockResolvedValueOnce(
          reply(200, {
            name: 'my-function',
            function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            invoke_url: 'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
        )
        .mockResolvedValueOnce(reply(200, { result: 'from-b' }));

      const first = await volcano.functions.invoke('my-function', {});
      volcano.accessToken = TEST_ACCESS_TOKEN_PROJECT_B;
      const second = await volcano.functions.invoke('my-function', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should isolate auth context while deduping resolve requests across instances', async () => {
      jest.clearAllMocks();
      const sharedToken = TEST_ACCESS_TOKEN_SHARED_TWO;
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });

      let resolveCalls = 0;
      const resolveStarted = signal();
      const resolveGate = signal();

      fetchMock.mockImplementation(async (url) => {
        const requestUrl = fetchUrl(url);
        if (requestUrl === 'https://api.test.com/functions/resolve?name=my-function') {
          resolveCalls += 1;
          resolveStarted.resolve();
          await within(resolveGate.promise, 'shared resolver release');
          return reply(200, {
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          });
        }
        return reply(200, { result: 'ok' });
      });

      const invokeA = instanceA.functions.invoke('my-function', { call: 'a' });
      const invokeB = instanceB.functions.invoke('my-function', { call: 'b' });
      await within(resolveStarted.promise, 'shared resolver request');
      instanceA._setSession({
        access_token: TEST_ACCESS_TOKEN_PROJECT_B,
        refresh_token: 'refresh-token-b',
        user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
      });
      resolveGate.resolve();
      const [resultA, resultB] = await within(
        Promise.all([invokeA, invokeB]),
        'shared function invocations',
      );

      expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
      expect(resultB.error).toBeNull();
      expect(resolveCalls).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should validate each caller when a shared resolve request fails', async () => {
      jest.clearAllMocks();
      const sharedToken = TEST_ACCESS_TOKEN_SHARED_TWO;
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });

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
      instanceA._setSession({
        access_token: TEST_ACCESS_TOKEN_PROJECT_B,
        refresh_token: 'refresh-token-b',
        user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
      });
      resolveGate.resolve();
      const [resultA, resultB] = await within(
        Promise.all([invokeA, invokeB]),
        'shared function invocations',
      );

      expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
      expect(resultB.error).toEqual(expect.objectContaining({ message: 'Function not found' }));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh a shared resolver 401 in each unchanged caller context', async () => {
      jest.clearAllMocks();
      const sharedToken = testAccessToken('00000000-0000-0000-0000-000000000011', {
        session_id: '00000000-0000-4000-8000-000000000013',
        renewed: false,
      });
      const refreshedToken = testAccessToken('00000000-0000-0000-0000-000000000011', {
        session_id: '00000000-0000-4000-8000-000000000013',
      });
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
        refreshToken: 'refresh-token-a',
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
        refreshToken: 'refresh-token-b',
      });

      const resolveStarted = signal();
      const resolveGate = signal();
      let resolveCalls = 0;
      let refreshCalls = 0;
      const refreshBodies: unknown[] = [];
      fetchMock.mockImplementation(async (url, options = {}) => {
        const requestUrl = fetchUrl(url);
        if (requestUrl === 'https://api.test.com/functions/resolve?name=my-function') {
          resolveCalls += 1;
          if (resolveCalls === 1) {
            resolveStarted.resolve();
            await within(resolveGate.promise, 'shared function resolve release');
            return reply(401, { error: 'Token expired' });
          }
          return reply(200, {
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          });
        }
        if (requestUrl === 'https://api.test.com/auth/refresh') {
          refreshCalls += 1;
          const body: unknown = JSON.parse(bodyText(options));
          refreshBodies.push(body);
          return reply(200, {
            access_token: refreshedToken,
            refresh_token: 'rotated-refresh-token-b',
            user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
            expires_in: 3600,
          });
        }
        return reply(200, { result: 'ok' });
      });

      const invokeA = instanceA.functions.invoke('my-function');
      const invokeB = instanceB.functions.invoke('my-function');
      await within(resolveStarted.promise, 'shared function resolve request');
      instanceA._setSession({
        access_token: TEST_ACCESS_TOKEN_PROJECT_B,
        refresh_token: 'replacement-refresh-token',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      resolveGate.resolve();
      const [resultA, resultB] = await within(
        Promise.all([invokeA, invokeB]),
        'shared function invocations',
      );

      expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
      expect(resultB).toEqual(expect.objectContaining({ data: { result: 'ok' }, error: null }));
      expect(instanceB.accessToken).toBe(refreshedToken);
      expect(resolveCalls).toBe(2);
      expect(refreshCalls).toBe(1);
      expect(refreshBodies).toEqual([{ refresh_token: 'refresh-token-b' }]);
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('should cap resolver cache size and evict oldest-expiring entries', async () => {
      jest.clearAllMocks();
      VolcanoAuth.__setFunctionResolveCacheMaxEntriesForTests(2);
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const idByName: Record<string, string> = {
        'f-one': '11111111-1111-1111-1111-111111111111',
        'f-two': '22222222-2222-2222-2222-222222222222',
        'f-three': '33333333-3333-3333-3333-333333333333',
      };

      let resolveCalls = 0;
      fetchMock.mockImplementation((url) => {
        const requestUrl = fetchUrl(url);
        if (requestUrl.startsWith('https://api.test.com/functions/resolve?name=')) {
          resolveCalls += 1;
          const name = new URL(requestUrl).searchParams.get('name');
          if (name === null) {
            throw new TypeError('Missing function name');
          }
          const functionId = idByName[name];
          if (functionId === undefined) {
            throw new TypeError('Unexpected function name');
          }
          return Promise.resolve(
            reply(200, {
              name,
              function_id: functionId,
              invoke_url: `https://${functionId}.functions.test.run/`,
              cache_ttl_seconds: 300,
            }),
          );
        }

        return Promise.resolve(reply(200, { ok: true }));
      });

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
  });

  describe('Functions - Security', () => {
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
  });
});
