/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import {
  deferred,
  fetchBody,
  fetchPath,
  fetchUrl,
  reply,
  resultError,
  signal,
  within,
} from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const SESSION = '00000000-0000-4000-8000-000000000001';
const OTHER = '00000000-0000-4000-8000-000000000002';
const token = (id: string, version = 1): string =>
  `header.${Buffer.from(JSON.stringify({ session_id: id, version })).toString('base64url')}.signature`;
const renewed = () =>
  reply(200, {
    access_token: token(SESSION, 2),
    refresh_token: 'rotated',
    expires_in: 3600,
    user: { id: 'user', email: 'user@example.com', status: 'active' },
  });
const replacement = {
  access_token: token(OTHER),
  refresh_token: 'other-refresh',
  user: { id: 'other', email: 'other@example.com', status: 'active' },
} as const;

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

describe('captured-session revocation coordination', () => {
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

  it.each(['none', 'before-refresh-finishes', 'after-refresh-finishes'])(
    'retains an already-running refresh for revocation with replacement %s',
    async (replace) => {
      const current = client();
      const entered = signal();
      const response = deferred<Response>();
      const deleting = signal();
      const deletion = deferred<Response>();
      fetchMock.mockImplementation((url) => {
        if (fetchUrl(url).endsWith('/auth/refresh')) {
          entered.resolve();
          return response.promise;
        }
        deleting.resolve();
        return deletion.promise;
      });
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
      expect(outcome.error?.constructor ?? null).toBe(
        replace === 'none' ? null : AuthSessionChangedError,
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchBody(1))).toEqual({ refresh_token: 'rotated' });
      expect(current.accessToken).toBe(replace === 'none' ? null : replacement.access_token);
    },
  );

  it.each([401, 403, 429, 503])(
    'surfaces a shared refresh rejection %s without inventing replacement',
    async (status) => {
      const current = client();
      const entered = signal();
      const response = deferred<Response>();
      fetchMock.mockImplementation((url) => {
        if (fetchUrl(url).endsWith('/auth/refresh')) {
          entered.resolve();
          return response.promise;
        }
        return Promise.resolve(reply(401, { error: 'expired access' }));
      });
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
});

it('revokes a server-issued pair without requiring an access-token refresh', async () => {
  const current = client();
  fetchMock.mockImplementation((url) => {
    if (fetchUrl(url).endsWith('/auth/signin')) {
      return Promise.resolve(renewed());
    }
    if (fetchUrl(url).endsWith('/auth/logout')) {
      return Promise.resolve(reply(204));
    }
    if (fetchUrl(url).endsWith('/auth/refresh')) {
      return Promise.resolve(reply(429, { error: 'rate limited' }));
    }
    return Promise.resolve(reply(401, { error: 'expired' }));
  });
  await current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
  expect(await resultError(current.auth.signOut())).toBeNull();
  expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual([
    '/auth/signin',
    '/auth/logout',
  ]);
});

it('does not use pair provenance after credentials are explicitly replaced or changed', async () => {
  for (const adopt of [false, true]) {
    const current = client();
    fetchMock.mockReset();
    fetchMock.mockImplementation((url) =>
      fetchUrl(url).endsWith('/auth/signin')
        ? Promise.resolve(renewed())
        : Promise.resolve(reply(204)),
    );
    await current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
    if (adopt) {
      await current.auth.setSession({ ...replacement, refresh_token: 'rotated' });
    } else {
      current.accessToken = token(OTHER);
    }
    expect(await resultError(current.auth.signOut())).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual([
      '/auth/signin',
      `/auth/user/sessions/${OTHER}`,
    ]);
  }
});

it.each([false, true])(
  'revokes a verified pair after refresh throttling, joined: %s',
  async (joined) => {
    const current = client();
    const entered = signal();
    const response = deferred<Response>();
    fetchMock.mockImplementation((url) => {
      if (fetchUrl(url).endsWith('/auth/signin')) {
        return Promise.resolve(renewed());
      }
      if (fetchUrl(url).endsWith('/auth/refresh')) {
        entered.resolve();
        return response.promise;
      }
      return Promise.resolve(reply(fetchUrl(url).endsWith('/auth/logout') ? 204 : 401));
    });
    await current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
    const refreshing = current.auth.refreshSession();
    await within(entered.promise, 'revocation request start');
    const pendingLogout = joined ? current.auth.signOut() : null;
    await Promise.resolve();
    response.resolve(reply(429, { error: 'throttled' }));
    await within(refreshing, 'session refresh');
    expect(await resultError(pendingLogout ?? current.auth.signOut())).toBeNull();
    expect(fetchMock.mock.calls.map(([url]) => fetchPath(url))).toEqual([
      '/auth/signin',
      '/auth/refresh',
      '/auth/logout',
    ]);
  },
);

it.each([204, 503])('forgets captured revocation credentials after status %s', async (status) => {
  const current = client();
  fetchMock.mockImplementation((url) =>
    Promise.resolve(fetchUrl(url).endsWith('/auth/signin') ? renewed() : reply(status)),
  );
  await current.auth.signIn({ email: 'user@example.com', password: 'synthetic' });
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
  if (pending === undefined) {
    throw new Error('Expected a second sign-out');
  }
  expect(await pending).toEqual(first);
  expect(await resultError(current.auth.signOut())).toBeNull();
});

it.each([false, true])(
  'drops retained credentials after deleting the current session, failure: %s',
  async (fails) => {
    const current = client();
    fetchMock.mockImplementation((url) => {
      if (fetchUrl(url).endsWith('/auth/signin') || fetchUrl(url).endsWith('/auth/refresh')) {
        return Promise.resolve(renewed());
      }
      if (fails) {
        return Promise.reject(new Error('response lost'));
      }
      return Promise.resolve(reply(204));
    });
    await current.auth.signIn({ email: 'u@example.com', password: 'synthetic' });
    await current.auth.refreshSession();
    const owner = current._sessionOperations;
    const outcome = await current.auth.deleteSession(SESSION);
    expect(Boolean(outcome.error)).toBe(fails);
    expect(current.accessToken).toBeNull();
    expect(owner.verifiedPair).toBeNull();
    expect(owner.refreshing).toBeNull();
  },
);

it('does not retain credentials when refresh finishes after current-session deletion', async () => {
  const current = client();
  const entered = signal();
  const response = deferred<Response>();
  fetchMock.mockImplementation((url) => {
    if (fetchUrl(url).endsWith('/auth/refresh')) {
      entered.resolve();
      return response.promise;
    }
    return Promise.resolve(reply(204));
  });
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
