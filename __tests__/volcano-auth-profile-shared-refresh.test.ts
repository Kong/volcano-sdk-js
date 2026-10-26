/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';

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

function refreshedSession(): Response {
  return reply(200, {
    access_token: 'new-access',
    refresh_token: 'new-refresh',
    user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    expires_in: 3600,
  });
}

function sharesConcurrentRefresh(): void {
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
    refreshResponse.resolve(refreshedSession());

    const [firstResult, secondResult] = await within(Promise.all([first, second]), 'shared profile refresh');

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
}

function reusesCompletedRefresh(): void {
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
        return Promise.resolve(refreshedSession());
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
}

describe('VolcanoAuth profile continuity', () => {
  describe('Authentication - getUser', () => {
    sharesConcurrentRefresh();
    reusesCompletedRefresh();
  });
});
