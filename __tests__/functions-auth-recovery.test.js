const { VolcanoAuth } = require('../src/index.js');

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
