/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import type { RequestResult } from '../src/auth-request.ts';
import { clearSharedFunctionResolveStateForTests } from '../src/function-resolve-cache.ts';
import { VolcanoAuth } from '../src/index.ts';
import type { User } from '../src/sdk-public-types.ts';
import { expectInstanceOf } from './support/assertions.ts';

beforeEach(clearSharedFunctionResolveStateForTests);
afterEach(() => {
  jest.restoreAllMocks();
});

function client(options: { apiUrl?: string; timeout?: number; refreshToken?: string } = {}): VolcanoAuth {
  return new VolcanoAuth({ anonKey: 'ak-test', accessToken: 'access', ...options });
}

function rejectsInvalidProjects(): void {
  test('rejects an empty project without sending a request', async () => {
    const sdk = client();
    const fetch = jest.spyOn(sdk, '_authFetch');
    await expect(sdk._postProjectLogRequest(' ', 'search', {})).resolves.toMatchObject({
      data: null,
      error: expect.any(Error),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test('rejects a non-string project identifier at the runtime boundary', async () => {
    const sdk = client();
    const fetch = jest.spyOn(sdk, '_authFetch');
    const send: unknown = Reflect.get(sdk, '_postProjectLogRequest');
    expectInstanceOf(send, Function);

    await expect(Reflect.apply(send, sdk, [42, 'search', {}])).resolves.toMatchObject({
      data: null,
      error: new Error('projectId must be a non-empty string'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  test.each(['.', '..', 'x/..', 'project/id'])(
    'rejects the project %p before building the log URL',
    async (projectId) => {
      const sdk = client();
      const fetch = jest.spyOn(sdk, '_authFetch');
      await expect(sdk._postProjectLogRequest(projectId, 'search', {})).resolves.toEqual({
        data: null,
        error: new Error('projectId cannot contain "/" or be "." or ".."'),
      });
      expect(fetch).not.toHaveBeenCalled();
    },
  );
}

function sendsLogRequests(): void {
  test('encodes a project containing dots as one log path segment', async () => {
    const sdk = client();
    const result: RequestResult = { ok: true, status: 200, data: {}, error: null };
    const fetch = jest.spyOn(sdk, '_authFetch').mockResolvedValue(result);
    await sdk._postProjectLogRequest('..x', 'activity', {});
    expect(fetch).toHaveBeenCalledWith('/projects/..x/logs/activity', {
      method: 'POST',
      body: '{}',
    });
  });

  test('uses an empty object for an absent log request body', async () => {
    const sdk = client();
    const result: RequestResult = { ok: true, status: 200, data: {}, error: null };
    const fetch = jest.spyOn(sdk, '_authFetch').mockResolvedValue(result);
    await expect(sdk._postProjectLogRequest('project?id', 'search', null)).resolves.toEqual({
      data: {},
      error: null,
    });
    expect(fetch).toHaveBeenCalledWith('/projects/project%3Fid/logs/search', {
      method: 'POST',
      body: '{}',
    });
  });

  test('returns a failed authenticated log request without decoding a payload', async () => {
    const sdk = client();
    const error = new Error('network unavailable');
    const result: RequestResult = { ok: false, status: null, data: null, error };
    jest.spyOn(sdk, '_authFetch').mockResolvedValue(result);
    await expect(sdk.searchLogs('project', { resource: { type: 'function' } })).resolves.toEqual({
      data: null,
      error,
    });
    await expect(sdk.getLogActivity('project', { resource: { type: 'function' } })).resolves.toEqual({
      data: null,
      error,
    });
  });
}

describe('facade log request boundary', () => {
  rejectsInvalidProjects();
  sendsLogRequests();
});

function initializesFromCredentials(): void {
  const user: User = { id: 'user', email: 'u@example.test', status: 'active' };
  test.each([
    { access: null, refresh: null, getUserCalls: 0, initializedUser: null },
    { access: '', refresh: null, getUserCalls: 0, initializedUser: null },
    { access: null, refresh: '', getUserCalls: 0, initializedUser: null },
    { access: 'access', refresh: null, getUserCalls: 1, initializedUser: user },
    { access: null, refresh: 'refresh', getUserCalls: 1, initializedUser: user },
    { access: '', refresh: 'refresh', getUserCalls: 1, initializedUser: user },
    { access: 'access', refresh: '', getUserCalls: 1, initializedUser: user },
  ])(
    'initializes only when a nonempty credential exists: access=$access refresh=$refresh',
    async ({ access, refresh, getUserCalls, initializedUser }) => {
      const sdk = client();
      sdk.accessToken = access;
      sdk.refreshToken = refresh;
      const getUser = jest.spyOn(sdk, 'getUser').mockResolvedValue({ user, error: null });

      const result = await sdk.initialize();

      expect(getUser).toHaveBeenCalledTimes(getUserCalls);
      expect(result).toEqual({ user: initializedUser, error: null });
    },
  );
}

function startsAnonymousAndHostedAuth(): void {
  test('passes empty anonymous metadata when omitted', async () => {
    const sdk = client();
    const error = new Error('signup refused');
    const response: RequestResult = { ok: false, status: 403, data: null, error };
    const fetch = jest.spyOn(sdk, '_anonFetch').mockResolvedValue(response);
    await expect(sdk.signInAnonymously()).resolves.toEqual({
      user: null,
      session: null,
      error,
    });
    expect(fetch).toHaveBeenCalledWith('/auth/signup-anonymous', {
      method: 'POST',
      body: '{"user_metadata":{}}',
    });
  });

  test('refuses hosted auth without a browser, including default options', () => {
    const sdk = client();
    expect(() => {
      sdk.getHostedAuthUrl();
    }).toThrow('only available in the browser');
    expect(() => {
      sdk.signInWithHostedAuth();
    }).toThrow('only available in the browser');
  });

  test('removes OAuth response credentials from a callback URL by default', () => {
    const sdk = client();
    const url = new URL('https://app.example.test/callback?code=secret&state=nonce&keep=ok#token');
    sdk._removeOAuthResponseParams(url);
    expect(url.toString()).toBe('https://app.example.test/callback?keep=ok');
  });
}

function endsCapturedSessions(): void {
  test('finishes a captured sign-out and clears the old credential', async () => {
    const sdk = client();
    const context = sdk._captureAuthContext();
    await expect(sdk._signOutCaptured(context, null)).resolves.toEqual({ error: null });
    expect(sdk.accessToken).toBeNull();
  });

  test('revokes the captured session with its original credential', async () => {
    const sdk = client();
    const context = sdk._captureAuthContext();
    const response: RequestResult = { ok: true, status: 204, data: null, error: null };
    const fetch = jest.spyOn(sdk, '_anonFetch').mockResolvedValue(response);
    await expect(sdk._revokeAccessSession(context, 'session/id', null)).resolves.toBeNull();
    expect(fetch).toHaveBeenCalledWith('/auth/user/sessions/session%2Fid', {
      method: 'DELETE',
      headers: { Authorization: 'Bearer access' },
    });
  });

  test('returns a failed captured refresh without replacing the session', async () => {
    const sdk = client({ refreshToken: 'refresh' });
    const context = sdk._captureAuthContext();
    const error = new Error('expired');
    jest.spyOn(sdk, '_fetchSessionRefresh').mockResolvedValue({
      ok: false,
      status: 401,
      data: null,
      error,
    });
    await expect(sdk._performSessionRefresh(context)).resolves.toEqual({ session: null, error });
  });
}

describe('facade auth lifecycle boundary', () => {
  initializesFromCredentials();
  startsAnonymousAndHostedAuth();
  endsCapturedSessions();
});
