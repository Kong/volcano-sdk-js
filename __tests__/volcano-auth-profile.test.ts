/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.js';
import { deferred, fetchCall, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function rejectedProfileFixture(mode: string): {
  first: Response;
  refresh: Response | null;
  code: string | undefined;
  calls: number;
} {
  if (mode === 'malformed rejection') {
    return {
      first: new Response('not-json', { status: 401, headers: { 'Retry-After': '7' } }),
      refresh: null,
      code: undefined,
      calls: 1,
    };
  }
  const first = reply(
    401,
    { error: 'Session revoked', code: 'SESSION_REVOKED' },
    { 'Retry-After': '7' },
  );
  return mode === 'rejected refresh'
    ? {
        first,
        refresh: reply(401, { error: 'Refresh rejected', code: 'REFRESH_REJECTED' }),
        code: 'SESSION_REVOKED',
        calls: 2,
      }
    : { first, refresh: null, code: 'SESSION_REVOKED', calls: 1 };
}

describe('VolcanoAuth profile continuity', () => {
  describe('Authentication - profile refresh replay', () => {
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
        expect(new Headers(retryOptions?.headers).get('Authorization')).toBe(
          `Bearer ${sessionToken(undefined, true)}`,
        );
      },
    );
  });

  describe('Authentication - getUser', () => {
    it.each(['missing refresh token', 'rejected refresh', 'malformed rejection'])(
      'preserves authentication error metadata with %s',
      async (mode) => {
        const fixture = rejectedProfileFixture(mode);
        volcano.accessToken = sessionToken();
        if (fixture.refresh !== null) {
          volcano.refreshToken = 'refresh-token';
        }
        fetchMock.mockResolvedValueOnce(fixture.first);
        if (fixture.refresh !== null) {
          fetchMock.mockResolvedValueOnce(fixture.refresh);
        }

        const result = await volcano.auth.getUser();
        expect(result.user).toBeNull();
        expect(result.error).toMatchObject({
          message: 'Session expired',
          status: 401,
          retryAfter: 7,
        });
        expect(result.error?.code).toBe(fixture.code);
        expect(global.fetch).toHaveBeenCalledTimes(fixture.calls);
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

    it('shares one refresh across concurrent authenticated requests', async () => {
      const refreshResponse = deferred<Response>();
      const refreshStarted = signal();
      let userRequests = 0;
      let refreshRequests = 0;
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'shared-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockImplementation((url) => {
        if (requestUrl(url).endsWith('/auth/refresh')) {
          refreshRequests += 1;
          refreshStarted.resolve();
          return refreshResponse.promise;
        }

        userRequests += 1;
        if (userRequests <= 2) {
          return Promise.resolve(reply(401, { error: 'Token expired' }));
        }
        return Promise.resolve(
          reply(200, {
            user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
          }),
        );
      });

      const first = volcano.auth.getUser();
      const second = volcano.auth.getUser();
      await within(refreshStarted.promise, 'shared refresh start');
      refreshResponse.resolve(
        reply(200, {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const [firstResult, secondResult] = await within(
        Promise.all([first, second]),
        'shared profile refresh',
      );

      expect(refreshRequests).toBe(1);
      expect(firstResult).toEqual({
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        error: null,
      });
      expect(secondResult).toEqual({
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        error: null,
      });
      expect(userRequests).toBe(4);
      expect(volcano.accessToken).toBe('new-access');
    });

    it('reuses a completed refresh for a delayed request from the same session', async () => {
      const delayedResponse = deferred<Response>();
      let userRequests = 0;
      let refreshRequests = 0;
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'shared-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockImplementation((url) => {
        if (requestUrl(url).endsWith('/auth/refresh')) {
          refreshRequests += 1;
          return Promise.resolve(
            reply(200, {
              access_token: 'new-access',
              refresh_token: 'new-refresh',
              user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
              expires_in: 3600,
            }),
          );
        }

        userRequests += 1;
        if (userRequests === 1) {
          return Promise.resolve(reply(401, { error: 'Token expired' }));
        }
        if (userRequests === 2) {
          return delayedResponse.promise;
        }
        return Promise.resolve(
          reply(200, {
            user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
          }),
        );
      });

      const first = volcano.auth.getUser();
      const delayed = volcano.auth.getUser();
      await expect(within(first, 'first profile refresh')).resolves.toEqual({
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        error: null,
      });
      delayedResponse.resolve(reply(401, { error: 'Token expired' }));

      await expect(within(delayed, 'delayed profile replay')).resolves.toEqual({
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        error: null,
      });
      expect(refreshRequests).toBe(1);
      expect(userRequests).toBe(4);
      expect(volcano.accessToken).toBe('new-access');
    });

    it('does not replay a request after its refresh is superseded', async () => {
      const refreshResponse = deferred<Response>();
      const refreshStarted = signal();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock
        .mockResolvedValueOnce(reply(401, { error: 'Token expired' }))
        .mockImplementationOnce(() => {
          refreshStarted.resolve();
          return refreshResponse.promise;
        });

      const getUser = volcano.auth.getUser();
      await within(refreshStarted.promise, 'superseded refresh start');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
      });
      refreshResponse.resolve(
        reply(200, {
          access_token: 'stale-access',
          refresh_token: 'stale-refresh',
          user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      const result = await within(getUser, 'superseded profile completion');

      expect(result.user).toBeNull();
      expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.currentUser).toEqual({
        id: 'user-2',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('does not replay after a refresh callback replaces the session', async () => {
      let replaced = false;
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
      });
      volcano.auth.onAuthStateChange((user) => {
        if (!replaced && user !== null && Reflect.get(user, 'refreshed') === true) {
          replaced = true;
          volcano._setSession({
            access_token: 'replacement-access',
            refresh_token: 'replacement-refresh',
            user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
          });
        }
      });
      fetchMock.mockResolvedValueOnce(reply(401, { error: 'Token expired' })).mockResolvedValueOnce(
        reply(200, {
          access_token: 'refreshed-access',
          refresh_token: 'refreshed-refresh',
          user: {
            id: 'old-user',
            refreshed: true,
            email: 'fixture@example.com',
            status: 'active',
          },
          expires_in: 3600,
        }),
      );

      const result = await within(volcano.auth.getUser(), 'replaced refresh callback');

      expect(result.user).toBeNull();
      expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.currentUser).toEqual({
        id: 'user-2',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('does not refresh an already superseded request', async () => {
      const requestResponse = deferred<Response>();
      const requestStarted = signal();
      volcano._setSession({
        access_token: 'old-access',
        refresh_token: 'old-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock.mockImplementationOnce(() => {
        requestStarted.resolve();
        return requestResponse.promise;
      });

      const getUser = volcano.auth.getUser();
      await within(requestStarted.promise, 'superseded request start');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
      });
      requestResponse.resolve(reply(401, { error: 'Token expired' }));

      const result = await within(getUser, 'superseded request completion');

      expect(result.user).toBeNull();
      expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.currentUser).toEqual({
        id: 'user-2',
        email: 'fixture@example.com',
        status: 'active',
      });
    });
  });

  describe('Authentication - current user writer guards', () => {
    it.each([
      ['getUser', (client: VolcanoAuth) => client.auth.getUser(), true],
      [
        'updateUser',
        (client: VolcanoAuth) => client.auth.updateUser({ metadata: { name: 'stale' } }),
        false,
      ],
      [
        'convertAnonymous',
        (client: VolcanoAuth) =>
          client.auth.convertAnonymous({
            email: 'converted@example.com',
            password: 'password123',
          }),
        false,
      ],
      [
        'confirmEmailChange',
        (client: VolcanoAuth) => client.auth.confirmEmailChange('stale-email-change-token'),
        false,
      ],
    ])('discards a stale %s response', async (_name, invoke, tracksRedirectNotification) => {
      const response = deferred<Response>();
      const requestStarted = signal();
      const callback = jest.fn();
      volcano._setSession({
        access_token: 'access-a',
        refresh_token: 'refresh-a',
        user: { id: 'user-a', email: 'fixture@example.com', status: 'active' },
      });
      volcano.auth.onAuthStateChange(callback);
      callback.mockClear();
      if (tracksRedirectNotification) {
        volcano._pendingUrlAuthNotify = true;
      }
      fetchMock.mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

      const operation = invoke(volcano);
      await within(requestStarted.promise, 'profile writer request start');
      volcano._setSession({
        access_token: 'access-b',
        refresh_token: 'refresh-b',
        user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
      });
      callback.mockClear();
      response.resolve(
        reply(200, {
          user: { id: 'stale-user-a', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await within(operation, 'stale profile writer completion');

      expect(result.user).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser).toEqual({
        id: 'user-b',
        email: 'fixture@example.com',
        status: 'active',
      });
      expect(volcano.accessToken).toBe('access-b');
      expect(callback).not.toHaveBeenCalled();
      expect(volcano._pendingUrlAuthNotify).toBe(false);
    });
  });
});
