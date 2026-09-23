/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import { AuthRefreshDiscardedError, VolcanoSystemError } from '../src/errors.ts';
import { type FunctionInvocationHost, invokeFunction } from '../src/function-invoke.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

interface HostFixture {
  host: FunctionInvocationHost;
  context: AuthContext;
  setToken(token: string | null): void;
}

function hostFixture(): HostFixture {
  const operations = new AuthSessionOperations<RefreshResult, SignOutResult>();
  let token: string | null = 'user-token';
  const context: AuthContext = {
    generation: 1,
    operations,
    userId: 'user-1',
    accessToken: 'user-token',
    refreshToken: 'refresh-token',
  };
  const host: FunctionInvocationHost = {
    anonKey: 'anon-token',
    get accessToken() {
      return token;
    },
    timeout: 1000,
    _oauthExchangePromise: null,
    _sessionOperations: operations,
    _sessionGeneration: 1,
    _captureAuthContext: () => context,
    _isAuthContextCurrent: () => true,
    _completeOAuthExchange: () => Promise.resolve(),
    _resolveFunctionIdByName: () =>
      Promise.resolve({
        functionId: 'fn-1',
        invokeUrl: 'https://function.test/invoke',
        token: 'user-token',
      }),
    _getFunctionInvokeUrl: () => 'https://function.test/invoke',
    _refreshSessionForContext: () => Promise.resolve({ error: null }),
    _clearFunctionResolveCache: jest.fn(),
  };
  return {
    host,
    context,
    setToken(next) {
      token = next;
    },
  };
}

function foreignError(message: string): Error {
  return new Proxy(new Error(message), { getPrototypeOf: () => null });
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('omitted payload snapshots an empty object before invoking', async () => {
  const { host } = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ done: true }));

  await expect(invokeFunction(host, 'orders')).resolves.toMatchObject({
    data: { done: true },
    error: null,
  });
  expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"payload":{}}');
});

test('a payload that throws while serializing fails before any request', async () => {
  const { host } = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch');

  for (const reason of [
    new Error('broken payload'),
    foreignError('foreign serialization failure'),
  ]) {
    const payload = {
      toJSON(): never {
        throw reason;
      },
    };
    const result = await invokeFunction(host, 'orders', payload);
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(VolcanoSystemError);
    expect(result.error?.message).toBe(
      reason instanceof Error ? reason.message : 'Invalid function payload',
    );
    expect(result.error?.cause).toBe(reason);
  }
  expect(fetch).not.toHaveBeenCalled();
});

test('foreign resolution and URL failures receive stable operation errors', async () => {
  const { host } = hostFixture();
  host._resolveFunctionIdByName = () => rejectWithForeignValue('invalid resolution');
  await expect(invokeFunction(host, 'orders')).resolves.toMatchObject({
    error: { message: 'Failed to resolve function' },
  });

  host._resolveFunctionIdByName = () =>
    Promise.resolve({
      functionId: 'fn-1',
      invokeUrl: null,
      token: 'user-token',
    });
  host._getFunctionInvokeUrl = () => {
    throw foreignError('invalid URL');
  };
  await expect(invokeFunction(host, 'orders')).resolves.toMatchObject({
    error: { message: 'Invalid function identifier' },
  });
});

test('a replaced session after resolution never dispatches the function', async () => {
  const { host } = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch');
  let current = true;
  host._isAuthContextCurrent = () => current;
  host._resolveFunctionIdByName = () => {
    current = false;
    return Promise.resolve({ functionId: 'fn-1', invokeUrl: null, token: 'user-token' });
  };

  await expect(invokeFunction(host, 'orders')).resolves.toMatchObject({
    error: { message: 'Auth operation discarded because the session changed' },
  });
  expect(fetch).not.toHaveBeenCalled();
});

test('a credential cleared after resolution never dispatches the function', async () => {
  const fixture = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch');
  fixture.host._resolveFunctionIdByName = () => {
    fixture.setToken(null);
    return Promise.resolve({ functionId: 'fn-1', invokeUrl: null, token: 'user-token' });
  };
  fixture.host._captureAuthContext = () => ({
    ...fixture.context,
    accessToken: fixture.host.accessToken,
  });

  await expect(invokeFunction(fixture.host, 'orders')).resolves.toMatchObject({
    error: { message: 'Auth operation discarded because the session changed' },
  });
  expect(fetch).not.toHaveBeenCalled();
});

test('a session replaced after a successful refresh discards the retry', async () => {
  const { host } = hostFixture();
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 401 }));
  let current = true;
  host._isAuthContextCurrent = () => current;
  host._refreshSessionForContext = () => {
    current = false;
    return Promise.resolve({ error: null });
  };

  const result = await invokeFunction(host, 'orders');
  expect(result.error).toBeInstanceOf(AuthRefreshDiscardedError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('transport failures retain system errors and wrap foreign rejection values', async () => {
  const { host } = hostFixture();
  const systemError = new VolcanoSystemError('gateway unavailable');
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockRejectedValueOnce(systemError)
    .mockRejectedValueOnce('offline');

  const first = await invokeFunction(host, 'orders');
  expect(first.error).toBe(systemError);
  const second = await invokeFunction(host, 'orders');
  expect(second.error).toBeInstanceOf(VolcanoSystemError);
  expect(second.error?.message).toBe('Request failed');
  expect(second.error?.cause).toBe('offline');
  expect(fetch).toHaveBeenCalledTimes(2);
});
