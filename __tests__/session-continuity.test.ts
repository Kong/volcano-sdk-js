/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import {
  deferred,
  fetchBody,
  fetchCall,
  fetchPath,
  fetchUrl,
  jsonField,
  reply,
  resultError,
  signal,
} from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

function token(sessionId: string, renewed = false): string {
  return `header.${Buffer.from(JSON.stringify({ session_id: sessionId, renewed })).toString('base64url')}.signature`;
}
function refresh(sessionId = '00000000-0000-4000-8000-000000000001', userId = 'user-a'): Response {
  return reply(200, {
    access_token: token(sessionId, true),
    refresh_token: 'rotated',
    expires_in: 3600,
    user: { id: userId, email: 'fixture@example.com', status: 'active' },
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
  it.each([
    ['user-a', false],
    ['user-b', false],
    ['user-a', true],
    ['user-b', true],
  ])('rejects a different session for %s, profile validated: %s', async (userId, profileFirst) => {
    const current = client();
    if (profileFirst) {
      fetchMock.mockResolvedValueOnce(
        reply(200, { user: { id: 'user-a', email: 'fixture@example.com', status: 'active' } }),
      );
      await current.auth.getUser();
    }
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: 'expired' }))
      .mockResolvedValueOnce(refresh('00000000-0000-4000-8000-000000000002', userId));
    const outcome = await current.database('main').insert('items', { name: 'example' }).execute();
    expect(outcome.error).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(profileFirst ? 3 : 2);
    expect(current.accessToken).toBe(token('00000000-0000-4000-8000-000000000001'));
  });

  it('rejects unknown bootstrap refresh without a session identifier before I/O', async () => {
    const current = new VolcanoAuth({
      anonKey: 'anon',
      accessToken: 'malformed',
      refreshToken: 'refresh',
    });
    const outcome = await current.auth.refreshSession();
    expect(outcome.error?.message).toContain('session identifier');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'renews expired access for revocation, replacement: %s',
    async (replace) => {
      const current = client();
      fetchMock
        .mockResolvedValueOnce(reply(401, { error: 'expired' }))
        .mockImplementationOnce(async () => {
          if (replace) {
            await current.auth.setSession({
              access_token: 'replacement',
              refresh_token: 'replacement-refresh',
              user: { id: 'other', email: 'fixture@example.com', status: 'active' },
            });
          }
          return refresh();
        })
        .mockResolvedValueOnce(reply(204));
      const result = await current.auth.signOut();
      expect(result.error?.constructor ?? null).toBe(replace ? AuthSessionChangedError : null);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(fetchMock.mock.calls[2]).toEqual([
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
    fetchMock
      .mockImplementationOnce(async () => {
        await current.auth.refreshSession();
        return reply(204);
      })
      .mockResolvedValueOnce(refresh());
    expect(await resultError(current.auth.signOut())).toBeNull();
    expect(current.accessToken).toBeNull();
  });

  it('never revokes another session while recovering expired access', async () => {
    const current = client();
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: 'expired' }))
      .mockResolvedValueOnce(refresh('00000000-0000-4000-8000-000000000002'));
    const result = await current.auth.signOut();
    expect(result.error?.message).toContain('different server session');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(current.accessToken).toBeNull();
  });
  it.each([false, true])(
    'shares a rotating refresh with sign-out, refresh finishes first: %s',
    async (finishFirst) => {
      const current = client();
      const firstDelete = deferred<Response>();
      const refreshResult = deferred<Response>();
      const started = signal();
      fetchMock
        .mockImplementationOnce(() => {
          started.resolve();
          return firstDelete.promise;
        })
        .mockReturnValueOnce(refreshResult.promise)
        .mockResolvedValueOnce(reply(204));
      const signingOut = current.auth.signOut();
      await started.promise;
      const refreshing = current.auth.refreshSession();
      if (finishFirst) {
        refreshResult.resolve(refresh());
        await refreshing;
      }
      firstDelete.resolve(reply(401, { error: 'expired' }));
      await Promise.resolve();
      refreshResult.resolve(refresh());
      await refreshing;
      expect(await resultError(signingOut)).toBeNull();
      expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual([
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
    fetchMock.mockResolvedValueOnce(reply(204));
    expect(await resultError(current.auth.signOut())).toBeNull();
    expect(fetchCall(0)[0]).toBe('https://api.test/auth/logout');
  });
  it('shares the old refresh while a replacement session also refreshes', async () => {
    const current = client();
    const oldRequested = signal();
    const newRequested = signal();
    const oldRefresh = deferred<Response>();
    const newRefresh = deferred<Response>();
    fetchMock.mockImplementation((url, options) => {
      if (fetchUrl(url).endsWith('/auth/logout')) {
        return Promise.resolve(reply(204));
      }
      if (jsonField(options, 'refresh_token') === 'refresh') {
        oldRequested.resolve();
        return oldRefresh.promise;
      }
      newRequested.resolve();
      return newRefresh.promise;
    });
    const refreshingOld = current.auth.refreshSession();
    await oldRequested.promise;
    const signingOut = current.auth.signOut();
    await Promise.resolve();
    await current.auth.setSession({
      access_token: token('00000000-0000-4000-8000-000000000002'),
      refresh_token: 'new-refresh',
      user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
    });
    const refreshingNew = current.auth.refreshSession();
    await newRequested.promise;
    oldRefresh.resolve(refresh());
    await refreshingOld;
    expect(await resultError(signingOut)).toBeInstanceOf(AuthSessionChangedError);
    newRefresh.resolve(refresh('00000000-0000-4000-8000-000000000002', 'user-b'));
    expect(await resultError(refreshingNew)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(fetchBody(2))).toEqual({ refresh_token: 'rotated' });
    expect(current.currentUser?.id).toBe('user-b');
  });
});

it.each([false, true])(
  'does not trust a supplied profile without a session ID, enriched: %s',
  async (enriched) => {
    const current = client();
    fetchMock.mockResolvedValue(refresh());
    await current.auth.setSession({
      access_token: 'opaque',
      refresh_token: 'foreign-refresh',
      user: { id: 'user-a', email: 'fixture@example.com', status: 'active' },
    });
    if (enriched) {
      fetchMock.mockResolvedValueOnce(
        reply(200, { user: { id: 'user-a', email: 'fixture@example.com', status: 'active' } }),
      );
      await current.auth.getUser();
      fetchMock.mockClear();
    }
    const outcome = await current.auth.refreshSession();
    expect(outcome.error?.message).toContain('session identifier');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(current.accessToken).toBe('opaque');
  },
);
