/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoAuth,
  VolcanoSystemError,
} from '../src/index.js';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN_PROJECT_A = testAccessToken();
const TEST_ACCESS_TOKEN_PROJECT_B = testAccessToken('00000000-0000-0000-0000-000000000002');
const TEST_ACCESS_TOKEN = TEST_ACCESS_TOKEN_PROJECT_A;
const TEST_ANON_KEY = `ak-${testAccessToken('00000000-0000-0000-0000-000000000001', { role: 'anon' })}`;
let volcano: VolcanoAuth;

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

describe('VolcanoAuth function invocation and auth races', () => {
  it('should invoke function successfully', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(
      reply(200, { result: 'success', data: [1, 2, 3] }, { 'x-volcano-version': 'staging-xyz' }),
    );

    const { data, status, headers, version, error } = await volcano.functions.invoke(
      'my-function',
      { action: 'getData' },
    );

    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(version).toBe('staging-xyz');
    expect(headers['x-volcano-version']).toBe('staging-xyz');
    expect(data).toEqual({ result: 'success', data: [1, 2, 3] });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=my-function',
      expect.objectContaining({
        method: 'GET',
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ payload: { action: 'getData' } }),
      }),
    );
  });

  it('should invoke a public function with the anon key when signed out', async () => {
    const anonymousVolcano = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: TEST_ANON_KEY,
    });
    fetchMock
      .mockResolvedValueOnce(
        reply(200, {
          name: 'public-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
          cache_ttl_seconds: 300,
        }),
      )
      .mockResolvedValueOnce(reply(200, { submitted: true }));

    const result = await anonymousVolcano.functions.invoke('public-function', {
      email: 'lead@example.com',
    });

    expect(result.error).toBeNull();
    expect(result.data).toEqual({ submitted: true });
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=public-function',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_ANON_KEY}` }),
      }),
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_ANON_KEY}` }),
      }),
    );
  });

  it('should not refresh after an anon-key invocation gets a gateway 401', async () => {
    const anonymousVolcano = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: TEST_ANON_KEY,
    });
    anonymousVolcano.refreshToken = 'stale-refresh-token';
    const refresh = jest.spyOn(anonymousVolcano, '_refreshSessionForContext');
    fetchMock
      .mockResolvedValueOnce(
        reply(200, {
          name: 'public-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
          cache_ttl_seconds: 300,
        }),
      )
      .mockResolvedValueOnce(reply(401, { error: 'Unauthorized' }));

    const result = await anonymousVolcano.functions.invoke('public-function');

    expect(result).toEqual(
      expect.objectContaining({
        data: null,
        status: 401,
        error: expect.objectContaining({ isSystemError: true }),
      }),
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('rejects when a signed-in session clears during function resolution', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN,
      refresh_token: 'refresh-token',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._clearSession(volcano._captureAuthContext());
    response.resolve(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects when a signed-in session is replaced during function resolution', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_A,
      refresh_token: 'refresh-token-a',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_B,
      refresh_token: 'refresh-token-b',
      user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
    });
    response.resolve(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=my-function',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_ACCESS_TOKEN_PROJECT_A}`,
        }),
      }),
    );
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
  });

  it('rejects when an anonymous caller signs in during function resolution', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    const anonymousVolcano = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: TEST_ANON_KEY,
    });
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = anonymousVolcano.functions.invoke('public-function');
    await within(requestStarted.promise, 'function request start');
    anonymousVolcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_A,
      refresh_token: 'refresh-token-a',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    response.resolve(
      reply(200, {
        name: 'public-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=public-function',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_ANON_KEY}` }),
      }),
    );
    expect(anonymousVolcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_A);
  });

  it('does not re-resolve a 404 under a replacement session', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_A,
      refresh_token: 'refresh-token-a',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
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
      .mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_B,
      refresh_token: 'refresh-token-b',
      user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
    });
    response.resolve(reply(404, { error: 'Not found' }));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
  });

  it('discards a successful invocation response after the session is replaced', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_A,
      refresh_token: 'refresh-token-a',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
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
      .mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_B,
      refresh_token: 'refresh-token-b',
      user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
    });
    response.resolve(reply(200, { submitted: true }));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_ACCESS_TOKEN_PROJECT_A}`,
        }),
      }),
    );
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
  });

  it('returns a discarded refresh error without replaying under a replacement session', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = signal();
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_A,
      refresh_token: 'old-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
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
      .mockResolvedValueOnce(reply(401, { error: 'Token expired' }))
      .mockImplementationOnce(() => {
        refreshStarted.resolve();
        return refreshResponse.promise;
      });

    const invocation = volcano.functions.invoke('my-function', { operation: 'mutate' });
    await within(refreshStarted.promise, 'token refresh start');
    volcano._setSession({
      access_token: TEST_ACCESS_TOKEN_PROJECT_B,
      refresh_token: 'replacement-refresh',
      user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
    });
    refreshResponse.resolve(
      reply(200, {
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
    expect(volcano.currentUser).toEqual({
      id: 'user-2',
      email: 'fixture@example.com',
      status: 'active',
    });
  });

  it('should reject non-hostname-safe identifiers (no fallback)', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    const { error } = await volcano.functions.invoke('get_my_profile', { action: 'getData' });

    expect(error).toBeDefined();
    expect(error?.message).toContain('DNS-safe');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('should surface a platform-blocked invocation as a VolcanoSystemError', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    // Resolve succeeds...
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );
    // ...but the platform blocks the invocation: 400 carrying the version
    // stamp, which every response gets, and no dispatch marker, because
    // nothing ran. Omitting the version header here would be a shape the
    // server never produces, and would let a check keyed on it pass.
    fetchMock.mockResolvedValueOnce(
      reply(
        400,
        { error: 'function cannot be invoked (status: failed)' },
        { 'x-volcano-version': 'v1' },
      ),
    );

    const { data, status, error } = await volcano.functions.invoke('my-function', {
      action: 'getData',
    });

    expect(data).toBeNull();
    expect(status).toBe(400);
    expect(error).toBeInstanceOf(VolcanoSystemError);
    expect(VolcanoSystemError.is(error)).toBe(true);
    if (!VolcanoSystemError.is(error)) {
      throw new TypeError('Expected a system error');
    }
    expect(error.isSystemError).toBe(true);
    expect(error.status).toBe(400);
    expect(error.message).toBe('function cannot be invoked (status: failed)');
    // Extra fields are non-enumerable → serialization shape matches a plain
    // Error (additive, no surprise for consumer log/redaction pipelines).
    expect(Object.keys(error)).toEqual([]);
    expect(JSON.stringify(error)).toBe('{}');
    expect(error.name).toBe('VolcanoSystemError');
  });

  it('VolcanoSystemError.is() only matches system errors', () => {
    expect(VolcanoSystemError.is(new VolcanoSystemError('x', { status: 503 }))).toBe(true);
    expect(VolcanoSystemError.is(new Error('plain'))).toBe(false);
    expect(VolcanoSystemError.is(null)).toBe(false);
    expect(VolcanoSystemError.is(undefined)).toBe(false);
    expect(VolcanoSystemError.is('boom')).toBe(false);
    // Duck-typed brand → holds across a duplicate class identity.
    expect(VolcanoSystemError.is({ isSystemError: true })).toBe(true);
  });

  it('should surface a transport failure as a VolcanoSystemError with null status and cause', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    // Resolve succeeds...
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );
    // ...but the invocation fetch rejects (network down / DNS / offline).
    const networkError = new Error('network down');
    fetchMock.mockRejectedValueOnce(networkError);

    const { data, status, error } = await volcano.functions.invoke('my-function', {
      action: 'getData',
    });

    expect(data).toBeNull();
    expect(status).toBeNull();
    expect(error).toBeInstanceOf(VolcanoSystemError);
    if (!VolcanoSystemError.is(error)) {
      throw new TypeError('Expected a system error');
    }
    expect(error.isSystemError).toBe(true);
    expect(error.status).toBeNull();
    expect(error.message).toBe('network down');
    expect(error.cause).toBe(networkError);
  });

  it('should invoke on any apiUrl because the server supplies the invocation URL', async () => {
    const customVolcano = new VolcanoAuth({
      apiUrl: 'https://edge.example.com',
      anonKey: 'ak-test-anon-key',
    });
    customVolcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await customVolcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should invoke through the API path when the resolve response omits invoke_url', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await volcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${volcano.apiUrl}/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it.each([
    ['an unclosed IPv6 literal', 'https://['],
    ['a port out of range', 'https://example.test:99999/'],
    ['whitespace in the host', 'https://exa mple.test/'],
  ])('should fall back to the API path for %s', async (_label, invokeUrl) => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: invokeUrl,
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await volcano.functions.invoke('my-function', {});

    // A malformed endpoint is unusable, not fatal: the invocation still goes
    // through the API path rather than raising out of invoke().
    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${volcano.apiUrl}/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should refuse a plaintext invoke_url when the API is https', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;
    const insecureUrl = new URL('https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/');
    insecureUrl.protocol = 'http:';

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        invoke_url: insecureUrl.href,
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { ok: true }));

    const { error } = await volcano.functions.invoke('my-function', {});

    // Sending the bearer token in the clear would downgrade a credential the
    // https API keeps encrypted, so the API path is used instead.
    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      `${volcano.apiUrl}/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke`,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should use direct invoke path on localhost, where resolve omits invoke_url', async () => {
    const localVolcano = new VolcanoAuth({
      apiUrl: 'http://localhost:8000',
      anonKey: 'ak-test-anon-key',
    });
    localVolcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        name: 'my-function',
        function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        cache_ttl_seconds: 300,
      }),
    );
    fetchMock.mockResolvedValueOnce(reply(200, { result: 'success' }));

    const { error } = await localVolcano.functions.invoke('my-function', {});

    expect(error).toBeNull();
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      'http://localhost:8000/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
