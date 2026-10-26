/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { AuthSessionChangedError, VolcanoSystemError } from '../src/errors.ts';
import { invokeFunction } from '../src/function-invoke.ts';
import { foreignError, hostFixture } from './support/functions-invoke-host.ts';

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

  for (const reason of [new Error('broken payload'), foreignError('foreign serialization failure')]) {
    const payload = {
      toJSON(): never {
        throw reason;
      },
    };
    const result = await invokeFunction(host, 'orders', payload);
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(VolcanoSystemError);
    expect(result.error?.message).toBe(reason instanceof Error ? reason.message : 'Invalid function payload');
    expect(result.error?.cause).toBe(reason);
  }
  expect(fetch).not.toHaveBeenCalled();
});
