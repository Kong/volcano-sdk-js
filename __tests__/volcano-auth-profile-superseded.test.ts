/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, type AuthStateCallback, VolcanoAuth } from '../src/index.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function dropsSupersededRefresh(): void {
  it('does not replay a request after its refresh is superseded', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = signal();
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Token expired' })).mockImplementationOnce(() => {
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
}

function dropsRefreshReplacedByCallback(): void {
  it('does not replay after a refresh callback replaces the session', async () => {
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
    });
    const listener = jest.fn<AuthStateCallback>();
    volcano.auth.onAuthStateChange(listener);
    // Registration already reported the current user; the next notification is the refreshed user.
    listener.mockImplementationOnce(() => {
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
      });
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
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({ id: 'old-user', refreshed: true }));
  });
}

function skipsRefreshForSupersededRequest(): void {
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
}

describe('VolcanoAuth profile continuity', () => {
  describe('Authentication - getUser', () => {
    dropsSupersededRefresh();
    dropsRefreshReplacedByCallback();
    skipsRefreshForSupersededRequest();
  });
});
