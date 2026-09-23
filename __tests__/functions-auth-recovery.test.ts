/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth, VolcanoSystemError } from '../src/index.js';
import {
  bodyText,
  deferred,
  fetchBody,
  fetchUrl,
  reply,
  resultError,
  signal,
  within,
} from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const FUNCTION_ID = '00000000-0000-4000-8000-000000000040';
function token(renewed = false) {
  return `header.${Buffer.from(JSON.stringify({ project_id: 'project', session_id: SESSION_ID, renewed })).toString('base64url')}.signature`;
}
function resolved() {
  return reply(200, { name: 'echo', function_id: FUNCTION_ID, cache_ttl_seconds: 60 });
}
function refreshed() {
  return reply(200, {
    access_token: token(true),
    refresh_token: 'new-refresh',
    expires_in: 3600,
    user: { id: 'user', email: 'fixture@example.com', status: 'active' },
  });
}
function client(refreshToken: string | null = 'old-refresh') {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: token(),
    ...(refreshToken === null ? {} : { refreshToken }),
  });
}

function recoveryResponse(
  url: RequestInfo | URL,
  options: RequestInit | undefined,
  stage: string,
  payload: { values: string[] },
): Response {
  const path = fetchUrl(url);
  if (path.endsWith('/auth/refresh')) {
    payload.values.push('changed');
    return refreshed();
  }
  return regularResponse(path, options, stage);
}

function regularResponse(path: string, options: RequestInit | undefined, stage: string): Response {
  const isResolve = path.includes('/functions/resolve');
  if (isOriginalRequest(isResolve, options, stage)) {
    return reply(401, { error: 'expired' });
  }
  return isResolve ? resolved() : reply(200, { ok: true });
}

function isOriginalRequest(
  isResolve: boolean,
  options: RequestInit | undefined,
  stage: string,
): boolean {
  const matchesStage = isResolve ? stage === 'resolve' : stage === 'invoke';
  const authorization = new Headers(options?.headers).get('Authorization');
  return matchesStage && authorization === `Bearer ${token()}`;
}

function cachedStringError(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error('Expected a cached string error');
  }
  if (!('error' in value) || typeof value.error !== 'string') {
    throw new Error('Expected a cached string error');
  }
  return value.error;
}

beforeEach(() => {
  VolcanoAuth.__resetFunctionResolveCacheForTests();
});

test.each(['resolve', 'invoke'])(
  'keeps payload values when %s recovery mutates the caller object',
  async (stage) => {
    const payload = { values: ['original'] };
    fetchMock.mockImplementation((url, options) =>
      Promise.resolve(recoveryResponse(url, options, stage, payload)),
    );
    expect(await resultError(client().functions.invoke('echo', payload))).toBeNull();
    const calls = fetchMock.mock.calls.filter(([url]) => fetchUrl(url).endsWith('/invoke'));
    expect(calls.length).toBe(stage === 'invoke' ? 2 : 1);
    for (const [, options] of calls) {
      expect(JSON.parse(bodyText(options))).toEqual({ payload: { values: ['original'] } });
    }
  },
);

test('captures function payload before the first asynchronous boundary', async () => {
  fetchMock.mockResolvedValueOnce(resolved()).mockResolvedValueOnce(reply(200, { ok: true }));
  const payload = { values: ['original'] };
  const pending = client().functions.invoke('echo', payload);
  payload.values.push('changed');
  expect(await resultError(pending)).toBeNull();
  expect(JSON.parse(fetchBody(1))).toEqual({
    payload: { values: ['original'] },
  });
});

test.each([null, 401, 503])(
  'keeps resolver rejection metadata when refresh is %s',
  async (refreshStatus) => {
    const target = client(refreshStatus === null ? null : 'old-refresh');
    fetchMock.mockResolvedValueOnce(
      reply(401, { error: 'denied', code: 'original' }, { 'retry-after': '7' }),
    );
    if (refreshStatus !== null) {
      fetchMock.mockResolvedValueOnce(reply(refreshStatus, { error: 'refresh failed' }));
    }
    const result = await target.functions.invoke('echo');
    expect(result.error).toMatchObject({
      message: 'Session expired',
      status: 401,
      code: 'original',
      retryAfter: 7,
    });
    expect(fetchMock).toHaveBeenCalledTimes(refreshStatus === null ? 1 : 2);
  },
);

test.each(['getter', 'toJSON'])('captures ownership before payload %s', async (boundary) => {
  const target = client();
  const replaceSession = () => {
    void target.auth.setSession({
      access_token: token(true),
      refresh_token: 'replacement-refresh',
      user: { id: 'other', email: 'fixture@example.com', status: 'active' },
    });
    return 'changed';
  };
  const payload =
    boundary === 'getter'
      ? Object.defineProperty({}, 'value', { enumerable: true, get: replaceSession })
      : { toJSON: replaceSession };
  const result = await target.functions.invoke('echo', payload);
  expect(result.error).toMatchObject({ code: 'auth_session_changed' });
  expect(fetchMock).not.toHaveBeenCalled();
});

test.each([null, 401, 503])(
  'keeps invocation rejection metadata when refresh is %s',
  async (refreshStatus) => {
    const target = client(refreshStatus === null ? null : 'old-refresh');
    fetchMock
      .mockResolvedValueOnce(resolved())
      .mockResolvedValueOnce(
        reply(401, { error: 'denied', code: 'original' }, { 'retry-after': '7' }),
      );
    if (refreshStatus !== null) {
      fetchMock.mockResolvedValueOnce(reply(refreshStatus, { error: 'refresh failed' }));
    }
    const result = await target.functions.invoke('echo');
    expect(VolcanoSystemError.is(result.error)).toBe(true);
    expect(result.error).toMatchObject({
      message: 'denied',
      status: 401,
      code: 'original',
      retryAfter: 7,
    });
    expect(fetchMock).toHaveBeenCalledTimes(refreshStatus === null ? 2 : 3);
    expect(JSON.stringify(result.error)).toBe('{}');
  },
);

