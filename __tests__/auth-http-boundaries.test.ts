/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import {
  anonFetch,
  authFetchUrl,
  authFetchWithContext,
  type AuthHttpHost,
} from '../src/auth-http.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import { AuthRefreshDiscardedError } from '../src/errors.ts';

const context: AuthContext = {
  generation: 1,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: 'access',
  refreshToken: 'refresh',
};

function fixture(current: () => boolean = () => true): AuthHttpHost {
  return {
    apiUrl: 'https://api.example.test',
    anonKey: 'anon',
    timeout: 1000,
    accessToken: 'access',
    _oauthExchangePromise: null,
    _oauthExchangeError: null,
    _completeOAuthExchange: () => Promise.resolve(),
    _captureAuthContext: () => context,
    _isAuthContextCurrent: current,
    _refreshSessionForContext: () => Promise.resolve({ error: null }),
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('default authenticated options send the captured token and preserve the response', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockImplementation(() => Promise.resolve(new Response('{"ok":true}')));
  const host = fixture();

  const contextual = await authFetchWithContext(host, '/auth/user');
  const direct = await authFetchUrl(host, `${host.apiUrl}/auth/user`);
  const anonymous = await anonFetch(host, '/auth/signup');

  expect(contextual.result).toEqual({ ok: true, status: 200, data: { ok: true }, error: null });
  expect(direct).toEqual(contextual.result);
  expect(anonymous).toEqual(contextual.result);
  expect(fetch).toHaveBeenCalledWith(
    `${host.apiUrl}/auth/user`,
    expect.objectContaining({
      headers: { Authorization: 'Bearer access', 'Content-Type': 'application/json' },
    }),
  );
});

test('authenticated and anonymous requests preserve Headers and tuple header inputs', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
  const host = fixture();

  await authFetchUrl(host, `${host.apiUrl}/auth/user`, {
    headers: new Headers([['X-Trace', 'from-headers']]),
  });
  await anonFetch(host, '/auth/signup', {
    headers: [['X-Trace', 'from-tuples']],
  });

  expect(fetch).toHaveBeenNthCalledWith(
    1,
    `${host.apiUrl}/auth/user`,
    expect.objectContaining({
      headers: expect.objectContaining({ 'x-trace': 'from-headers' }),
    }),
  );
  expect(fetch).toHaveBeenNthCalledWith(
    2,
    `${host.apiUrl}/auth/signup`,
    expect.objectContaining({
      headers: expect.objectContaining({ 'X-Trace': 'from-tuples' }),
    }),
  );
});

test('header overrides replace defaults case-insensitively without combining wire values', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}'));
  const host = fixture();

  await authFetchUrl(host, `${host.apiUrl}/auth/user`, {
    headers: new Headers({
      authorization: 'Bearer custom',
      'content-type': 'text/plain',
      'X-Trace': 'from-headers',
    }),
  });
  await anonFetch(host, '/auth/signup', {
    headers: [
      ['authorization', 'Bearer anonymous-override'],
      ['CONTENT-TYPE', 'application/vnd.volcano+json'],
      ['X-Trace', 'first'],
      ['x-trace', 'last'],
    ],
  });

  const authenticated = fetch.mock.calls[0]?.[1]?.headers;
  expect(authenticated).toEqual({
    Authorization: 'Bearer custom',
    'Content-Type': 'text/plain',
    'x-trace': 'from-headers',
  });
  expect(new Headers(authenticated).get('authorization')).toBe('Bearer custom');
  expect(new Headers(authenticated).get('content-type')).toBe('text/plain');

  const anonymous = fetch.mock.calls[1]?.[1]?.headers;
  expect(anonymous).toEqual({
    Authorization: 'Bearer anonymous-override',
    'Content-Type': 'application/vnd.volcano+json',
    'X-Trace': 'last',
  });
  expect(new Headers(anonymous).get('authorization')).toBe('Bearer anonymous-override');
});

test('refresh completion cannot retry after the captured session changes', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{"error":"expired"}', { status: 401 }));

  const result = await authFetchUrl(
    fixture(() => false),
    'https://api.example.test/auth/user',
  );

  expect(result.status).toBe(409);
  expect(result.error).toBeInstanceOf(AuthRefreshDiscardedError);
  expect(fetch).toHaveBeenCalledTimes(1);
});

test('missing access tokens refuse a request before evaluating deferred inputs', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch');
  const host = fixture();
  host._captureAuthContext = () => ({ ...context, accessToken: '' });
  const path = jest.fn(() => '/auth/user');
  const options = jest.fn(() => ({ method: 'GET' }));

  const response = await authFetchWithContext(host, path, options);

  expect(response.result.error).toEqual(new Error('No active session'));
  expect(path).not.toHaveBeenCalled();
  expect(options).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

test('an empty refresh token never retries a 401', async () => {
  const fetch = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('{"error":"expired"}', { status: 401 }));
  const host = fixture();
  host._captureAuthContext = () => ({ ...context, refreshToken: '' });
  const refresh = jest.fn<AuthHttpHost['_refreshSessionForContext']>();
  host._refreshSessionForContext = refresh;

  const response = await authFetchUrl(host, `${host.apiUrl}/auth/user`);

  expect(response.status).toBe(401);
  expect(response.error).toEqual(expect.objectContaining({ message: 'Session expired' }));
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(refresh).not.toHaveBeenCalled();
});

test('non-Error transport failures use a stable error in either auth mode', async () => {
  const fetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue('socket closed');
  const host = fixture();

  expect(await authFetchUrl(host, `${host.apiUrl}/auth/user`)).toEqual({
    ok: false,
    status: null,
    data: null,
    error: new Error('Request failed'),
  });
  fetch.mockRejectedValueOnce(new Error('connection refused'));
  expect(await anonFetch(host, '/auth/signup')).toEqual({
    ok: false,
    status: null,
    data: null,
    error: new Error('connection refused'),
  });
  expect(await anonFetch(host, '/auth/signup')).toEqual({
    ok: false,
    status: null,
    data: null,
    error: new Error('Request failed'),
  });
});
