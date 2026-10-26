/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { fetchCall, jsonField, reply } from './auth-concurrency-fixtures.ts';
import { oauthWindow, PROVIDER_REQUEST_LABELS, TEST_ACCESS_TOKEN } from './support/volcano-auth-oauth-fixtures.ts';
import { installWindow, restoreWindow, settleAfterReplacement } from './support/volcano-auth-sessions-fixtures.ts';

const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const fetchMock = jest.mocked(globalThis.fetch);
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow(oauthWindow());
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function refreshesProviderTokens(): void {
  it('should refresh OAuth token', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        message: 'Token refreshed',
        provider: 'google',
        expires_in: 3600,
      }),
    );

    const result = await volcano.auth.refreshOAuthToken('google');

    expect(result.message).toBe('Token refreshed');
    expect(result.provider).toBe('google');
    expect(result.expiresIn).toBe(3600);
    expect(result.error).toBeNull();
  });

  it('should return error on refreshOAuthToken failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Refresh not supported' }));

    const result = await volcano.auth.refreshOAuthToken('github');

    expect(result.message).toBeNull();
    expect(result.error?.message).toBe('Refresh not supported');
  });
}

function rejectsStaleProviderRefreshes(): void {
  it('should reject an obsolete OAuth provider refresh result', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.refreshOAuthToken('google'),
      reply(200, {
        message: 'Provider token refreshed successfully',
        provider: 'google',
        expires_in: 3600,
      }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.message).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should prefer a session-change error when an obsolete provider refresh fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.refreshOAuthToken('google'),
      reply(401, { error: 'old session rejected' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.message).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function readsProviderTokens(): void {
  it('should get OAuth provider token', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        message: 'Token retrieved',
        provider: 'google',
        expires_in: 3600,
      }),
    );

    const result = await volcano.auth.getOAuthProviderToken('google');

    expect(result.message).toBe('Token retrieved');
    expect(result.provider).toBe('google');
    expect(result.expiresIn).toBe(3600);
    expect(result.error).toBeNull();
  });

  it('should return error on getOAuthProviderToken failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(404, { error: 'Provider not linked' }));

    const result = await volcano.auth.getOAuthProviderToken('apple');

    expect(result.message).toBeNull();
    expect(result.error?.message).toBe('Provider not linked');
  });
}

function rejectsStaleProviderTokens(): void {
  it('should reject an obsolete OAuth provider token status', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.getOAuthProviderToken('google'),
      reply(200, {
        message: 'Provider token is valid',
        provider: 'google',
        expires_in: 3600,
      }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.message).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should prefer a session-change error when an obsolete token status request fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.getOAuthProviderToken('google'),
      reply(401, { error: 'old session rejected' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.message).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function callsProviderApis(): void {
  it('should call OAuth API', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        provider: 'github',
        endpoint: '/user/repos',
        status_code: 200,
        data: ['repo1', 'repo2'],
      }),
    );

    const result = await volcano.auth.callOAuthAPI('github', {
      endpoint: '/user/repos',
      method: 'GET',
    });

    expect(result.data).toEqual(['repo1', 'repo2']);
    expect(result.error).toBeNull();

    expect(jsonField(fetchCall(0)[1], 'endpoint')).toBe('/user/repos');
    expect(jsonField(fetchCall(0)[1], 'method')).toBe('GET');
  });

  it('should call OAuth API with POST body', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(
      reply(200, {
        data: { success: true },
      }),
    );

    const result = await volcano.auth.callOAuthAPI('github', {
      endpoint: '/user/repos',
      method: 'POST',
      body: { name: 'new-repo' },
    });

    expect(result.data).toEqual({ success: true });

    expect(jsonField(fetchCall(0)[1], 'body')).toEqual({ name: 'new-repo' });
  });
}

function rejectsProviderApiCalls(): void {
  it('should return error on callOAuthAPI failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(403, { error: 'Insufficient scope' }));

    const result = await volcano.auth.callOAuthAPI('github', {
      endpoint: '/admin/repos',
    });

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe('Insufficient scope');
  });

  it('should reject an obsolete OAuth provider API result', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.callOAuthAPI('github', { endpoint: '/user/repos' }),
      reply(200, { data: { repos: ['obsolete'] } }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function rejectsFailedStaleProviderApiCalls(): void {
  it('should prefer a session-change error when an obsolete provider API request fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.callOAuthAPI('github', { endpoint: '/user/repos' }),
      reply(401, { error: 'old session rejected' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

describe('VolcanoAuth OAuth provider operations', () => {
  describe('OAuth', () => {
    refreshesProviderTokens();
    rejectsStaleProviderRefreshes();
    readsProviderTokens();
    rejectsStaleProviderTokens();
    callsProviderApis();
    rejectsProviderApiCalls();
    rejectsFailedStaleProviderApiCalls();
  });
});
