/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { config, fetchMock, resolvedFunction, withBrowserWindow } from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN = testAccessToken();
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function resolvesThroughLocalApi(): void {
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
}

function reportsLocalResolveFailures(): void {
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
}

function checksCallerCredentials(): void {
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
}

function rejectsIncompleteClaimsAndResolutions(): void {
  it('should reject invocation when JWT is missing project_id claim', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
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
}

function reportsInvocationFailures(): void {
  it('should handle server errors gracefully', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
    fetchMock.mockResolvedValueOnce(reply(500, { error: 'Internal server error' }));

    const { data, error } = await volcano.functions.invoke('my-function', {});

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });

  it('should handle rate limit errors', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
    fetchMock.mockResolvedValueOnce(reply(429, { error: 'Rate limit exceeded' }));

    const { data, error } = await volcano.functions.invoke('my-function', {});

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
}

function passesThroughFunctionResponses(): void {
  it('should passthrough a non-2xx the function itself returned', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function'));
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

    const { data, status, headers, version, error } = await volcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(status).toBe(402);
    expect(version).toBe('staging-xyz');
    expect(headers['x-volcano-version']).toBe('staging-xyz');
    expect(data).toEqual({ error: 'payment required' });
  });
}

describe('VolcanoAuth function resolution, cache, and input validation', () => {
  describe('Functions', () => {
    describe('local mode invoke fallback', () => {
      resolvesThroughLocalApi();
      reportsLocalResolveFailures();
    });

    checksCallerCredentials();
    rejectsIncompleteClaimsAndResolutions();
    reportsInvocationFailures();
    passesThroughFunctionResponses();
  });
});
