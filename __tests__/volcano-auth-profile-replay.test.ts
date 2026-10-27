/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchCall, reply, within } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function revokedSession(): Response {
  return reply(401, { error: 'Session revoked', code: 'SESSION_REVOKED' }, { 'Retry-After': '7' });
}

// Rows: mode, stored refresh token, replies in request order, expected error code, expected requests.
const rejectedProfiles: readonly [string, string | null, () => Response[], string | undefined, number][] = [
  ['missing refresh token', null, () => [revokedSession()], 'SESSION_REVOKED', 1],
  [
    'rejected refresh',
    'refresh-token',
    () => [revokedSession(), reply(401, { error: 'Refresh rejected', code: 'REFRESH_REJECTED' })],
    'SESSION_REVOKED',
    2,
  ],
  [
    'malformed rejection',
    null,
    () => [new Response('not-json', { status: 401, headers: { 'Retry-After': '7' } })],
    undefined,
    1,
  ],
];

function replaysProfileRequests(): void {
  it.each(['getUser', 'updateUser', 'convertAnonymous', 'confirmEmailChange'] as const)(
    '%s replays the original request after one refresh and caches the user',
    async (operation) => {
      const metadata = { roles: ['editor'] };
      const profile = { id: 'user-123', email: 'updated@example.com', status: 'active' };
      await volcano.auth.setSession({
        access_token: sessionToken(),
        refresh_token: 'old-refresh',
        user: { id: profile.id, email: 'fixture@example.com', status: 'active' },
      });
      const invoke = {
        getUser: () => volcano.auth.getUser(),
        updateUser: () => volcano.auth.updateUser({ password: 'secret', metadata }),
        convertAnonymous: () =>
          volcano.auth.convertAnonymous({
            email: profile.email,
            password: 'secret',
            metadata,
          }),
        confirmEmailChange: () => volcano.auth.confirmEmailChange('confirmation'),
      };
      fetchMock
        .mockResolvedValueOnce(reply(401, { error: 'expired' }))
        .mockImplementationOnce(() => {
          metadata.roles.push('changed while refreshing');
          return Promise.resolve(
            reply(200, {
              access_token: sessionToken(undefined, true),
              refresh_token: 'new-refresh',
              user: { id: profile.id, email: 'before-profile@example.com', status: 'active' },
              expires_in: 3600,
            }),
          );
        })
        .mockResolvedValueOnce(reply(200, { user: profile }));
      const result = await within(invoke[operation](), 'profile refresh replay');
      expect(result.error).toBeNull();
      expect(result.user).toEqual(profile);
      expect(volcano.currentUser).toEqual(profile);
      expect(volcano.accessToken).toBe(sessionToken(undefined, true));
      expect(global.fetch).toHaveBeenCalledTimes(3);
      const [initialUrl, initialOptions] = fetchCall(0);
      const [retryUrl, retryOptions] = fetchCall(2);
      expect(initialUrl).toBe(retryUrl);
      expect(initialOptions?.body).toBe(retryOptions?.body);
      expect(new Headers(retryOptions?.headers).get('Authorization')).toBe(`Bearer ${sessionToken(undefined, true)}`);
    },
  );
}

function preservesRejectionMetadata(): void {
  it.each(rejectedProfiles)(
    'preserves authentication error metadata with %s',
    async (_mode, refreshToken, replies, code, requests) => {
      volcano.accessToken = sessionToken();
      volcano.refreshToken = refreshToken;
      replies().forEach((response) => {
        fetchMock.mockResolvedValueOnce(response);
      });

      const result = await volcano.auth.getUser();
      expect(result.user).toBeNull();
      expect(result.error).toMatchObject({
        message: 'Session expired',
        status: 401,
        retryAfter: 7,
      });
      expect(result.error?.code).toBe(code);
      expect(global.fetch).toHaveBeenCalledTimes(requests);
    },
  );

  it('should return user when authenticated', async () => {
    volcano.accessToken = 'valid-token';

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'test@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.getUser();

    expect(result.user?.id).toBe('user-123');
    expect(result.error).toBeNull();
  });
}

function refreshesExpiredProfiles(): void {
  it('should return error when not authenticated', async () => {
    volcano.accessToken = null;

    const result = await volcano.auth.getUser();

    expect(result.user).toBeNull();
    expect(result.error).toBeDefined();
  });

  it('should refresh token on 401 and retry', async () => {
    volcano.accessToken = sessionToken();
    volcano.refreshToken = 'valid-refresh';

    // First call returns 401
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Token expired' }));

    // Refresh call succeeds
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        access_token: sessionToken(undefined, true),
        refresh_token: 'new-refresh-token',
        expires_in: 3600,
        user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
      }),
    );

    // Retry call succeeds
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const result = await volcano.auth.getUser();

    expect(result.user?.id).toBe('user-123');
    expect(volcano.accessToken).toBe(sessionToken(undefined, true));
  });
}

describe('VolcanoAuth profile continuity', () => {
  describe('Authentication - profile refresh replay', () => {
    replaysProfileRequests();
  });

  describe('Authentication - getUser', () => {
    preservesRejectionMetadata();
    refreshesExpiredProfiles();
  });
});
