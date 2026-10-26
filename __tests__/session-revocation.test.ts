/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { deferred, fetchBody, fetchPath, reply, resultError, signal, within } from './auth-concurrency-fixtures.ts';
import { expectPresent } from './support/assertions.ts';
import { fetchRoutes } from './support/fetch-routes.ts';
import {
  OTHER,
  SESSION,
  renewed,
  replacement,
  signIn,
  signOutAfterRefreshSettles,
  signOutDuringRefresh,
  token,
} from './support/session-revocation-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

function client() {
  return new VolcanoAuth({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: token(SESSION),
    refreshToken: 'original',
  });
}

async function replaceAtPhase(current: VolcanoAuth, replace: string, phase: string): Promise<void> {
  if (replace === phase) {
    await current.auth.setSession(replacement);
  }
}

function preventsRefreshAfterSignOutClaims(): void {
  it('prevents a new refresh after sign-out claims the session', async () => {
    const current = client();
    const entered = signal();
    const response = deferred<Response>();
    fetchMock.mockImplementation(() => {
      entered.resolve();
      return response.promise;
    });
    const signingOut = current.auth.signOut();
    await within(entered.promise, 'revocation request start');
    const refreshing = await current.auth.refreshSession();
    response.resolve(reply(204));
    expect(refreshing.error).toBeInstanceOf(AuthRefreshDiscardedError);
    expect(await resultError(signingOut)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(current.accessToken).toBeNull();
  });
}

function retainsARunningRefreshForRevocation(): void {
  it.each([
    ['none', undefined, null],
    ['before-refresh-finishes', AuthSessionChangedError, replacement.access_token],
    ['after-refresh-finishes', AuthSessionChangedError, replacement.access_token],
  ] as const)(
    'retains an already-running refresh for revocation with replacement %s',
    async (replace, errorType, accessToken) => {
      const current = client();
      const entered = signal();
      const response = deferred<Response>();
      const deleting = signal();
      const deletion = deferred<Response>();
      fetchMock.mockImplementation(
        fetchRoutes({
          '/auth/refresh': () => {
            entered.resolve();
            return response.promise;
          },
          '/auth/logout': () => {
            deleting.resolve();
            return deletion.promise;
          },
        }),
      );
      const refreshing = current.auth.refreshSession();
      await within(entered.promise, 'revocation request start');
      const signingOut = current.auth.signOut();
      // Let sign-out capture ownership before replacing the public session.
      await Promise.resolve();
      await replaceAtPhase(current, replace, 'before-refresh-finishes');
      response.resolve(renewed());
      await within(refreshing, 'session refresh');
      await within(deleting.promise, 'session deletion start');
      await replaceAtPhase(current, replace, 'after-refresh-finishes');
      deletion.resolve(reply(204));
      const outcome = await signingOut;
      expect(outcome.error?.constructor).toBe(errorType);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchBody(1))).toEqual({ refresh_token: 'rotated' });
      expect(current.accessToken).toBe(accessToken);
    },
  );
}

