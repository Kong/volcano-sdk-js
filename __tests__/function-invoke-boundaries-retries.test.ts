/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoSystemError } from '../src/errors.ts';
import { type FunctionInvocationHost, invokeFunction } from '../src/function-invoke.ts';
import { foreignError, hostFixture, rejectedRefreshResult } from './support/functions-invoke-host.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

test('a rejected platform 401 retries at most once', async () => {
  const { host } = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
  const refresh = jest.spyOn(host, '_refreshSessionForContext');

  const result = await invokeFunction(host, 'orders');
  expect(result.status).toBe(401);
  expect(result.error).toBeInstanceOf(VolcanoSystemError);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(refresh).toHaveBeenCalledTimes(1);
});

test('a refreshed credential must still be available before the second request', async () => {
  const fixture = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
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
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
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
    { name: 'owned clear', cleared: true, owner: true, generation: 2, error: VolcanoSystemError, status: 401 },
    { name: 'no clear', cleared: false, owner: true, generation: 2, error: AuthSessionChangedError, status: 409 },
    { name: 'other owner', cleared: true, owner: false, generation: 2, error: AuthSessionChangedError, status: 409 },
    {
      name: 'other generation',
      cleared: true,
      owner: true,
      generation: 3,
      error: AuthSessionChangedError,
      status: 409,
    },
  ];
  const outcomes = await Promise.all(
    cases.map(async (scenario) => ({
      scenario,
      result: await rejectedRefreshResult(scenario.cleared, scenario.owner, scenario.generation),
    })),
  );
  for (const { scenario, result } of outcomes) {
    expect(result.error).toBeInstanceOf(scenario.error);
    expect(result.status).toBe(scenario.status);
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
  const resolve = jest
    .fn<FunctionInvocationHost['_resolveFunctionIdByName']>()
    .mockResolvedValueOnce({ functionId: 'fn-1', invokeUrl: null, token: 'user-token' })
    .mockImplementationOnce(() => rejectWithForeignValue('resolution unavailable'));
  host._resolveFunctionIdByName = resolve;

  const result = await invokeFunction(host, 'orders');
  expect(result.error?.message).toBe('Failed to resolve function');
  expect(resolve).toHaveBeenCalledTimes(2);
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

test('a session replaced after a successful refresh discards the retry', async () => {
  const { host } = hostFixture();
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }));
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
  const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValueOnce(systemError).mockRejectedValueOnce('offline');

  const first = await invokeFunction(host, 'orders');
  expect(first.error).toBe(systemError);
  const second = await invokeFunction(host, 'orders');
  expect(second.error).toBeInstanceOf(VolcanoSystemError);
  expect(second.error?.message).toBe('Request failed');
  expect(second.error?.cause).toBe('offline');
  expect(fetch).toHaveBeenCalledTimes(2);
});
