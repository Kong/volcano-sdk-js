/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { deferred, fetchUrl, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

// Match the prior jsdom suite: its JSON clone path keeps metadata in Jest's realm.
Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};
const SESSION_ID = '00000000-0000-4000-8000-000000000012';

function rejectsRepliesForOtherUsers(): void {
  it('does not replay a rejected request under another user after refresh', async () => {
    const client = new VolcanoAuth({
      ...config,
      accessToken: sessionToken(),
      refreshToken: 'supplied-refresh',
    });
    const user = { id: 'user-123', email: 'test@example.com', status: 'active' };
    fetchMock
      .mockResolvedValueOnce(reply(200, { user }))
      .mockResolvedValueOnce(reply(401, { error: 'Expired' }))
      .mockResolvedValueOnce(
        reply(200, {
          access_token: sessionToken(undefined, true),
          refresh_token: 'other-refresh',
          user: { id: 'other-user', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );
    await client.auth.getUser();

    const result = await client.auth.getUser();
    expect(result.user).toBeNull();
    expect(result.error).toBeTruthy();
    expect(client.currentUser).toEqual(user);
    expect(client.accessToken).toBe(sessionToken());
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
}

function rejectsRefreshesForOtherUsers(): void {
  it.each([false, true])(
    'rejects a refresh for another user with concurrent profile enrichment: %s',
    async (enrichDuringRefresh) => {
      const client = new VolcanoAuth({
        ...config,
        accessToken: testAccessToken('project-id', { session_id: SESSION_ID }),
        refreshToken: 'supplied-refresh',
      });
      const profile = { id: 'user-123', email: 'test@example.com', status: 'active' };
      fetchMock.mockImplementation(async (url) => {
        if (fetchUrl(url).endsWith('/auth/user')) {
          return reply(200, { user: profile });
        }
        if (enrichDuringRefresh) {
          await client.auth.getUser();
        }
        return reply(200, {
          access_token: testAccessToken('project-id', { session_id: SESSION_ID }),
          refresh_token: 'other-refresh',
          user: { id: 'other-user', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        });
      });
      if (!enrichDuringRefresh) {
        await client.auth.getUser();
      }

      const refreshed = await client.auth.refreshSession();
      expect(refreshed.error).toMatchObject({
        message: expect.stringContaining('different user'),
      });
      expect(client.currentUser).toEqual(profile);
      expect(client.accessToken).toBe(testAccessToken('project-id', { session_id: SESSION_ID }));
    },
  );
}

function discardsStaleProfiles(): void {
  it.each(['getUser', 'updateUser'])('discards a stale %s profile when refresh wins first', async (method) => {
    const client = new VolcanoAuth({
      ...config,
      accessToken: testAccessToken('project-id', { session_id: SESSION_ID }),
      refreshToken: 'refresh-b',
    });
    const pending = deferred<Response>();
    const started = signal();
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return pending.promise;
    });
    const profile =
      method === 'getUser' ? client.auth.getUser() : client.auth.updateUser({ metadata: { name: 'example' } });
    await within(started.promise, 'profile request start');
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        access_token: testAccessToken('project-id', { session_id: SESSION_ID, renewed: true }),
        refresh_token: 'rotated-b',
        user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );
    const refreshed = await within(client.auth.refreshSession(), 'refresh completion');
    expect(refreshed.error).toBeNull();
    pending.resolve(reply(200, { user: { id: 'user-a', email: 'fixture@example.com', status: 'active' } }));
    const profileResult = await within(profile, 'stale profile completion');
    expect(profileResult.error).toBeInstanceOf(AuthSessionChangedError);
    expect(client.currentUser?.id).toBe('user-b');
    expect(client.accessToken).toBe(testAccessToken('project-id', { session_id: SESSION_ID, renewed: true }));
  });
}

describe('VolcanoAuth', () => {
  describe('Authentication - token-only bootstrap', () => {
    rejectsRepliesForOtherUsers();
    rejectsRefreshesForOtherUsers();
    discardsStaleProfiles();
  });
});