function sharesConcurrentRevocationOutcomes(): void {
  it.each([401, 403, 429, 503])(
    'surfaces a shared refresh rejection %s without inventing replacement',
    async (status) => {
      const current = client();
      const entered = signal();
      const response = deferred<Response>();
      fetchMock.mockImplementation(
        fetchRoutes({
          '/auth/refresh': () => {
            entered.resolve();
            return response.promise;
          },
          [`/auth/user/sessions/${SESSION}`]: () => Promise.resolve(reply(401, { error: 'expired access' })),
        }),
      );
      const refreshing = current.auth.refreshSession();
      await within(entered.promise, 'revocation request start');
      const signingOut = current.auth.signOut();
      await Promise.resolve();
      response.resolve(reply(status, { error: 'refresh rejected' }));
      await within(refreshing, 'session refresh');
      const outcome = await signingOut;
      expect(outcome.error).not.toBeInstanceOf(AuthSessionChangedError);
      expect(outcome.error?.message).toBe('refresh rejected');
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(current.accessToken).toBeNull();
    },
  );

  it('shares concurrent sign-out instead of revoking twice', async () => {
    const current = client();
    const entered = signal();
    const response = deferred<Response>();
    fetchMock.mockImplementation(() => {
      entered.resolve();
      return response.promise;
    });
    const first = current.auth.signOut();
    await within(entered.promise, 'revocation request start');
    const second = current.auth.signOut();
    response.resolve(reply(204));
    expect(await Promise.all([first, second])).toEqual([{ error: null }, { error: null }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
}

describe('captured-session revocation coordination', () => {
  preventsRefreshAfterSignOutClaims();
  retainsARunningRefreshForRevocation();
  sharesConcurrentRevocationOutcomes();
});

it('revokes a server-issued pair without requiring an access-token refresh', async () => {
  const current = client();
  fetchMock.mockImplementation(
    fetchRoutes({
      '/auth/signin': () => Promise.resolve(renewed()),
      '/auth/logout': () => Promise.resolve(reply(204)),
      '/auth/refresh': () => Promise.resolve(reply(429, { error: 'rate limited' })),
      [`/auth/user/sessions/${SESSION}`]: () => Promise.resolve(reply(401, { error: 'expired' })),
    }),
  );
  await signIn(current);
  expect(await resultError(current.auth.signOut())).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual(['/auth/signin', '/auth/logout']);
});

it('does not use pair provenance after credentials are explicitly replaced or changed', async () => {
  fetchMock.mockImplementation(
    fetchRoutes({
      '/auth/signin': () => Promise.resolve(renewed()),
      [`/auth/user/sessions/${OTHER}`]: () => Promise.resolve(reply(204)),
    }),
  );
  const changed = client();
  await signIn(changed);
  changed.accessToken = token(OTHER);
  expect(await resultError(changed.auth.signOut())).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual(['/auth/signin', `/auth/user/sessions/${OTHER}`]);

  fetchMock.mockClear();
  const adopted = client();
  await signIn(adopted);
  await adopted.auth.setSession({ ...replacement, refresh_token: 'rotated' });
  expect(await resultError(adopted.auth.signOut())).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual(['/auth/signin', `/auth/user/sessions/${OTHER}`]);
});

it.each([
  [false, signOutAfterRefreshSettles],
  [true, signOutDuringRefresh],
])('revokes a verified pair after refresh throttling, joined: %s', async (_joined, signOutAround) => {
  const current = client();
  const entered = signal();
  const response = deferred<Response>();
  fetchMock.mockImplementation(
    fetchRoutes({
      '/auth/signin': () => Promise.resolve(renewed()),
      '/auth/refresh': () => {
        entered.resolve();
        return response.promise;
      },
      '/auth/logout': () => Promise.resolve(reply(204)),
      [`/auth/user/sessions/${SESSION}`]: () => Promise.resolve(reply(401)),
    }),
  );
  await signIn(current);
  const refreshing = current.auth.refreshSession();
  await within(entered.promise, 'revocation request start');
  const signingOut = signOutAround(current, async () => {
    await Promise.resolve();
    response.resolve(reply(429, { error: 'throttled' }));
    await within(refreshing, 'session refresh');
  });
  expect(await resultError(signingOut)).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual([
    '/auth/signin',
    '/auth/refresh',
    '/auth/logout',
  ]);
});

it.each([204, 503])('forgets captured revocation credentials after status %s', async (status) => {
  const current = client();
  fetchMock.mockImplementation(
    fetchRoutes({
      '/auth/signin': () => Promise.resolve(renewed()),
      '/auth/logout': () => Promise.resolve(reply(status)),
    }),
  );
  await signIn(current);
  const owner = current._sessionOperations;
  await current.auth.signOut();
  expect(owner.verifiedPair).toBeNull();
  expect(owner.refreshing).toBeNull();
});

it('shares a pending sign-out failure after its local session is cleared', async () => {
  const current = client();
  fetchMock.mockImplementation(() => Promise.resolve(reply(503, { error: 'unavailable' })));
  const clear = current._clearSessionAtGeneration.bind(current);
  const second: ReturnType<typeof current.auth.signOut>[] = [];
  jest.spyOn(current, '_clearSessionAtGeneration').mockImplementation((generation) => {
    const cleared = clear(generation);
    second.push(current.auth.signOut());
    return cleared;
  });
  const first = await current.auth.signOut();
  expect(first.error?.message).toBe('unavailable');
  const pending = second[0];
  expectPresent(pending);
  expect(await pending).toEqual(first);
  expect(await resultError(current.auth.signOut())).toBeNull();
});

it.each([
  [false, () => Promise.resolve(reply(204))],
  [true, () => Promise.reject(new Error('response lost'))],
])('drops retained credentials after deleting the current session, failure: %s', async (fails, deletion) => {
  const current = client();
  fetchMock.mockImplementation(
    fetchRoutes({
      '/auth/signin': () => Promise.resolve(renewed()),
      '/auth/refresh': () => Promise.resolve(renewed()),
      [`/auth/user/sessions/${SESSION}`]: deletion,
    }),
  );
  await current.auth.signIn({ email: 'u@example.com', password: 'synthetic' });
  await current.auth.refreshSession();
  const owner = current._sessionOperations;
  const outcome = await current.auth.deleteSession(SESSION);
  expect(Boolean(outcome.error)).toBe(fails);
  expect(current.accessToken).toBeNull();
  expect(owner.verifiedPair).toBeNull();
  expect(owner.refreshing).toBeNull();
});

it('does not retain credentials when refresh finishes after current-session deletion', async () => {
  const current = client();
  const entered = signal();
  const response = deferred<Response>();
  fetchMock.mockImplementation(
    fetchRoutes({
      '/auth/refresh': () => {
        entered.resolve();
        return response.promise;
      },
      [`/auth/user/sessions/${SESSION}`]: () => Promise.resolve(reply(204)),
    }),
  );
  const owner = current._sessionOperations;
  const refreshing = current.auth.refreshSession();
  await within(entered.promise, 'revocation request start');
  expect(await resultError(current.auth.deleteSession(SESSION))).toBeNull();
  response.resolve(renewed());
  await within(refreshing, 'session refresh');
  expect(current.accessToken).toBeNull();
  expect(owner.verifiedPair).toBeNull();
  expect(owner.refreshing).toBeNull();
});
