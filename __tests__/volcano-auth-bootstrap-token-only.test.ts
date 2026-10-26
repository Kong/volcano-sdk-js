/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { required } from './support/volcano-auth-bootstrap-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

// Match the prior jsdom suite: its JSON clone path keeps metadata in Jest's realm.
Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function readsEstablishedSessions(): void {
  it('returns an empty successful result without a session or request', async () => {
    await expect(volcano.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('returns a detached snapshot of the established session', async () => {
    const user = {
      id: 'user-123',
      email: 'test@example.com',
      user_metadata: { theme: 'dark' },
      created_at: '2026-08-28T00:00:00Z',
      updated_at: '2026-08-28T00:00:00Z',
      status: 'active' as const,
    };
    volcano.accessToken = 'access-token';
    volcano.refreshToken = 'refresh-token';
    volcano.currentUser = user;

    const first = await volcano.auth.getSession();
    const session = required(first.data.session);
    const metadata = required(required(session.user).user_metadata);
    session.access_token = 'changed';
    metadata['theme'] = 'light';
    const second = await volcano.auth.getSession();

    expect(second).toEqual({
      data: { session: { access_token: 'access-token', refresh_token: 'refresh-token', user } },
      error: null,
    });
    expect(volcano.accessToken).toBe('access-token');
    expect(volcano.currentUser).toMatchObject({ user_metadata: { theme: 'dark' } });
    expect(global.fetch).not.toHaveBeenCalled();
  });
}

function readsAccessTokenOnlySessions(): void {
  it('allows an access-token-only session', async () => {
    const client = new VolcanoAuth({ ...config, accessToken: 'access-token' });

    await expect(client.auth.getSession()).resolves.toEqual({
      data: {
        session: {
          access_token: 'access-token',
          refresh_token: null,
          user: null,
        },
      },
      error: null,
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
}

function revokesTokenOnlySessions(): void {
  it.each([204, 401, 503])('revokes a token-only session and clears locally after status %s', async (status) => {
    const token = testAccessToken('project-id', { session_id: '00000000-0000-4000-8000-000000000011' });
    const client = new VolcanoAuth({ ...config, accessToken: token });
    fetchMock.mockResolvedValueOnce(reply(status, { error: 'revocation failed' }));
    const result = await client.auth.signOut();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      `${config.apiUrl}/auth/user/sessions/00000000-0000-4000-8000-000000000011`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
    expect(Boolean(result.error)).toBe(status !== 204);
    expect(client.accessToken).toBeNull();
  });

  it('preserves a replacement made while token-only revocation is in flight', async () => {
    const token = testAccessToken('project-id', { session_id: '00000000-0000-4000-8000-000000000011' });
    const client = new VolcanoAuth({ ...config, accessToken: token });
    fetchMock.mockImplementationOnce(async () => {
      await client.auth.setSession({
        access_token: 'replacement',
        refresh_token: 'refresh',
        user: { id: 'other-user', email: 'fixture@example.com', status: 'active' },
      });
      return reply(204);
    });
    const result = await client.auth.signOut();
    expect(result.error).toBeInstanceOf(AuthSessionChangedError);
    expect(client.accessToken).toBe('replacement');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
}

function revokesMismatchedRefreshSessions(): void {
  it('revokes the access-token session when the supplied refresh token belongs elsewhere', async () => {
    const token = testAccessToken('project-id', { session_id: '00000000-0000-4000-8000-000000000011' });
    const client = new VolcanoAuth({
      ...config,
      accessToken: token,
      refreshToken: 'different-session-refresh',
    });
    fetchMock.mockResolvedValueOnce(reply(204));
    const signedOut = await client.auth.signOut();
    expect(signedOut.error).toBeNull();
    expect(global.fetch).toHaveBeenCalledWith(
      `${config.apiUrl}/auth/user/sessions/00000000-0000-4000-8000-000000000011`,
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: `Bearer ${token}` }),
      }),
    );
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(client.accessToken).toBeNull();
  });
}

function keepsSuppliedAccessTokens(): void {
  it('validates and caches the profile without inventing refresh credentials', async () => {
    const client = new VolcanoAuth({ ...config, accessToken: 'supplied-access' });
    const initial = await client.auth.getSession();
    const user = { id: 'user-123', email: 'test@example.com', status: 'active' };
    expect(global.fetch).not.toHaveBeenCalled();
    fetchMock.mockResolvedValueOnce(reply(200, { user }));

    await expect(client.auth.getUser()).resolves.toEqual({ user, error: null });
    expect(global.fetch).toHaveBeenCalledWith(
      `${config.apiUrl}/auth/user`,
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer supplied-access' }),
      }),
    );
    const current = await client.auth.getSession();
    expect(current.data.session).toEqual({ access_token: 'supplied-access', refresh_token: null, user });
    expect(initial.data.session?.user).toBeNull();
  });

  it('preserves a rejected access token until local sign-out without refresh or revocation', async () => {
    const client = new VolcanoAuth({ ...config, accessToken: 'supplied-access' });
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Expired supplied token' }));

    const profile = await client.auth.getUser();
    expect(profile.error).toBeTruthy();
    const refresh = await client.auth.refreshSession();
    expect(refresh.error).toMatchObject({ message: 'No refresh token' });
    expect(client.accessToken).toBe('supplied-access');
    await expect(client.auth.signOut()).resolves.toEqual({ error: null });
    await expect(client.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
}

describe('VolcanoAuth', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('auth.getSession()', () => {
    readsEstablishedSessions();
    readsAccessTokenOnlySessions();
  });

  describe('Authentication - token-only bootstrap', () => {
    revokesTokenOnlySessions();
    revokesMismatchedRefreshSessions();
    keepsSuppliedAccessTokens();
  });
});
