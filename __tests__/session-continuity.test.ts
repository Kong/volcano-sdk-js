/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import {
  deferred,
  fetchBody,
  fetchCall,
  fetchPath,
  jsonField,
  reply,
  resultError,
  signal,
} from './auth-concurrency-fixtures.ts';
import { fetchRoutes } from './support/fetch-routes.ts';

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

async function validateProfile(current: VolcanoAuth): Promise<void> {
  fetchMock.mockResolvedValueOnce(
    reply(200, { user: { id: 'user-a', email: 'fixture@example.com', status: 'active' } }),
  );
  await current.auth.getUser();
}

function skipProfileValidation(): Promise<void> {
  return Promise.resolve();
}

async function adoptReplacementSession(current: VolcanoAuth): Promise<void> {
  await current.auth.setSession({
    access_token: 'replacement',
    refresh_token: 'replacement-refresh',
    user: { id: 'other', email: 'fixture@example.com', status: 'active' },
  });
}

function keepCurrentSession(): Promise<void> {
  return Promise.resolve();
}

function refreshFinishesFirst(finishRefresh: () => Promise<void>): Promise<void> {
  return finishRefresh();
}

function refreshStillPending(): Promise<void> {
  return Promise.resolve();
}

function rejectsUnprovenSessionRefreshes(): void {
  it.each([
    ['user-a', false, skipProfileValidation, 2],
    ['user-b', false, skipProfileValidation, 2],
    ['user-a', true, validateProfile, 3],
    ['user-b', true, validateProfile, 3],
  ] as const)(
    'rejects a different session for %s, profile validated: %s',
    async (userId, _profileFirst, prepare, requests) => {
      const current = client();
      await prepare(current);
      fetchMock
        .mockResolvedValueOnce(reply(401, { error: 'expired' }))
        .mockResolvedValueOnce(refresh('00000000-0000-4000-8000-000000000002', userId));
      const outcome = await current.database('main').insert('items', { name: 'example' }).execute();
      expect(outcome.error).toBeTruthy();
      expect(fetchMock).toHaveBeenCalledTimes(requests);
      expect(current.accessToken).toBe(token('00000000-0000-4000-8000-000000000001'));
    },
  );

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
}

function renewsAccessForRevocation(): void {
  it.each([
    [false, keepCurrentSession, undefined, null],
    [true, adoptReplacementSession, AuthSessionChangedError, 'replacement'],
  ] as const)(
    'renews expired access for revocation, replacement: %s',
    async (_replace, duringRefresh, errorType, accessToken) => {
      const current = client();
      fetchMock
        .mockResolvedValueOnce(reply(401, { error: 'expired' }))
        .mockImplementationOnce(async () => {
          await duringRefresh(current);
          return refresh();
        })
        .mockResolvedValueOnce(reply(204));
      const result = await current.auth.signOut();
      expect(result.error?.constructor).toBe(errorType);
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
      expect(current.accessToken).toBe(accessToken);
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
}

function recoversExpiredAccessDuringSignOut(): void {
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
  it.each([
    [false, refreshStillPending],
    [true, refreshFinishesFirst],
  ])('shares a rotating refresh with sign-out, refresh finishes first: %s', async (_finishFirst, beforeExpiry) => {
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
    const finishRefresh = async () => {
      refreshResult.resolve(refresh());
      await refreshing;
    };
    await beforeExpiry(finishRefresh);
    firstDelete.resolve(reply(401, { error: 'expired' }));
    await Promise.resolve();
    await finishRefresh();
    expect(await resultError(signingOut)).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual([
      '/auth/user/sessions/00000000-0000-4000-8000-000000000001',
      '/auth/refresh',
      '/auth/user/sessions/00000000-0000-4000-8000-000000000001',
    ]);
    expect(current.accessToken).toBeNull();
  });
}

function fallsBackForMalformedSessionClaims(): void {
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
}

function sharesTheOldRefreshAcrossReplacement(): void {
  it('shares the old refresh while a replacement session also refreshes', async () => {
    const current = client();
    const oldRequested = signal();
    const newRequested = signal();
    const oldRefresh = deferred<Response>();
    const newRefresh = deferred<Response>();
    const refreshRoute = jest
      .fn<(options: RequestInit | undefined) => Promise<Response>>()
      .mockImplementationOnce(() => {
        oldRequested.resolve();
        return oldRefresh.promise;
      })
      .mockImplementationOnce(() => {
        newRequested.resolve();
        return newRefresh.promise;
      });
    fetchMock.mockImplementation(
      fetchRoutes({ '/auth/logout': () => Promise.resolve(reply(204)), '/auth/refresh': refreshRoute }),
    );
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
    expect(refreshRoute.mock.calls.map(([options]) => jsonField(options, 'refresh_token'))).toEqual([
      'refresh',
      'new-refresh',
    ]);
    expect(JSON.parse(fetchBody(2))).toEqual({ refresh_token: 'rotated' });
    expect(current.currentUser?.id).toBe('user-b');
  });
}

describe('server session continuity', () => {
  rejectsUnprovenSessionRefreshes();
  renewsAccessForRevocation();
  recoversExpiredAccessDuringSignOut();
  fallsBackForMalformedSessionClaims();
  sharesTheOldRefreshAcrossReplacement();
});

it.each([
  [false, skipProfileValidation, 0],
  [true, validateProfile, 1],
] as const)(
  'does not trust a supplied profile without a session ID, enriched: %s',
  async (_enriched, prepare, profileRequests) => {
    const current = client();
    fetchMock.mockResolvedValue(refresh());
    await current.auth.setSession({
      access_token: 'opaque',
      refresh_token: 'foreign-refresh',
      user: { id: 'user-a', email: 'fixture@example.com', status: 'active' },
    });
    await prepare(current);
    expect(fetchMock).toHaveBeenCalledTimes(profileRequests);
    fetchMock.mockClear();
    const outcome = await current.auth.refreshSession();
    expect(outcome.error?.message).toContain('session identifier');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(current.accessToken).toBe('opaque');
  },
);
