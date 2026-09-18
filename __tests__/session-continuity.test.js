const { VolcanoAuth, AuthSessionChangedError } = require('../src/index.js');

function token(sessionId, renewed = false) {
  return `header.${Buffer.from(JSON.stringify({ session_id: sessionId, renewed })).toString('base64url')}.signature`;
}
function reply(status, data = {}) {
  return { ok: status >= 200 && status < 300, status, json: async () => data };
}
function refresh(sessionId = 'session-a', userId = 'user-a') {
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
    accessToken: token('session-a'),
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
      .mockResolvedValueOnce(refresh('session-b', userId));
    const outcome = await current.database('main').insert('items', { name: 'example' }).execute();
    expect(outcome.error).toBeTruthy();
    expect(global.fetch).toHaveBeenCalledTimes(profileFirst ? 3 : 2);
    expect(current.accessToken).toBe(token('session-a'));
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
        'https://api.test/auth/user/sessions/session-a',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: `Bearer ${token('session-a', true)}` }),
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
      .mockResolvedValueOnce(refresh('session-b'));
    const result = await current.auth.signOut();
    expect(result.error.message).toContain('different server session');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(current.accessToken).toBeNull();
  });
});
