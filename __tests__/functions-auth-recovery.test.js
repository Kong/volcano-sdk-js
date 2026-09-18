const { VolcanoAuth, VolcanoSystemError } = require('../src/index.js');

const SESSION_ID = '00000000-0000-4000-8000-000000000001';
const FUNCTION_ID = '00000000-0000-4000-8000-000000000040';
function token(renewed = false) {
  return `header.${Buffer.from(JSON.stringify({ project_id: 'project', session_id: SESSION_ID, renewed })).toString('base64url')}.signature`;
}
function reply(status, data, headers = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data, headers };
}
function resolved() {
  return reply(200, { name: 'echo', function_id: FUNCTION_ID, cache_ttl_seconds: 60 });
}
function refreshed() {
  return reply(200, {
    access_token: token(true),
    refresh_token: 'new-refresh',
    user: { id: 'user' },
  });
}
function client(refreshToken = 'old-refresh') {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: token(),
    refreshToken,
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
  VolcanoAuth.__resetFunctionResolveCacheForTests();
});

test.each(['resolve', 'invoke'])(
  'keeps payload values when %s recovery mutates the caller object',
  async (stage) => {
    const payload = { values: ['original'] };
    global.fetch.mockImplementation(async (url, options) => {
      if (url.endsWith('/auth/refresh')) {
        payload.values.push('changed');
        return refreshed();
      }
      const current = url.includes('/functions/resolve') ? 'resolve' : 'invoke';
      if (current === stage && options.headers.Authorization === `Bearer ${token()}`) {
        return reply(401, { error: 'expired' });
      }
      return current === 'resolve' ? resolved() : reply(200, { ok: true });
    });
    expect((await client().functions.invoke('echo', payload)).error).toBeNull();
    const calls = global.fetch.mock.calls.filter(([url]) => url.endsWith('/invoke'));
    expect(calls.length).toBe(stage === 'invoke' ? 2 : 1);
    for (const [, options] of calls)
      expect(JSON.parse(options.body)).toEqual({ payload: { values: ['original'] } });
  },
);

test('captures function payload before the first asynchronous boundary', async () => {
  global.fetch.mockResolvedValueOnce(resolved()).mockResolvedValueOnce(reply(200, { ok: true }));
  const payload = { values: ['original'] };
  const pending = client().functions.invoke('echo', payload);
  payload.values.push('changed');
  expect((await pending).error).toBeNull();
  expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
    payload: { values: ['original'] },
  });
});

test.each([null, 401, 503])(
  'keeps resolver rejection metadata when refresh is %s',
  async (refreshStatus) => {
    const target = client(refreshStatus === null ? null : 'old-refresh');
    global.fetch.mockResolvedValueOnce(
      reply(401, { error: 'denied', code: 'original' }, { 'retry-after': '7' }),
    );
    if (refreshStatus !== null)
      global.fetch.mockResolvedValueOnce(reply(refreshStatus, { error: 'refresh failed' }));
    const result = await target.functions.invoke('echo');
    expect(result.error).toMatchObject({
      message: 'Session expired',
      status: 401,
      code: 'original',
      retryAfter: 7,
    });
    expect(global.fetch).toHaveBeenCalledTimes(refreshStatus === null ? 1 : 2);
  },
);

test.each(['getter', 'toJSON'])('captures ownership before payload %s', async (boundary) => {
  const target = client();
  const replaceSession = () => {
    void target.auth.setSession({
      access_token: token(true),
      refresh_token: 'replacement-refresh',
      user: { id: 'other' },
    });
    return 'changed';
  };
  const payload =
    boundary === 'getter'
      ? Object.defineProperty({}, 'value', { enumerable: true, get: replaceSession })
      : { toJSON: replaceSession };
  const result = await target.functions.invoke('echo', payload);
  expect(result.error).toMatchObject({ code: 'auth_session_changed' });
  expect(global.fetch).not.toHaveBeenCalled();
});

test.each([null, 401, 503])(
  'keeps invocation rejection metadata when refresh is %s',
  async (refreshStatus) => {
    const target = client(refreshStatus === null ? null : 'old-refresh');
    global.fetch
      .mockResolvedValueOnce(resolved())
      .mockResolvedValueOnce(
        reply(401, { error: 'denied', code: 'original' }, { 'retry-after': '7' }),
      );
    if (refreshStatus !== null)
      global.fetch.mockResolvedValueOnce(reply(refreshStatus, { error: 'refresh failed' }));
    const result = await target.functions.invoke('echo');
    expect(VolcanoSystemError.is(result.error)).toBe(true);
    expect(result.error).toMatchObject({
      message: 'denied',
      status: 401,
      code: 'original',
      retryAfter: 7,
    });
    expect(global.fetch).toHaveBeenCalledTimes(refreshStatus === null ? 2 : 3);
    expect(JSON.stringify(result.error)).toBe('{}');
  },
);