test('does not adopt a replacement session from a rejected-refresh callback', async () => {
  const target = client();
  target.onAuthStateChange((user) => {
    if (user === null && target.accessToken === null) {
      void target.auth.setSession({
        access_token: token(true),
        refresh_token: 'replacement-refresh',
        user: { id: 'other', email: 'fixture@example.com', status: 'active' },
      });
    }
  });
  fetchMock
    .mockResolvedValueOnce(resolved())
    .mockResolvedValueOnce(reply(401, { error: 'denied', code: 'original' }))
    .mockResolvedValueOnce(reply(401, { error: 'refresh denied' }));
  const result = await target.functions.invoke('echo');
  expect(result.error).toMatchObject({ code: 'auth_session_changed' });
  expect(target.accessToken).toBe(token(true));
  expect(fetchMock).toHaveBeenCalledTimes(3);
});

test.each(['getter', 'toJSON'])(
  'blocks cached invocation after payload %s starts sign-out',
  async (boundary) => {
    const target = client();
    fetchMock.mockResolvedValueOnce(resolved()).mockResolvedValueOnce(reply(200, {}));
    expect(await resultError(target.functions.invoke('echo'))).toBeNull();
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(reply(200, {}));
    const signOutTasks: ReturnType<typeof target.auth.signOut>[] = [];
    const revoke = () => {
      signOutTasks.push(target.auth.signOut());
      return 'value';
    };
    const payload =
      boundary === 'getter'
        ? Object.defineProperty({}, 'value', { enumerable: true, get: revoke })
        : { toJSON: revoke };
    const result = await target.functions.invoke('echo', payload);
    const signOut = signOutTasks[0];
    if (signOut === undefined) {
      throw new Error('Expected payload serialization to start sign-out');
    }
    await signOut;
    expect(result.error).toMatchObject({ code: 'auth_session_changed' });
    expect(fetchMock.mock.calls.filter(([url]) => fetchUrl(url).endsWith('/invoke'))).toHaveLength(
      0,
    );
  },
);

test.each([401, 403])(
  'does not confuse concurrent deletion with refresh %s clearing',
  async (status) => {
    const target = client();
    const finishRefresh = deferred<Response>();
    const refreshing = signal();
    fetchMock.mockImplementation(async (url, options) => {
      if (fetchUrl(url).includes('/functions/resolve')) {
        return resolved();
      }
      if (fetchUrl(url).endsWith('/invoke')) {
        return reply(401, { error: 'denied', code: 'original' });
      }
      if (fetchUrl(url).endsWith('/auth/refresh')) {
        refreshing.resolve();
        return finishRefresh.promise;
      }
      expect(options?.method).toBe('DELETE');
      return reply(204, {});
    });
    const pending = target.functions.invoke('echo');
    await within(refreshing.promise, 'refresh request');
    expect(
      await within(resultError(target.auth.deleteSession(SESSION_ID)), 'session deletion'),
    ).toBeNull();
    finishRefresh.resolve(reply(status, { error: 'refresh denied' }));
    const result = await within(pending, 'function invocation after deletion');
    expect(result.error).toMatchObject({ code: 'auth_session_changed' });
    expect(fetchMock.mock.calls.filter(([url]) => fetchUrl(url).endsWith('/invoke'))).toHaveLength(
      1,
    );
  },
);

test('allows anonymous invocation after sign-out has settled', async () => {
  const target = client();
  fetchMock.mockResolvedValueOnce(reply(204, {}));
  expect(await resultError(target.auth.signOut())).toBeNull();
  fetchMock.mockClear();
  fetchMock.mockResolvedValueOnce(resolved()).mockResolvedValueOnce(reply(200, { ok: true }));
  expect(await resultError(target.functions.invoke('echo'))).toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  for (const [, options] of fetchMock.mock.calls) {
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer anon');
  }
});

test('retains an owned metadata snapshot for negative resolution cache hits', async () => {
  const target = client();
  fetchMock.mockResolvedValue(
    reply(404, { error: 'Function not found', code: 'not_found' }, { 'retry-after': '7' }),
  );
  const first = await target.functions.invoke('missing');
  expect(first.error).toMatchObject({
    message: 'Function not found',
    status: 404,
    code: 'not_found',
    retryAfter: 7,
  });
  const cached = [...target._functionResolveState.cache.values()][0];
  expect(new Error(cachedStringError(cached)).message).toBe('Function not found');
  if (first.error === null) {
    throw new Error('Expected an invocation error');
  }
  Object.assign(first.error, { message: 'changed', status: 500, code: 'changed', retryAfter: 99 });
  const second = await target.functions.invoke('missing');
  expect(second.error).toMatchObject({
    message: 'Function not found',
    status: 404,
    code: 'not_found',
    retryAfter: 7,
  });
  expect(second.error).not.toBe(first.error);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('reads string-valued failures from the shared legacy resolver cache', async () => {
  const target = client();
  target._functionResolveState.cache.set(
    target._functionResolveCacheKey('missing', token(), false),
    {
      functionId: null,
      error: 'function not found',
      expiresAt: Date.now() + 30000,
    },
  );
  const result = await target.functions.invoke('missing');
  expect(result.error).toMatchObject({ message: 'function not found', status: 404 });
  expect(fetchMock).not.toHaveBeenCalled();
});
