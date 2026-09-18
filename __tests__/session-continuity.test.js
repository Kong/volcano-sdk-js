const { VolcanoAuth, AuthSessionChangedError } = require('../src/index.js');

function token(sessionId, renewed = false) {
  return `header.${Buffer.from(JSON.stringify({ session_id: sessionId, renewed })).toString('base64url')}.signature`;
}
function reply(status, data = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function refresh(sessionId = '00000000-0000-4000-8000-000000000001', userId = 'user-a') {
  return reply(200, {
    access_token: token(sessionId, true),
    refresh_token: 'rotated',
    user: { id: userId },
  });
}
function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: token('00000000-0000-4000-8000-000000000001'),
    refreshToken: 'refresh',
  });
}

describe('server session continuity', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it.each([
    ['user-a', false],
    ['user-b', false],
    ['user-a', true],
    ['user-b', true],
  ])('rejects a different session for %s, profile validated: %s', async (userId, profileFirst) => {
    const current = client();
    if (profileFirst) {
      global.fetch.mockResolvedValueOnce(reply(200, { user: { id: 'user-a' } }));
      await current.auth.getUser();
    }
    global.fetch
      .mockResolvedValueOnce(reply(401, { error: 'expired' }))
      .mockResolvedValueOnce(refresh('00000000-0000-4000-8000-000000000002', userId));
    const outcome = await current.database('main').insert('items', { name: 'example' }).execute();
    expect(outcome.error).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(profileFirst ? 3 : 2);
    expect(current.accessToken).toBe(token('00000000-0000-4000-8000-000000000001'));
  });

  it('rejects unknown bootstrap refresh without a session identifier before I/O', async () => {
    const current = new VolcanoAuth({
      anonKey: 'anon',
      accessToken: 'malformed',
      refreshToken: 'refresh',
    });
    const outcome = await current.auth.refreshSession();
    expect(outcome.error.message).toContain('session identifier');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'renews expired access for revocation, replacement: %s',
    async (replace) => {
      const current = client();
      global.fetch
        .mockResolvedValueOnce(reply(401, { error: 'expired' }))
        .mockImplementationOnce(async () => {
          if (replace)
            await current.auth.setSession({
              access_token: 'replacement',
              refresh_token: 'replacement-refresh',
              user: { id: 'other' },
            });
          return refresh();
        })
        .mockResolvedValueOnce(reply(204));
      const result = await current.auth.signOut();
      expect(result.error?.constructor ?? null).toBe(replace ? AuthSessionChangedError : null);
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(global.fetch.mock.calls[2]).toEqual([
        'https://api.test/auth/user/sessions/00000000-0000-4000-8000-000000000001',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            Authorization: `Bearer ${token('00000000-0000-4000-8000-000000000001', true)}`,
          }),
        }),
      ]);
      expect(current.accessToken).toBe(replace ? 'replacement' : null);
    },
  );

  it('clears a refresh of the revoked session lineage', async () => {
    const current = client();
    global.fetch
      .mockImplementationOnce(async () => {
        await current.auth.refreshSession();
        return reply(204);
      })
      .mockResolvedValueOnce(refresh());
    expect((await current.auth.signOut()).error).toBeNull();
    expect(current.accessToken).toBeNull();
  });

  it('never revokes another session while recovering expired access', async () => {
    const current = client();
    global.fetch
      .mockResolvedValueOnce(reply(401, { error: 'expired' }))
      .mockResolvedValueOnce(refresh('00000000-0000-4000-8000-000000000002'));
    const result = await current.auth.signOut();
    expect(result.error.message).toContain('different server session');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(current.accessToken).toBeNull();
  });
  it.each([false, true])(
    'shares a rotating refresh with sign-out, refresh finishes first: %s',
    async (finishFirst) => {
      const current = client();
      let resolveDelete;
      let resolveRefresh;
      const firstDelete = new Promise((resolve) => {
        resolveDelete = resolve;
      });
      const refreshResult = new Promise((resolve) => {
        resolveRefresh = resolve;
      });
      let deleteStarted;
      const started = new Promise((resolve) => {
        deleteStarted = resolve;
      });
      global.fetch
        .mockImplementationOnce(() => {
          deleteStarted();
          return firstDelete;
        })
        .mockReturnValueOnce(refreshResult)
        .mockResolvedValueOnce(reply(204));
      const signingOut = current.auth.signOut();
      await started;
      const refreshing = current.auth.refreshSession();
      if (finishFirst) {
        resolveRefresh(refresh());
        await refreshing;
      }
      resolveDelete(reply(401, { error: 'expired' }));
      await Promise.resolve();
      resolveRefresh(refresh());
      await refreshing;
      expect((await signingOut).error).toBeNull();
      expect(global.fetch.mock.calls.map(([url]) => new URL(url).pathname)).toEqual([
        '/auth/user/sessions/00000000-0000-4000-8000-000000000001',
        '/auth/refresh',
        '/auth/user/sessions/00000000-0000-4000-8000-000000000001',
      ]);
      expect(current.accessToken).toBeNull();
    },
  );

  it('falls back to refresh-token logout for a malformed session claim', async () => {
    const current = new VolcanoAuth({
      anonKey: 'anon',
      apiUrl: 'https://api.test',
      accessToken: token('../invalid'),
      refreshToken: 'refresh',
    });
    global.fetch.mockResolvedValueOnce(reply(204));
    expect((await current.auth.signOut()).error).toBeNull();
    expect(global.fetch.mock.calls[0][0]).toBe('https://api.test/auth/logout');
  });
  it('shares the old refresh while a replacement session also refreshes', async () => {
    const current = client();
    let resolveDelete;
    let resolveOldRefresh;
    let resolveNewRefresh;
    let deleteStarted;
    let oldStarted;
    let newStarted;
    const oldRequested = new Promise((resolve) => {
      oldStarted = resolve;
    });
    const newRequested = new Promise((resolve) => {
      newStarted = resolve;
    });
    const started = new Promise((resolve) => {
      deleteStarted = resolve;
    });
    const pendingDelete = new Promise((resolve) => {
      resolveDelete = resolve;
    });
    const oldRefresh = new Promise((resolve) => {
      resolveOldRefresh = resolve;
    });
    const newRefresh = new Promise((resolve) => {
      resolveNewRefresh = resolve;
    });
    global.fetch
      .mockImplementationOnce(() => {
        deleteStarted();
        return pendingDelete;
      })
      .mockImplementationOnce(() => {
        oldStarted();
        return oldRefresh;
      })
      .mockImplementationOnce(() => {
        newStarted();
        return newRefresh;
      })
      .mockResolvedValueOnce(reply(204));
    const signingOut = current.auth.signOut();
    await started;
    const refreshingOld = current.auth.refreshSession();
    await oldRequested;
    await current.auth.setSession({
      access_token: token('00000000-0000-4000-8000-000000000002'),
      refresh_token: 'new-refresh',
      user: { id: 'user-b' },
    });
    const refreshingNew = current.auth.refreshSession();
    await newRequested;
    resolveDelete(reply(401, { error: 'expired' }));
    await Promise.resolve();
    resolveOldRefresh(refresh());
    await refreshingOld;
    expect((await signingOut).error).toBeInstanceOf(AuthSessionChangedError);
    resolveNewRefresh(refresh('00000000-0000-4000-8000-000000000002', 'user-b'));
    expect((await refreshingNew).error).toBeNull();
    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(global.fetch.mock.calls[3][1].method).toBe('DELETE');
    expect(current.currentUser.id).toBe('user-b');
  });
});
