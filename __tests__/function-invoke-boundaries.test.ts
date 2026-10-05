/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from '../src/errors.ts';
import {
  type FunctionInvocationHost,
  type FunctionInvocationResult,
  invokeFunction,
} from '../src/function-invoke.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

interface HostFixture {
  host: FunctionInvocationHost;
  context: AuthContext;
  setToken(token: string | null): void;
}

function hostFixture(
  oauthExchangePromise: Promise<unknown> | null = null,
  anonKey = 'anon-token',
): HostFixture {
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
    anonKey,
    get accessToken() {
      return token;
    },
    timeout: 1000,
    _oauthExchangePromise: oauthExchangePromise,
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

function rejectedRefreshResult(
  refreshClearedSession: boolean,
  sameOperations: boolean,
  generation: number,
): Promise<FunctionInvocationResult> {
  const fixture = hostFixture();
  const context = fixture.context;
  const replacement: AuthContext = { ...context, generation: 2, accessToken: null };
  let current = context;
  const host: FunctionInvocationHost = {
    ...fixture.host,
    _sessionOperations: sameOperations
      ? context.operations
      : new AuthSessionOperations<RefreshResult, SignOutResult>(),
    _sessionGeneration: generation,
    _captureAuthContext: () => current,
    _isAuthContextCurrent: (captured) => captured === current,
    _refreshSessionForContext() {
      context.operations.refreshClearedSession = refreshClearedSession;
      current = replacement;
      return Promise.resolve({ error: new Error('refresh denied') });
    },
  };
  return invokeFunction(host, 'orders');
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('invalid function names fail before resolving or sending', async () => {
  const { host } = hostFixture();
  const resolve = jest.spyOn(host, '_resolveFunctionIdByName');
  const fetch = jest.spyOn(globalThis, 'fetch');

  for (const name of ['', null, 0]) {
    const result = await invokeFunction(host, name);
    expect(result).toMatchObject({
      data: null,
      status: null,
      error: { message: 'functionName must be a non-empty string' },
    });
  }
  expect(resolve).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('empty credentials and pending sign-out refuse dispatch', async () => {
  const fixture = hostFixture(null, '');
  const fetch = jest.spyOn(globalThis, 'fetch');
  fixture.setToken('');
  fixture.host._captureAuthContext = () => ({ ...fixture.context, accessToken: '' });

  const emptyToken = await invokeFunction(fixture.host, 'orders');
  expect(emptyToken.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetch).not.toHaveBeenCalled();

  const signingOutFixture = hostFixture();
  const resolve = jest.spyOn(signingOutFixture.host, '_resolveFunctionIdByName');
  signingOutFixture.context.operations.signingOut = Promise.resolve({ error: null });
  const signingOut = await invokeFunction(signingOutFixture.host, 'orders');
  expect(signingOut.error?.message).toBe('Auth operation discarded because the session changed');
  expect(resolve).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('a stale context never begins function resolution', async () => {
  const { host } = hostFixture();
  host._isAuthContextCurrent = () => false;
  const resolve = jest.spyOn(host, '_resolveFunctionIdByName');
  const fetch = jest.spyOn(globalThis, 'fetch');

  const result = await invokeFunction(host, 'orders');
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(resolve).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('OAuth completion chooses the replacement anonymous credential', async () => {
  const fixture = hostFixture(Promise.resolve());
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ done: true }));
  let current = fixture.context;
  fixture.host._captureAuthContext = () => current;
  fixture.host._completeOAuthExchange = () => {
    current = { ...fixture.context, accessToken: null };
    return Promise.resolve();
  };
  const resolve = jest.spyOn(fixture.host, '_resolveFunctionIdByName');

  await expect(invokeFunction(fixture.host, ' orders ')).resolves.toMatchObject({ error: null });
  expect(resolve).toHaveBeenCalledWith(
    'orders',
    expect.objectContaining({
      token: 'anon-token',
      useAnonKey: true,
    }),
  );
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: 'Bearer anon-token' });
});

test('invocation uses the JSON content type and the trimmed function name', async () => {
  const { host } = hostFixture();
  const resolve = jest.spyOn(host, '_resolveFunctionIdByName');
  const exchange = jest.spyOn(host, '_completeOAuthExchange');
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ done: true }));

  await expect(invokeFunction(host, ' orders ', { count: 2 })).resolves.toMatchObject({
    error: null,
  });
  expect(resolve).toHaveBeenCalledWith(
    'orders',
    expect.objectContaining({
      token: 'user-token',
      useAnonKey: false,
    }),
  );
  expect(fetch.mock.calls[0]?.[1]?.headers).toMatchObject({
    Authorization: 'Bearer user-token',
    'Content-Type': 'application/json',
  });
  expect(fetch.mock.calls[0]?.[1]?.body).toBe('{"payload":{"count":2}}');
  expect(exchange).not.toHaveBeenCalled();
});

