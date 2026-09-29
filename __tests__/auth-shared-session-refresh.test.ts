/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import {
  deferred,
  fetchBody,
  fetchCall,
  reply,
  signal,
  within,
} from './auth-concurrency-fixtures.ts';

// Each client stands in for a browser tab: they share localStorage but not memory.
const fetchMock = jest.mocked(globalThis.fetch);
const saved = new Map(
  ['window', 'navigator'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);
const sessionId = '00000000-0000-4000-8000-000000000021';
const otherSessionId = '00000000-0000-4000-8000-000000000022';
const user = { id: 'user-1', email: 'fixture@example.com', status: 'active' } as const;

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function accessToken(
  version: number,
  expiresIn = 3600,
  session = sessionId,
  issuedWith = version,
): string {
  const now = Math.floor(Date.now() / 1000);
  // Later versions are later rotations, so by default they were issued later.
  const claims = {
    session_id: session,
    iat: now - 100 + issuedWith,
    exp: now + expiresIn,
    version,
  };
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

function store(access: string, refresh: string | null): void {
  localStorage.setItem(
    'volcano_access_token',
    JSON.stringify({ access_token: access, refresh_token: refresh }),
  );
}

function stored(): unknown {
  const value = localStorage.getItem('volcano_access_token');
  return value === null ? null : JSON.parse(value);
}

function tab(): VolcanoAuth {
  return new VolcanoAuth({ apiUrl: 'https://api.test', anonKey: 'anon' });
}

function loadedTab(): VolcanoAuth {
  const client = tab();
  // Stands in for a profile the tab already loaded with getUser().
  client.currentUser = user;
  return client;
}

function rotation(access: string, refresh: string): Response {
  return reply(200, { access_token: access, refresh_token: refresh, expires_in: 3600, user });
}

function rejection(): Response {
  return reply(401, { error: 'invalid or expired refresh token' });
}

function installWebLocks(): string[] {
  const names: string[] = [];
  let held: Promise<unknown> = Promise.resolve();
  const request = (name: string, _options: LockOptions, callback: LockGrantedCallback<unknown>) => {
    names.push(name);
    const granted = held.then(() => callback(null));
    held = Promise.allSettled([granted]);
    return granted;
  };
  setGlobal('navigator', { locks: { request } });
  return names;
}

function inPageOnly(): string[] {
  return [];
}

beforeEach(() => {
  setGlobal('window', { document: {}, localStorage });
  setGlobal('navigator', {});
});

afterEach(() => {
  jest.restoreAllMocks();
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

describe.each([
  ['Web Locks', installWebLocks],
  ['one page', inPageOnly],
])('concurrent refreshes coordinated by %s', (_label, install) => {
  it('spend the shared refresh token once', async () => {
    const lockNames = install();
    store(accessToken(1, -60), 'refresh-1');
    const first = loadedTab();
    const second = loadedTab();
    const response = deferred<Response>();
    const requested = signal();
    const rotated = accessToken(2);
    fetchMock.mockImplementationOnce(() => {
      requested.resolve();
      return response.promise;
    });

    const refreshing = [first.auth.refreshSession(), second.auth.refreshSession()];
    await within(requested.promise, 'first refresh request');
    response.resolve(rotation(rotated, 'refresh-2'));
    const results = await within(Promise.all(refreshing), 'shared refresh');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map(({ session, error }) => [session?.refresh_token, error])).toEqual([
      ['refresh-2', null],
      ['refresh-2', null],
    ]);
    expect([second.accessToken, second.refreshToken]).toEqual([rotated, 'refresh-2']);
    expect(stored()).toEqual({ access_token: rotated, refresh_token: 'refresh-2' });
    expect(lockNames.every((name) => name === 'volcano-sdk:auth-session')).toBe(true);
  });
});

it('restores a session stored by an earlier release', async () => {
  const legacy = accessToken(1, -60);
  localStorage.setItem('volcano_access_token', legacy);
  localStorage.setItem('volcano_refresh_token', 'refresh-1');
  const current = tab();
  const renewed = accessToken(2);
  fetchMock.mockResolvedValueOnce(rotation(renewed, 'refresh-2'));

  expect([current.accessToken, current.refreshToken]).toEqual([legacy, 'refresh-1']);
  await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
  expect(stored()).toEqual({ access_token: renewed, refresh_token: 'refresh-2' });
  expect(localStorage.getItem('volcano_refresh_token')).toBeNull();
});

it('pairs a refresh token an earlier release stores after its access token', async () => {
  const legacy = accessToken(1, -60);
  localStorage.setItem('volcano_access_token', legacy);
  // This tab reads between the earlier release's two writes.
  tab();
  localStorage.setItem('volcano_refresh_token', 'refresh-1');
  const current = tab();
  fetchMock.mockResolvedValueOnce(rotation(accessToken(2), 'refresh-2'));

  expect([current.accessToken, current.refreshToken]).toEqual([legacy, 'refresh-1']);

  await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
  expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-1' });
});

it('ends the stored session when an application removes the earlier keys', async () => {
  const signedIn = tab();
  await signedIn.auth.setSession({
    access_token: accessToken(1),
    refresh_token: 'refresh-1',
    user,
  });
  localStorage.removeItem('volcano_access_token');
  localStorage.removeItem('volcano_refresh_token');

  const next = tab();
  expect([next.accessToken, next.refreshToken]).toEqual([null, null]);
});

describe('a stored rotation of this session', () => {
  it('is adopted without a request by a tab that loaded its user', async () => {
    store(accessToken(1), 'refresh-1');
    const current = loadedTab();
    const callback = jest.fn();
    current.auth.onAuthStateChange(callback);
    const rotated = accessToken(2);
    store(rotated, 'refresh-2');

    const { session, error } = await current.auth.refreshSession();
    expect(error).toBeNull();
    expect(session).toEqual({
      access_token: rotated,
      refresh_token: 'refresh-2',
      expires_in: expect.any(Number),
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect([current.accessToken, current.refreshToken]).toEqual([rotated, 'refresh-2']);
    expect(current.auth.user()).toEqual(user);
    expect(callback).toHaveBeenLastCalledWith(user);
    expect(stored()).toEqual({ access_token: rotated, refresh_token: 'refresh-2' });
  });

  it.each([
    [30, 1],
    [31, 0],
  ])('with %i seconds left makes %i refresh requests', async (lifetime, requests) => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    store(accessToken(1), 'refresh-1');
    const current = loadedTab();
    store(accessToken(2, lifetime), 'refresh-2');
    fetchMock.mockResolvedValueOnce(rotation(accessToken(3), 'refresh-3'));

    const { session, error } = await current.auth.refreshSession();
    expect(error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(requests);
    expect(session?.expires_in).toBe(requests === 0 ? lifetime : 3600);
  });

  it('is refreshed by a tab that has not loaded its user', async () => {
    store(accessToken(1), 'refresh-1');
    const current = tab();
    store(accessToken(2), 'refresh-2');
    const renewed = accessToken(3);
    fetchMock.mockResolvedValueOnce(rotation(renewed, 'refresh-3'));

    const { session, error } = await current.auth.refreshSession();
    expect([session?.refresh_token, error]).toEqual(['refresh-3', null]);
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-2' });
    expect(current.auth.user()).toEqual(user);
    expect(stored()).toEqual({ access_token: renewed, refresh_token: 'refresh-3' });
  });

  it('is refreshed when its access token has expired', async () => {
    store(accessToken(1, -7200), 'refresh-1');
    const current = loadedTab();
    store(accessToken(2, -60), 'refresh-2');
    const renewed = accessToken(3);
    fetchMock.mockResolvedValueOnce(rotation(renewed, 'refresh-3'));

    const { error } = await current.auth.refreshSession();
    expect(error).toBeNull();
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-2' });
    expect(stored()).toEqual({ access_token: renewed, refresh_token: 'refresh-3' });
  });

  it('replaces the access token of a rejected request', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = loadedTab();
    const rotated = accessToken(2);
    store(rotated, 'refresh-2');
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: 'expired' }))
      .mockResolvedValueOnce(reply(200, { user }));

    await expect(current.auth.getUser()).resolves.toEqual({ user, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchCall(1)[1]?.headers).toMatchObject({ Authorization: `Bearer ${rotated}` });
  });

  it('is revoked on sign-out and removed', async () => {
    installWebLocks();
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    const rotated = accessToken(2);
    store(rotated, 'refresh-2');
    fetchMock.mockResolvedValueOnce(reply(204));

    await expect(current.auth.signOut()).resolves.toEqual({ error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchCall(0)[0]).toBe(`https://api.test/auth/user/sessions/${sessionId}`);
    expect(fetchCall(0)[1]?.headers).toMatchObject({ Authorization: `Bearer ${rotated}` });
    expect(stored()).toBeNull();
  });
});

describe('a refresh that spent the stored token', () => {
  it('stores its rotation for a sign-out that starts during the request', async () => {
    installWebLocks();
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    const response = deferred<Response>();
    const requested = signal();
    fetchMock
      .mockImplementationOnce(() => {
        requested.resolve();
        return response.promise;
      })
      .mockResolvedValueOnce(reply(204));

    const refreshing = current.auth.refreshSession();
    await within(requested.promise, 'refresh request');
    const signingOut = current.auth.signOut();
    response.resolve(rotation(accessToken(2), 'refresh-2'));

    await expect(within(signingOut, 'sign-out')).resolves.toEqual({ error: null });
    const { error } = await refreshing;
    expect(error?.name).toBe('AuthRefreshDiscardedError');
    expect(fetchCall(1)[0]).toBe('https://api.test/auth/logout');
    expect(JSON.parse(fetchBody(1))).toEqual({ refresh_token: 'refresh-2' });
    expect(stored()).toBeNull();
  });

  it('stores its rotation after this tab adopts another session in memory', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    const response = deferred<Response>();
    const requested = signal();
    fetchMock.mockImplementationOnce(() => {
      requested.resolve();
      return response.promise;
    });

    const refreshing = current.auth.refreshSession();
    await within(requested.promise, 'refresh request');
    await current.auth.setSession({
      access_token: accessToken(1, 3600, otherSessionId),
      refresh_token: 'other-refresh',
      user,
    });
    const rotated = accessToken(2);
    response.resolve(rotation(rotated, 'refresh-2'));

    const { error } = await refreshing;
    expect(error?.name).toBe('AuthRefreshDiscardedError');
    expect(current.refreshToken).toBe('other-refresh');
    expect(stored()).toEqual({ access_token: rotated, refresh_token: 'refresh-2' });
  });
});

it.each([429, 503])('keeps the stored session after a refresh fails with %i', async (status) => {
  const own = accessToken(1, -60);
  store(own, 'refresh-1');
  const current = tab();
  fetchMock.mockResolvedValueOnce(reply(status, { error: 'try again' }));

  await expect(current.auth.refreshSession()).resolves.toMatchObject({ session: null });
  expect(current.refreshToken).toBe('refresh-1');
  expect(stored()).toEqual({ access_token: own, refresh_token: 'refresh-1' });
});

it('does not store a session again after another tab removed it', async () => {
  store(accessToken(1, -60), 'refresh-1');
  const current = tab();
  localStorage.removeItem('volcano_access_token');
  fetchMock.mockResolvedValueOnce(rotation(accessToken(2), 'refresh-2'));

  await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
  expect(current.refreshToken).toBe('refresh-2');
  expect(stored()).toBeNull();
});

it('does not restore a session another tab removed during the refresh', async () => {
  store(accessToken(1, -60), 'refresh-1');
  const current = tab();
  fetchMock.mockImplementationOnce(() => {
    localStorage.removeItem('volcano_access_token');
    return Promise.resolve(rotation(accessToken(2), 'refresh-2'));
  });

  await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
  expect(current.refreshToken).toBe('refresh-2');
  expect(stored()).toBeNull();
});

it('refreshes a fresh access token of its own with the server', async () => {
  store(accessToken(1), 'refresh-1');
  const current = loadedTab();
  fetchMock.mockResolvedValueOnce(rotation(accessToken(2), 'refresh-2'));

  await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
  expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-1' });
});

describe('another sign-in in storage', () => {
  const otherSignIn = accessToken(1, 3600, otherSessionId);

  it('is not adopted or replaced by a refresh of this session', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = loadedTab();
    store(otherSignIn, 'other-refresh');
    const renewed = accessToken(2);
    fetchMock.mockResolvedValueOnce(rotation(renewed, 'refresh-2'));

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-1' });
    expect([current.accessToken, current.refreshToken]).toEqual([renewed, 'refresh-2']);
    expect(stored()).toEqual({ access_token: otherSignIn, refresh_token: 'other-refresh' });
  });

  it('without a refresh token is not replaced by a refresh of this session', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    store(otherSignIn, null);
    fetchMock.mockResolvedValueOnce(rotation(accessToken(2), 'refresh-2'));

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(current.refreshToken).toBe('refresh-2');
    expect(stored()).toEqual({ access_token: otherSignIn, refresh_token: null });
  });

  it('is not replaced by a refresh that completes after it was stored', async () => {
    installWebLocks();
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    fetchMock.mockImplementationOnce(() => {
      store(otherSignIn, 'other-refresh');
      return Promise.resolve(rotation(accessToken(2), 'refresh-2'));
    });

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(current.refreshToken).toBe('refresh-2');
    expect(stored()).toEqual({ access_token: otherSignIn, refresh_token: 'other-refresh' });
  });

  it('is kept when this session is rejected', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    const callback = jest.fn();
    current.auth.onAuthStateChange(callback);
    fetchMock.mockImplementationOnce(() => {
      store(otherSignIn, 'other-refresh');
      return Promise.resolve(rejection());
    });

    const { error } = await current.auth.refreshSession();
    expect(error?.message).toBe('invalid or expired refresh token');
    expect([current.accessToken, current.refreshToken]).toEqual([null, null]);
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(stored()).toEqual({ access_token: otherSignIn, refresh_token: 'other-refresh' });
  });

  it('is neither used nor removed by a sign-out of this session', async () => {
    installWebLocks();
    const own = accessToken(1, -60);
    store(own, 'refresh-1');
    const current = tab();
    store(otherSignIn, 'other-refresh');
    fetchMock.mockResolvedValueOnce(reply(204));

    await expect(current.auth.signOut()).resolves.toEqual({ error: null });
    expect(fetchCall(0)[1]?.headers).toMatchObject({ Authorization: `Bearer ${own}` });
    expect(stored()).toEqual({ access_token: otherSignIn, refresh_token: 'other-refresh' });
  });

  it("is used when it was issued in the same second as this tab's token", async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
    store(accessToken(1), 'refresh-1');
    const current = loadedTab();
    const rotated = accessToken(2, 3600, sessionId, 1);
    store(rotated, 'refresh-2');

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect([current.accessToken, current.refreshToken]).toEqual([rotated, 'refresh-2']);
  });

  it("is refreshed when it holds this tab's access token with a later refresh token", async () => {
    const own = accessToken(1);
    store(own, 'refresh-1');
    const current = loadedTab();
    store(own, 'refresh-1b');
    fetchMock.mockResolvedValueOnce(rotation(accessToken(2), 'refresh-2'));

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-1b' });
  });

  it.each([
    ['later', 2],
    ['in the same second', 1],
  ])(
    'is not preferred over credentials supplied to the client and issued %s',
    async (_label, issuedWith) => {
      jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
      const earlier = accessToken(1);
      store(earlier, 'refresh-1');
      const current = new VolcanoAuth({
        apiUrl: 'https://api.test',
        anonKey: 'anon',
        accessToken: accessToken(2, 3600, sessionId, issuedWith),
        refreshToken: 'refresh-2',
      });
      current.currentUser = user;
      fetchMock.mockResolvedValueOnce(rotation(accessToken(3), 'refresh-3'));

      await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
      expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-2' });
      expect(current.refreshToken).toBe('refresh-3');
      expect(stored()).toEqual({ access_token: earlier, refresh_token: 'refresh-1' });
    },
  );

  it('is used by a client with supplied credentials when issued later', async () => {
    const current = new VolcanoAuth({
      apiUrl: 'https://api.test',
      anonKey: 'anon',
      accessToken: accessToken(1, -60),
      refreshToken: 'refresh-1',
    });
    store(accessToken(2, -60), 'refresh-2');
    fetchMock.mockResolvedValueOnce(rotation(accessToken(3), 'refresh-3'));

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-2' });
  });

  it('is used by a client with supplied credentials when it holds their access token', async () => {
    const own = accessToken(1, -60);
    const current = new VolcanoAuth({
      apiUrl: 'https://api.test',
      anonKey: 'anon',
      accessToken: own,
      refreshToken: 'refresh-1',
    });
    store(own, 'refresh-1b');
    fetchMock.mockResolvedValueOnce(rotation(accessToken(2), 'refresh-2'));

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-1b' });
  });

  it('supplies the refresh token stored for this access token', async () => {
    const own = accessToken(1, -60);
    store(own, 'refresh-1');
    const current = tab();
    // An earlier release's refresh token, paired after this tab read storage.
    store(own, 'refresh-1b');
    const renewed = accessToken(2);
    fetchMock.mockResolvedValueOnce(rotation(renewed, 'refresh-2'));

    await expect(current.auth.refreshSession()).resolves.toMatchObject({ error: null });
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-1b' });
    expect(stored()).toEqual({ access_token: renewed, refresh_token: 'refresh-2' });
  });

  it('is kept when a client with supplied credentials signs out', async () => {
    store(otherSignIn, 'other-refresh');
    const own = accessToken(1);
    const current = new VolcanoAuth({
      apiUrl: 'https://api.test',
      anonKey: 'anon',
      accessToken: own,
      refreshToken: 'refresh-1',
    });
    fetchMock.mockResolvedValueOnce(reply(204));

    await expect(current.auth.signOut()).resolves.toEqual({ error: null });
    expect(stored()).toEqual({ access_token: otherSignIn, refresh_token: 'other-refresh' });
  });
});

