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
const user = { id: 'user-1', email: 'fixture@example.com', status: 'active' } as const;

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

function accessToken(version: number, expiresIn = 3600, session = sessionId): string {
  const claims = { session_id: session, exp: Math.floor(Date.now() / 1000) + expiresIn, version };
  return `header.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.signature`;
}

function store(access: string, refresh: string): void {
  localStorage.setItem('volcano_access_token', access);
  localStorage.setItem('volcano_refresh_token', refresh);
}

function stored(): [string | null, string | null] {
  return [
    localStorage.getItem('volcano_access_token'),
    localStorage.getItem('volcano_refresh_token'),
  ];
}

function tab(): VolcanoAuth {
  return new VolcanoAuth({ apiUrl: 'https://api.test', anonKey: 'anon' });
}

function rotation(access: string, refresh: string): Response {
  return reply(200, { access_token: access, refresh_token: refresh, expires_in: 3600, user });
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

beforeEach(() => {
  setGlobal('window', { document: {}, localStorage });
  setGlobal('navigator', {});
});

afterEach(() => {
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
  ['one page', () => []],
])('concurrent refreshes coordinated by %s', (_label, install) => {
  it('spend the shared refresh token once', async () => {
    const lockNames = install();
    store(accessToken(1, -60), 'refresh-1');
    const first = tab();
    const second = tab();
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
    expect(stored()).toEqual([rotated, 'refresh-2']);
    expect(lockNames.every((name) => name === 'volcano-sdk:refresh-token')).toBe(true);
  });
});

it('adopts a session another tab already rotated without a request', async () => {
  store(accessToken(1), 'refresh-1');
  const current = tab();
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
});

it('refreshes with the stored rotation when its access token has expired', async () => {
  store(accessToken(1, -7200), 'refresh-1');
  const current = tab();
  store(accessToken(2, -60), 'refresh-2');
  const renewed = accessToken(3);
  fetchMock.mockResolvedValueOnce(rotation(renewed, 'refresh-3'));

  const { error } = await current.auth.refreshSession();
  expect(error).toBeNull();
  expect(JSON.parse(fetchBody(0))).toEqual({ refresh_token: 'refresh-2' });
  expect(stored()).toEqual([renewed, 'refresh-3']);
});

it('retries a rejected request with the access token another tab refreshed', async () => {
  store(accessToken(1, -60), 'refresh-1');
  const current = tab();
  const rotated = accessToken(2);
  store(rotated, 'refresh-2');
  fetchMock
    .mockResolvedValueOnce(reply(401, { error: 'expired' }))
    .mockResolvedValueOnce(reply(200, { user }));

  await expect(current.auth.getUser()).resolves.toEqual({ user, error: null });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchCall(1)[1]?.headers).toMatchObject({ Authorization: `Bearer ${rotated}` });
});

describe('a rejected refresh', () => {
  it('adopts a rotation another tab stored during the request', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    const rotated = accessToken(2);
    fetchMock.mockImplementationOnce(() => {
      store(rotated, 'refresh-2');
      return Promise.resolve(reply(401, { error: 'invalid or expired refresh token' }));
    });

    const { session, error } = await current.auth.refreshSession();
    expect(error).toBeNull();
    expect(session?.refresh_token).toBe('refresh-2');
    expect([current.accessToken, current.refreshToken]).toEqual([rotated, 'refresh-2']);
    expect(stored()).toEqual([rotated, 'refresh-2']);
  });

  it('signs this tab out without removing another sign-in', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    const callback = jest.fn();
    current.auth.onAuthStateChange(callback);
    const otherSignIn = accessToken(1, 3600, '00000000-0000-4000-8000-000000000022');
    fetchMock.mockImplementationOnce(() => {
      store(otherSignIn, 'other-refresh');
      return Promise.resolve(reply(401, { error: 'invalid or expired refresh token' }));
    });

    const { error } = await current.auth.refreshSession();
    expect(error?.message).toBe('invalid or expired refresh token');
    expect([current.accessToken, current.refreshToken]).toEqual([null, null]);
    expect(callback).toHaveBeenLastCalledWith(null);
    expect(stored()).toEqual([otherSignIn, 'other-refresh']);
  });

  it('removes stored credentials that still hold the rejected token', async () => {
    store(accessToken(1, -60), 'refresh-1');
    const current = tab();
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'invalid or expired refresh token' }));

    const { error } = await current.auth.refreshSession();
    expect(error?.message).toBe('invalid or expired refresh token');
    expect(current.accessToken).toBeNull();
    expect(stored()).toEqual([null, null]);
  });
});