test('sign-out starting during resolution blocks the outbound request', async () => {
  const { host, context } = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch');
  host._resolveFunctionIdByName = () => {
    context.operations.signingOut = Promise.resolve({ error: null });
    return Promise.resolve({ functionId: 'fn-1', invokeUrl: null, token: 'user-token' });
  };

  const result = await invokeFunction(host, 'orders');
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetch).not.toHaveBeenCalled();
});

test('a rejected platform 401 retries at most once', async () => {
  const { host } = hostFixture();
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 401 }));
  const refresh = jest.spyOn(host, '_refreshSessionForContext');

  const result = await invokeFunction(host, 'orders');
  expect(result.status).toBe(401);
  expect(result.error).toBeInstanceOf(VolcanoSystemError);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('a refreshed credential must still be available before the second request', async () => {
  const fixture = hostFixture();
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 401 }));
  fixture.host._refreshSessionForContext = () => {
    fixture.setToken(null);
    return Promise.resolve({ error: null });
  };

  const result = await invokeFunction(fixture.host, 'orders');
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('sign-out beginning during refresh blocks the second request', async () => {
  const { host, context } = hostFixture();
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(null, { status: 401 }));
  host._refreshSessionForContext = () => {
    context.operations.signingOut = Promise.resolve({ error: null });
    return Promise.resolve({ error: null });
  };

  const result = await invokeFunction(host, 'orders');
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('second-request transport rejection stays a system error', async () => {
  const { host } = hostFixture();
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(null, { status: 401 }))
    .mockImplementationOnce(() => rejectWithForeignValue('retry unavailable'));

  const result = await invokeFunction(host, 'orders');
  expect(result.error).toBeInstanceOf(VolcanoSystemError);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('a rejected refresh preserves the platform response only for its own cleared session', async () => {
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
  const cases = [
    { name: 'owned clear', cleared: true, owner: true, generation: 2, preserve: true },
    { name: 'no clear', cleared: false, owner: true, generation: 2, preserve: false },
    { name: 'other owner', cleared: true, owner: false, generation: 2, preserve: false },
    { name: 'other generation', cleared: true, owner: true, generation: 3, preserve: false },
  ];
  for (const scenario of cases) {
    const result = await rejectedRefreshResult(
      scenario.cleared,
      scenario.owner,
      scenario.generation,
    );
    expect(result.error).toBeInstanceOf(
      scenario.preserve ? VolcanoSystemError : AuthSessionChangedError,
    );
    expect(result.status).toBe(scenario.preserve ? 401 : 409);
  }
});

test('a stale 404 clears the trimmed cache key and re-resolves once', async () => {
  const { host } = hostFixture();
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(Response.json({ recovered: true }));
  const clear = jest.spyOn(host, '_clearFunctionResolveCache');
  const resolve = jest.spyOn(host, '_resolveFunctionIdByName');

  const result = await invokeFunction(host, ' orders ');
  expect(result).toMatchObject({ data: { recovered: true }, error: null });
  expect(clear).toHaveBeenCalledWith('orders', 'user-token', false);
  expect(resolve).toHaveBeenCalledTimes(2);
  expect(fetch).toHaveBeenCalledTimes(2);
});

test('foreign re-resolution failure after a stale 404 keeps the fallback error', async () => {
  const { host } = hostFixture();
  jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
  let attempts = 0;
  host._resolveFunctionIdByName = () => {
    attempts += 1;
    return attempts === 1
      ? Promise.resolve({ functionId: 'fn-1', invokeUrl: null, token: 'user-token' })
      : rejectWithForeignValue('resolution unavailable');
  };

  const result = await invokeFunction(host, 'orders');
  expect(result.error?.message).toBe('Failed to resolve function');
  expect(attempts).toBe(2);
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
