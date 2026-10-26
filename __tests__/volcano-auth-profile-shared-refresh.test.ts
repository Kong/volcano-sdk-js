/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { fetchRoutes } from './support/fetch-routes.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

type Route = (options: RequestInit | undefined) => Promise<Response>;

function refreshedSession(): Response {
  return reply(200, {
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    expires_in: 3600,
  });
}

function currentProfile(): Promise<Response> {
  return Promise.resolve(reply(200, { user: { id: 'user-1', email: 'fixture@example.com', status: 'active' } }));
}

function sharesConcurrentRefresh(): void {
  it('shares one refresh across concurrent authenticated requests', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = signal();
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'shared-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    const refreshRoute = jest.fn<Route>(() => {
      refreshStarted.resolve();
      return refreshResponse.promise;
    });
    const userRoute = jest
      .fn<Route>(currentProfile)
      .mockResolvedValueOnce(reply(401, { error: 'Token expired' }))
      .mockResolvedValueOnce(reply(401, { error: 'Token expired' }));
    fetchMock.mockImplementation(fetchRoutes({ '/auth/refresh': refreshRoute, '/auth/user': userRoute }));

    const first = volcano.auth.getUser();
    const second = volcano.auth.getUser();
    await within(refreshStarted.promise, 'shared refresh start');
    refreshResponse.resolve(refreshedSession());

    const [firstResult, secondResult] = await within(Promise.all([first, second]), 'shared profile refresh');

    expect(refreshRoute).toHaveBeenCalledTimes(1);
    expect(firstResult).toEqual({
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      error: null,
    });
    expect(secondResult).toEqual({
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
      error: null,
    });
    expect(userRoute).toHaveBeenCalledTimes(4);
    expect(volcano.accessToken).toBe('new-access');
  });
}

function reusesCompletedRefresh(): void {
  it('reuses a completed refresh for a delayed request from the same session', async () => {
    const delayedResponse = deferred<Response>();
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'shared-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    const refreshRoute = jest.fn<Route>(() => Promise.resolve(refreshedSession()));
    const userRoute = jest
      .fn<Route>(currentProfile)
      .mockResolvedValueOnce(reply(401, { error: 'Token expired' }))
      .mockReturnValueOnce(delayedResponse.promise);
    fetchMock.mockImplementation(fetchRoutes({ '/auth/refresh': refreshRoute, '/auth/user': userRoute }));

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
    expect(refreshRoute).toHaveBeenCalledTimes(1);
    expect(userRoute).toHaveBeenCalledTimes(4);
    expect(volcano.accessToken).toBe('new-access');
  });
}

describe('VolcanoAuth profile continuity', () => {
  describe('Authentication - getUser', () => {
    sharesConcurrentRefresh();
    reusesCompletedRefresh();
  });
});