it('keeps the stored session after signing out of one adopted in memory', async () => {
  const own = accessToken(1);
  store(own, 'refresh-1');
  const current = tab();
  await current.auth.setSession({
    access_token: accessToken(1, 3600, otherSessionId),
    refresh_token: 'other-refresh',
    user,
  });
  fetchMock.mockResolvedValueOnce(reply(204));

  await expect(current.auth.signOut()).resolves.toEqual({ error: null });
  expect(stored()).toEqual({ access_token: own, refresh_token: 'refresh-1' });
});

describe.each([
  ['Web Locks', installWebLocks],
  ['one page', inPageOnly],
])('a rejected refresh coordinated by %s', (_label, install) => {
  it('removes the stored session that holds the rejected token', async () => {
    install();
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    fetchMock.mockResolvedValueOnce(rejection());

    const { error } = await current.auth.refreshSession();
    expect(error?.message).toBe('invalid or expired refresh token');
    expect(current.accessToken).toBeNull();
    expect(stored()).toBeNull();
  });

  it('removes a stored rotation that is rejected', async () => {
    install();
    store(accessToken(1, -7200), 'refresh-1');
    const current = tab();
    store(accessToken(2, -60), 'refresh-2');
    fetchMock.mockResolvedValueOnce(rejection());

    await current.auth.refreshSession();
    expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-2' });
    expect(current.accessToken).toBeNull();
    expect(stored()).toBeNull();
  });
});
