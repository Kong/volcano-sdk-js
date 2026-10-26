/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { deferred, fetchCall, reply, signal, within } from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
let volcano: VolcanoAuth;

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, localStorage },
  });
  volcano = new VolcanoAuth(config);
});

afterEach(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', previousWindow);
  }
});

function clearsLocalSessions(): void {
  it('succeeds without a session or network request', async () => {
    await expect(volcano.auth.signOut()).resolves.toEqual({ error: null });
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('clears the session and surfaces a revocation server failure', async () => {
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockResolvedValueOnce(reply(503, { error: 'Logout unavailable' }));

    const result = await volcano.auth.signOut();

    expect(result.error).toMatchObject({ message: 'Logout unavailable', status: 503 });
    await expect(volcano.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
  });

  it('should clear session on signout', async () => {
    volcano.accessToken = 'test-access-token';
    volcano.refreshToken = 'test-refresh';

    fetchMock.mockResolvedValueOnce(reply(200, {}));

    await volcano.auth.signOut();

    expect(volcano.accessToken).toBeNull();
    expect(volcano.refreshToken).toBeNull();
    expect(Reflect.get(localStorage, 'removeItem')).toHaveBeenCalledWith('volcano_access_token');
    expect(Reflect.get(localStorage, 'removeItem')).toHaveBeenCalledWith('volcano_refresh_token');
  });
}

function keepsReplacementSessions(): void {
  it('does not clear a session established while sign-out is pending', async () => {
    const response = deferred<Response>();
    const started = signal();
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return response.promise;
    });

    const signOut = volcano.auth.signOut();
    await within(started.promise, 'sign-out request start');
    volcano._setSession({
      access_token: 'replacement-access',
      refresh_token: 'replacement-refresh',
      user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
    });
    response.resolve(reply(200, {}));

    const result = await within(signOut, 'stale sign-out completion');

    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    const [, options] = fetchCall(0);
    if (typeof options?.body !== 'string') {
      throw new TypeError('Expected JSON revocation body');
    }
    const body: unknown = JSON.parse(options.body);
    expect(body).toEqual({
      refresh_token: 'old-refresh',
    });
    expect(volcano.accessToken).toBe('replacement-access');
    expect(volcano.currentUser).toEqual({
      id: 'replacement-user',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

function blocksRefreshDuringSignOut(): void {
  it('rejects a new refresh while opaque-token logout is pending', async () => {
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
    });
    const response = deferred<Response>();
    const started = signal();
    fetchMock.mockImplementation(() => {
      started.resolve();
      return response.promise;
    });
    const operation = volcano.auth.signOut();
    await within(started.promise, 'opaque sign-out request start');
    const refresh = await within(volcano.auth.refreshSession(), 'overlapping refresh completion');
    expect(AuthRefreshDiscardedError.is(refresh.error)).toBe(true);
    response.resolve(reply(204));
    await expect(within(operation, 'opaque sign-out completion')).resolves.toEqual({
      error: null,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await expect(volcano.auth.getSession()).resolves.toEqual({
      data: { session: null },
      error: null,
    });
  });
}

function preservesRevocationFailures(): void {
  it('preserves a revocation failure when the session changes', async () => {
    const response = deferred<Response>();
    const started = signal();
    volcano._setSession({
      access_token: 'old-access',
      refresh_token: 'old-refresh',
      user: { id: 'old-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockImplementationOnce(() => {
      started.resolve();
      return response.promise;
    });

    const signOut = volcano.auth.signOut();
    await within(started.promise, 'failing sign-out request start');
    volcano._setSession({
      access_token: 'replacement-access',
      refresh_token: 'replacement-refresh',
      user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
    });
    response.resolve(reply(503, { error: 'Logout unavailable' }));

    const result = await within(signOut, 'failing sign-out completion');

    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(result.error?.cause).toMatchObject({ message: 'Logout unavailable', status: 503 });
    expect(volcano.accessToken).toBe('replacement-access');
  });
}

describe('VolcanoAuth credentials', () => {
  describe('Authentication - signOut', () => {
    clearsLocalSessions();
    keepsReplacementSessions();
    blocksRefreshDuringSignOut();
    preservesRevocationFailures();
  });
});
