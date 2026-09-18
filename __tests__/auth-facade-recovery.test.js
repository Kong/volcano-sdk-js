const { VolcanoAuth, AuthSessionChangedError } = require('../src');
const { sessionToken } = require('./session-fixtures');

const SESSION = '00000000-0000-4000-8000-000000000010';
const OTHER = '00000000-0000-4000-8000-000000000011';
const reply = (status, data = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const renewed = () =>
  reply(200, {
    access_token: sessionToken(SESSION, true),
    refresh_token: 'refresh-2',
    user: { id: 'user' },
  });
const replacement = {
  access_token: sessionToken(OTHER),
  refresh_token: 'other-refresh',
  user: { id: 'other' },
};
const cases = [
  ['request email', (c) => c.auth.requestEmailChange('new@example.com'), 200, {}],
  ['cancel email', (c) => c.auth.cancelEmailChange(), 200, {}],
  [
    'list sessions',
    (c) => c.auth.getSessions({ page: 2, limit: 10 }),
    200,
    { sessions: [], total: 0 },
  ],
  ['delete others', (c) => c.auth.deleteAllOtherSessions(), 204, {}],
  ['delete session', (c) => c.auth.deleteSession(OTHER), 204, {}],
  ['providers', (c) => c.auth.getLinkedOAuthProviders(), 200, { providers: [] }],
  [
    'link',
    (c) => c.auth.linkOAuthProvider('github'),
    200,
    { authorization_url: 'https://provider.example' },
  ],
  ['unlink', (c) => c.auth.unlinkOAuthProvider('github'), 204, {}],
  ['token', (c) => c.auth.getOAuthProviderToken('github'), 200, { provider: 'github' }],
  ['refresh token', (c) => c.auth.refreshOAuthToken('github'), 200, { provider: 'github' }],
  [
    'provider API',
    (c) =>
      c.auth.callOAuthAPI('github', {
        endpoint: '/user',
        method: 'POST',
        body: { name: 'original' },
      }),
    200,
    { data: { ok: true } },
  ],
];
function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: sessionToken(SESSION),
    refreshToken: 'refresh-1',
  });
}

beforeEach(() => {
  global.fetch = jest.fn();
});

describe.each(cases)('%s recovery', (_name, invoke, status, body) => {
  it.each(['json', 'empty', 'html'])(
    'replays the captured request after %s401',
    async (rejection) => {
      const denied = reply(401, { error: 'expired' });
      if (rejection !== 'json')
        denied.json = async () => {
          throw new SyntaxError(rejection);
        };
      global.fetch
        .mockResolvedValueOnce(denied)
        .mockResolvedValueOnce(renewed())
        .mockResolvedValueOnce(reply(status, body));
      const current = client();
      expect((await invoke(current)).error).toBeNull();
      const requests = global.fetch.mock.calls;
      expect(requests.map(([, options]) => options.headers.Authorization)).toEqual([
        `Bearer ${sessionToken(SESSION)}`,
        'Bearer anon',
        `Bearer ${sessionToken(SESSION, true)}`,
      ]);
      expect(requests[0][0]).toBe(requests[2][0]);
      expect(requests[0][1].body).toBe(requests[2][1].body);
    },
  );

  it('bounds repeated401 to one refresh', async () => {
    global.fetch
      .mockResolvedValueOnce(reply(401))
      .mockResolvedValueOnce(renewed())
      .mockResolvedValueOnce(reply(401));
    expect((await invoke(client())).error).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });

  it.each(['transport', '503'])('does not retry %s failures', async (failure) => {
    if (failure === 'transport') global.fetch.mockRejectedValue(new Error('response lost'));
    else global.fetch.mockResolvedValue(reply(503));
    expect((await invoke(client())).error).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('preserves explicit replacement during the request', async () => {
    const current = client();
    global.fetch.mockImplementation(async () => {
      await current.auth.setSession(replacement);
      return reply(401);
    });
    expect((await invoke(current)).error).toMatchObject({ status: 409 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(current.accessToken).toBe(replacement.access_token);
  });

  it('captures ownership before yielding to a replacement session', async () => {
    const current = client();
    global.fetch.mockResolvedValue(reply(status, body));
    const request = invoke(current);
    await current.auth.setSession(replacement);
    expect((await request).error).toBeInstanceOf(AuthSessionChangedError);
    for (const [, options] of global.fetch.mock.calls) {
      expect(options.headers.Authorization).toBe(`Bearer ${sessionToken(SESSION)}`);
    }
  });
});

it('captures ownership before serializing a provider API body', async () => {
  const current = client();
  global.fetch.mockResolvedValue(reply(200, { data: {} }));
  const body = {
    toJSON() {
      void current.auth.setSession(replacement);
      return { name: 'original' };
    },
  };
  const result = await current.auth.callOAuthAPI('github', { endpoint: '/user', body });
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(global.fetch).not.toHaveBeenCalled();
});

it('replays a provider API body snapshot after refresh', async () => {
  const current = client();
  const body = { names: ['original'] };
  global.fetch
    .mockImplementationOnce(async () => {
      body.names.push('changed');
      return reply(401);
    })
    .mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(reply(200, { data: {} }));
  expect((await current.auth.callOAuthAPI('github', { endpoint: '/user', body })).error).toBeNull();
  expect(JSON.parse(global.fetch.mock.calls[2][1].body).body).toEqual({ names: ['original'] });
});

it('clears the current session after refreshing an authenticated deletion', async () => {
  const current = client();
  global.fetch
    .mockResolvedValueOnce(reply(401))
    .mockResolvedValueOnce(renewed())
    .mockResolvedValueOnce(reply(204));
  expect((await current.auth.deleteSession(SESSION)).error).toBeNull();
  expect(current.accessToken).toBeNull();
});

it('captures ownership before reading session-list options', async () => {
  const current = client();
  global.fetch.mockResolvedValue(reply(200, { sessions: [] }));
  const options = {
    get page() {
      void current.auth.setSession(replacement);
      return 2;
    },
  };
  const result = await current.auth.getSessions(options);
  expect(result.error).toBeInstanceOf(AuthSessionChangedError);
  expect(global.fetch).not.toHaveBeenCalled();
});