test('does not adopt a replacement session from a rejected-refresh callback', async () => {
  const target = client();
  target.onAuthStateChange((user) => {
    if (user === null && !target.accessToken) {
      void target.auth.setSession({
        access_token: token(true),
        refresh_token: 'replacement-refresh',
        user: { id: 'other' },
      });
    }
  });
  global.fetch
    .mockResolvedValueOnce(resolved())
    .mockResolvedValueOnce(reply(401, { error: 'denied', code: 'original' }))
    .mockResolvedValueOnce(reply(401, { error: 'refresh denied' }));
  const result = await target.functions.invoke('echo');
  expect(result.error).toMatchObject({ code: 'auth_session_changed' });
  expect(target.accessToken).toBe(token(true));
  expect(global.fetch).toHaveBeenCalledTimes(3);
});

test.each(['getter', 'toJSON'])(
  'blocks cached invocation after payload %s starts sign-out',
  async (boundary) => {
    const target = client();
    global.fetch.mockResolvedValueOnce(resolved()).mockResolvedValueOnce(reply(200, {}));
    expect((await target.functions.invoke('echo')).error).toBeNull();
    global.fetch.mockClear();
    global.fetch.mockResolvedValue(reply(200, {}));
    let signOut;
    const revoke = () => {
      signOut = target.auth.signOut();
      return 'value';
    };
    const payload =
      boundary === 'getter'
        ? Object.defineProperty({}, 'value', { enumerable: true, get: revoke })
        : { toJSON: revoke };
    const result = await target.functions.invoke('echo', payload);
    await signOut;
    expect(result.error).toMatchObject({ code: 'auth_session_changed' });
    expect(global.fetch.mock.calls.filter(([url]) => url.endsWith('/invoke'))).toHaveLength(0);
  },
);

test.each([401, 403])(
  'does not confuse concurrent deletion with refresh %s clearing',
  async (status) => {
    const target = client();
    let finishRefresh;
    let refreshStarted;
    const refreshing = new Promise((resolve) => {
      refreshStarted = resolve;
    });
    global.fetch.mockImplementation(async (url, options) => {
      if (url.includes('/functions/resolve')) return resolved();
      if (url.endsWith('/invoke')) return reply(401, { error: 'denied', code: 'original' });
      if (url.endsWith('/auth/refresh')) {
        refreshStarted();
        return new Promise((resolve) => {
          finishRefresh = resolve;
        });
      }
      expect(options.method).toBe('DELETE');
      return reply(204, {});
    });
    const pending = target.functions.invoke('echo');
    await refreshing;
    expect((await target.auth.deleteSession(SESSION_ID)).error).toBeNull();
    finishRefresh(reply(status, { error: 'refresh denied' }));
    const result = await pending;
    expect(result.error).toMatchObject({ code: 'auth_session_changed' });
    expect(global.fetch.mock.calls.filter(([url]) => url.endsWith('/invoke'))).toHaveLength(1);
  },
);

test('allows anonymous invocation after sign-out has settled', async () => {
  const target = client();
  global.fetch.mockResolvedValueOnce(reply(204, {}));
  expect((await target.auth.signOut()).error).toBeNull();
  global.fetch.mockClear();
  global.fetch.mockResolvedValueOnce(resolved()).mockResolvedValueOnce(reply(200, { ok: true }));
  expect((await target.functions.invoke('echo')).error).toBeNull();
  expect(global.fetch).toHaveBeenCalledTimes(2);
  for (const [, options] of global.fetch.mock.calls)
    expect(options.headers.Authorization).toBe('Bearer anon');
});

test('retains an owned metadata snapshot for negative resolution cache hits', async () => {
  const target = client();
  global.fetch.mockResolvedValue(
    reply(404, { error: 'Function not found', code: 'not_found' }, { 'retry-after': '7' }),
  );
  const first = await target.functions.invoke('missing');
  expect(first.error).toMatchObject({
    message: 'Function not found',
    status: 404,
    code: 'not_found',
    retryAfter: 7,
  });
  Object.assign(first.error, { message: 'changed', status: 500, code: 'changed', retryAfter: 99 });
  const second = await target.functions.invoke('missing');
  expect(second.error).toMatchObject({
    message: 'Function not found',
    status: 404,
    code: 'not_found',
    retryAfter: 7,
  });
  expect(second.error).not.toBe(first.error);
  expect(global.fetch).toHaveBeenCalledTimes(1);
});
