/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, VolcanoAuth } from '../src/index.ts';
import { reply, within } from './auth-concurrency-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';
import { installWindow, pendingFetch, restoreWindow } from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function clearStorageSpies(): void {
  for (const name of ['setItem', 'removeItem']) {
    const method: unknown = Reflect.get(localStorage, name);
    if (!jest.isMockFunction(method)) {
      throw new Error(`Missing ${name} storage spy`);
    }
    method.mockClear();
  }
}

/** Replaces the session while a refresh is in flight, then settles the refresh with `stale`. */
async function refreshAcrossReplacement(stale: Response, [startLabel, settleLabel]: readonly [string, string]) {
  const callback = jest.fn();
  volcano._setSession({
    access_token: 'old-access',
    refresh_token: 'old-refresh',
    user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
  });
  volcano.auth.onAuthStateChange(callback);
  callback.mockClear();
  const { response, started } = pendingFetch();

  const refresh = volcano.auth.refreshSession();
  await within(started.promise, startLabel);

  volcano._setSession({
    access_token: 'replacement-access',
    refresh_token: 'replacement-refresh',
    user: { id: 'user-2', email: 'fixture@example.com', status: 'active' },
  });
  callback.mockClear();
  clearStorageSpies();

  response.resolve(stale);
  return { callback, result: await within(refresh, settleLabel) };
}

function expectReplacementKept(callback: ReturnType<typeof jest.fn>): void {
  expect(volcano.accessToken).toBe('replacement-access');
  expect(volcano.refreshToken).toBe('replacement-refresh');
  expect(volcano.currentUser).toEqual({
    id: 'user-2',
    email: 'fixture@example.com',
    status: 'active',
  });
  expect(localStorage.getItem('volcano_access_token')).toBe('replacement-access');
  expect(localStorage.getItem('volcano_refresh_token')).toBe('replacement-refresh');
  expect(Reflect.get(localStorage, 'setItem')).not.toHaveBeenCalled();
  expect(Reflect.get(localStorage, 'removeItem')).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
}

function sharesRefreshRequests(): void {
  it('shares one refresh request for the same session', async () => {
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'shared-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    const { response, started } = pendingFetch();

    const first = volcano.auth.refreshSession();
    const second = volcano.auth.refreshSession();

    await within(started.promise, 'shared refresh request start');

    expect(global.fetch).toHaveBeenCalledTimes(1);

    response.resolve(
      reply(200, {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    const [firstResult, secondResult] = await within(Promise.all([first, second]), 'shared refresh completion');
    expect(firstResult).toEqual(secondResult);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
}

function discardsStaleRefreshes(): void {
  it('discards a refresh response after the session is replaced', async () => {
    const { callback, result } = await refreshAcrossReplacement(
      reply(200, {
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
      ['stale refresh request start', 'stale refresh completion'],
    );

    expect(result.session).toBeNull();
    expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
    expectReplacementKept(callback);
  });

  it('does not clear a replacement session after a stale refresh failure', async () => {
    const { callback, result } = await refreshAcrossReplacement(reply(401, { error: 'Old refresh token expired' }), [
      'failed refresh request start',
      'failed refresh completion',
    ]);

    expect(result.session).toBeNull();
    expect(result.error?.message).toBe('Old refresh token expired');
    expectReplacementKept(callback);
  });
}

function preservesSessionsOnServerFailure(): void {
  it('preserves the current session after a refresh server failure', async () => {
    const established = {
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    };
    volcano._setSession(established);
    fetchMock.mockResolvedValueOnce(reply(503, { error: 'Refresh unavailable' }));

    const result = await volcano.auth.refreshSession();

    expect(result.session).toBeNull();
    expect(result.error).toMatchObject({ message: 'Refresh unavailable', status: 503 });
    await expect(volcano.auth.getSession()).resolves.toEqual({
      data: { session: established },
      error: null,
    });
  });
}

function refreshesSessions(): void {
  it('should refresh session successfully', async () => {
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'valid-refresh',
      user: { id: 'user-123', email: 'alice@example.com', status: 'active' },
    });

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        access_token: 'new-access',
        refresh_token: 'new-refresh',
        user: { id: 'user-123', email: 'alice@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    const result = await volcano.auth.refreshSession();

    expect(result.session?.access_token).toBe('new-access');
    expect(result.session?.refresh_token).toBe('new-refresh');
    expect(result.session?.expires_in).toBe(3600);
    expect(result.error).toBeNull();
    expect(volcano.accessToken).toBe('new-access');
    expect(volcano.refreshToken).toBe('new-refresh');
    await expect(volcano.auth.getSession()).resolves.toEqual({
      data: {
        session: {
          access_token: 'new-access',
          refresh_token: 'new-refresh',
          user: { id: 'user-123', email: 'alice@example.com', status: 'active' },
        },
      },
      error: null,
    });
  });
}

function rejectsUnrefreshableSessions(): void {
  it('should return error when no refresh token', async () => {
    volcano.accessToken = 'valid-access';
    volcano.refreshToken = null;

    const result = await volcano.auth.refreshSession();

    expect(result.session).toBeNull();
    expect(result.error?.message).toBe('No refresh token');
    expect(volcano.accessToken).toBe('valid-access');
  });

  it('should clear session on refresh failure', async () => {
    volcano.accessToken = sessionToken();
    volcano.refreshToken = 'expired-refresh';

    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Refresh token expired' }));

    const result = await volcano.auth.refreshSession();

    expect(result.session).toBeNull();
    expect(result.error?.message).toBe('Refresh token expired');
    expect(volcano.accessToken).toBeNull();
    expect(volcano.refreshToken).toBeNull();
  });
}

describe('VolcanoAuth session lifecycle', () => {
  describe('Authentication - refreshSession', () => {
    sharesRefreshRequests();
    discardsStaleRefreshes();
    preservesSessionsOnServerFailure();
    refreshesSessions();
    rejectsUnrefreshableSessions();
  });
});
