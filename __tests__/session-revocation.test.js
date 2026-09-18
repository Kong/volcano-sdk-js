const { VolcanoAuth, AuthSessionChangedError, AuthRefreshDiscardedError } = require('../src');

const SESSION = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const token = (id, version = 1) =>
  `header.${Buffer.from(JSON.stringify({ session_id: id, version })).toString('base64url')}.signature`;
const reply = (status, data = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => data,
});
const renewed = () =>
  reply(200, {
    access_token: token(SESSION, 2),
    refresh_token: 'rotated',
    user: { id: 'user' },
  });
const replacement = {
  access_token: token(OTHER),
  refresh_token: 'other-refresh',
  user: { id: 'other' },
};

function deferred() {
  let resolve;
  const promise = new Promise((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: token(SESSION),
    refreshToken: 'original',
  });
}

describe('captured-session revocation coordination', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('prevents a new refresh after sign-out claims the session', async () => {
    const current = client();
    const entered = deferred();
    const response = deferred();
    global.fetch.mockImplementation(() => {
      entered.resolve();
      return response.promise;
    });
    const signingOut = current.auth.signOut();
    await entered.promise;
    const refreshing = await current.auth.refreshSession();
    response.resolve(reply(204));
    expect(refreshing.error).toBeInstanceOf(AuthRefreshDiscardedError);
    expect((await signingOut).error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(current.accessToken).toBeNull();
  });

  it.each(['none', 'before-refresh-finishes', 'after-refresh-finishes'])(
    'retains an already-running refresh for revocation with replacement %s',
    async (replace) => {
      const current = client();
      const entered = deferred();
      const response = deferred();
      const deleting = deferred();
      const deletion = deferred();
      global.fetch.mockImplementation((url) => {
        if (url.endsWith('/auth/refresh')) {
          entered.resolve();
          return response.promise;
        }
        deleting.resolve();
        return deletion.promise;
      });
      const refreshing = current.auth.refreshSession();
      await entered.promise;
      const signingOut = current.auth.signOut();
      // Let sign-out capture ownership before replacing the public session.
      await Promise.resolve();
      if (replace === 'before-refresh-finishes') await current.auth.setSession(replacement);
      response.resolve(renewed());
      await refreshing;
      await deleting.promise;
      if (replace === 'after-refresh-finishes') await current.auth.setSession(replacement);
      deletion.resolve(reply(204));
      const outcome = await signingOut;
      expect(outcome.error?.constructor ?? null).toBe(
        replace === 'none' ? null : AuthSessionChangedError,
      );
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({ refresh_token: 'rotated' });
      expect(current.accessToken).toBe(replace === 'none' ? null : replacement.access_token);
    },
  );

  it.each([401, 403, 429, 503])(
    'surfaces a shared refresh rejection %s without inventing replacement',
    async (status) => {
      const current = client();
      const entered = deferred();
      const response = deferred();
      global.fetch.mockImplementation((url) => {
        if (url.endsWith('/auth/refresh')) {
          entered.resolve();
          return response.promise;
        }
        return Promise.resolve(reply(401, { error: 'expired access' }));
      });
      const refreshing = current.auth.refreshSession();
      await entered.promise;
      const signingOut = current.auth.signOut();
      await Promise.resolve();
      response.resolve(reply(status, { error: 'refresh rejected' }));
      await refreshing;
      const outcome = await signingOut;
      expect(outcome.error).not.toBeInstanceOf(AuthSessionChangedError);
      expect(outcome.error.message).toBe('refresh rejected');
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(current.accessToken).toBeNull();
    },
  );

  it('shares concurrent sign-out instead of revoking twice', async () => {
    const current = client();
    const entered = deferred();
    const response = deferred();
    global.fetch.mockImplementation(() => {
      entered.resolve();
      return response.promise;
    });
    const first = current.auth.signOut();
    await entered.promise;
    const second = current.auth.signOut();
    response.resolve(reply(204));
    expect(await Promise.all([first, second])).toEqual([{ error: null }, { error: null }]);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});

it('revokes a server-issued pair without requiring an access-token refresh', async () => {
  const current = client();
  global.fetch = jest.fn((url) => {
    if (url.endsWith('/auth/signin')) return Promise.resolve(renewed());
    if (url.endsWith('/auth/logout')) return Promise.resolve(reply(204));
    if (url.endsWith('/auth/refresh'))
      return Promise.resolve(reply(429, { error: 'rate limited' }));
    return Promise.resolve(reply(401, { error: 'expired' }));
  });
  await current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
  expect((await current.auth.signOut()).error).toBeNull();
  expect(global.fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
    '/auth/signin',
    '/auth/logout',
  ]);
});

it('does not use pair provenance after credentials are explicitly replaced or changed', async () => {
  for (const adopt of [false, true]) {
    const current = client();
    global.fetch = jest.fn((url) =>
      url.endsWith('/auth/signin') ? Promise.resolve(renewed()) : Promise.resolve(reply(204)),
    );
    await current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
    if (adopt) await current.auth.setSession({ ...replacement, refresh_token: 'rotated' });
    else current.accessToken = token(OTHER);
    expect((await current.auth.signOut()).error).toBeNull();
    expect(global.fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
      '/auth/signin',
      `/auth/user/sessions/${OTHER}`,
    ]);
  }
});
