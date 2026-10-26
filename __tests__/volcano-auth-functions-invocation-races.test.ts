/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it } from '@jest/globals';
import { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import {
  config,
  fetchMock,
  resolvedFunction,
  session,
  withBrowserWindow,
} from './support/volcano-auth-functions-fixtures.ts';

const TEST_ACCESS_TOKEN_PROJECT_A = testAccessToken();
const TEST_ACCESS_TOKEN_PROJECT_B = testAccessToken('00000000-0000-0000-0000-000000000002');
const TEST_ACCESS_TOKEN = TEST_ACCESS_TOKEN_PROJECT_A;
const TEST_ANON_KEY = `ak-${testAccessToken('00000000-0000-0000-0000-000000000001', { role: 'anon' })}`;
let volcano: VolcanoAuth;

withBrowserWindow();

beforeEach(() => {
  volcano = new VolcanoAuth(config);
});

function rejectsClearedSessionsAndStaleRetries(): void {
  it('rejects when a signed-in session clears during function resolution', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession(session(TEST_ACCESS_TOKEN, 'refresh-token', 'user-1'));
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._clearSession(volcano._captureAuthContext());
    response.resolve(resolvedFunction('my-function'));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('does not re-resolve a 404 under a replacement session', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_A, 'refresh-token-a', 'user-1'));
    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function')).mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'refresh-token-b', 'user-2'));
    response.resolve(reply(404, { error: 'Not found' }));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
  });
}

function rejectsReplacedSessionDuringResolution(): void {
  it('rejects when a signed-in session is replaced during function resolution', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_A, 'refresh-token-a', 'user-1'));
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'refresh-token-b', 'user-2'));
    response.resolve(resolvedFunction('my-function'));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=my-function',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_ACCESS_TOKEN_PROJECT_A}`,
        }),
      }),
    );
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
  });
}

function rejectsSignInDuringResolution(): void {
  it('rejects when an anonymous caller signs in during function resolution', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    const anonymousVolcano = new VolcanoAuth({
      apiUrl: 'https://api.test.com',
      anonKey: TEST_ANON_KEY,
    });
    fetchMock.mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = anonymousVolcano.functions.invoke('public-function');
    await within(requestStarted.promise, 'function request start');
    anonymousVolcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_A, 'refresh-token-a', 'user-1'));
    response.resolve(resolvedFunction('public-function'));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://api.test.com/functions/resolve?name=public-function',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${TEST_ANON_KEY}` }),
      }),
    );
    expect(anonymousVolcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_A);
  });
}

function discardsReplacedSessionResponse(): void {
  it('discards a successful invocation response after the session is replaced', async () => {
    const response = deferred<Response>();
    const requestStarted = signal();
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_A, 'refresh-token-a', 'user-1'));
    fetchMock.mockResolvedValueOnce(resolvedFunction('my-function')).mockImplementationOnce(() => {
      requestStarted.resolve();
      return response.promise;
    });

    const invocation = volcano.functions.invoke('my-function');
    await within(requestStarted.promise, 'function request start');
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'refresh-token-b', 'user-2'));
    response.resolve(reply(200, { submitted: true }));

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${TEST_ACCESS_TOKEN_PROJECT_A}`,
        }),
      }),
    );
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
  });
}

function discardsReplacedSessionRefresh(): void {
  it('returns a discarded refresh error without replaying under a replacement session', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = signal();
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_A, 'old-refresh', 'user-1'));
    fetchMock
      .mockResolvedValueOnce(resolvedFunction('my-function'))
      .mockResolvedValueOnce(reply(401, { error: 'Token expired' }))
      .mockImplementationOnce(() => {
        refreshStarted.resolve();
        return refreshResponse.promise;
      });

    const invocation = volcano.functions.invoke('my-function', { operation: 'mutate' });
    await within(refreshStarted.promise, 'token refresh start');
    volcano._setSession(session(TEST_ACCESS_TOKEN_PROJECT_B, 'replacement-refresh', 'user-2'));
    refreshResponse.resolve(
      reply(200, {
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        user: { id: 'user-1', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    const result = await within(invocation, 'function invocation completion');

    expect(result.data).toBeNull();
    expect(AuthRefreshDiscardedError.is(result.error)).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN_PROJECT_B);
    expect(volcano.currentUser).toEqual({
      id: 'user-2',
      email: 'fixture@example.com',
      status: 'active',
    });
  });
}

describe('VolcanoAuth function invocation and auth races', () => {
  rejectsClearedSessionsAndStaleRetries();
  rejectsReplacedSessionDuringResolution();
  rejectsSignInDuringResolution();
  discardsReplacedSessionResponse();
  discardsReplacedSessionRefresh();
});
