/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { expectPresent } from './support/assertions.ts';
import {
  oauthWindow,
  PROVIDER_REQUEST_LABELS,
  providerMethod,
  TEST_ACCESS_TOKEN,
} from './support/volcano-auth-oauth-fixtures.ts';
import { installWindow, restoreWindow, settleAfterReplacement } from './support/volcano-auth-sessions-fixtures.ts';

const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const fetchMock = jest.mocked(globalThis.fetch);
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow(oauthWindow());
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function signsInWithProviders(): void {
  it('should redirect to OAuth provider with anon_key and separate client state', () => {
    const url = volcano.auth.signInWithOAuth('google');
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://api.test.com/auth/oauth/google/authorize');
    expect(parsed.searchParams.get('anon_key')).toBe('ak-test-anon-key');
    const redirectUrl = parsed.searchParams.get('redirect_url');
    expect(redirectUrl).toBeTruthy();
    expectPresent(redirectUrl);
    expect(new URL(redirectUrl).searchParams.get('vh_state')).toBe(parsed.searchParams.get('client_state'));
  });

  it('should have convenience methods for all providers', () => {
    expect(providerMethod(volcano, 'signInWithGoogle')).toContain('/oauth/google/');
    expect(providerMethod(volcano, 'signInWithGitHub')).toContain('/oauth/github/');
    expect(providerMethod(volcano, 'signInWithMicrosoft')).toContain('/oauth/microsoft/');
    expect(providerMethod(volcano, 'signInWithApple')).toContain('/oauth/apple/');
  });
}

function listsLinkedProviders(): void {
  it('should get linked providers', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(200, { providers: [{ provider: 'google' }, { provider: 'github' }] }));

    const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

    expect(error).toBeNull();
    expect(providers).toEqual([{ provider: 'google' }, { provider: 'github' }]);
  });

  it('should return empty array when no providers linked', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(200, {}));

    const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

    expect(error).toBeNull();
    expect(providers).toEqual([]);
  });

  it('should return error on getLinkedOAuthProviders failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(401, { error: 'Unauthorized' }));

    const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

    expect(providers).toBeNull();
    expect(error).toBeDefined();
  });
}

function discardsStaleLinkedProviders(): void {
  it('should discard linked providers from a replaced local session', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.getLinkedOAuthProviders(),
      reply(200, { providers: [{ provider: 'google' }] }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.providers).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should prefer a session-change error when an obsolete provider request fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.getLinkedOAuthProviders(),
      reply(401, { error: 'old session rejected' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.providers).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function linksProviders(): void {
  it('should link OAuth provider', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(200, { message: 'Provider linked', authorization_url: 'https://...' }));

    const { data, error } = await volcano.auth.linkOAuthProvider('github');

    expect(error).toBeNull();
    expect(data).toMatchObject({ message: 'Provider linked' });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/auth/oauth/github/link',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('should return error on linkOAuthProvider failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Provider already linked' }));

    const { data, error } = await volcano.auth.linkOAuthProvider('github');

    expect(data).toBeNull();
    expect(error).toBeDefined();
  });
}

function discardsStaleProviderLinks(): void {
  it('should discard an OAuth link URL from a replaced local session', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.linkOAuthProvider('google'),
      reply(200, { authorization_url: 'https://accounts.example/link' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should prefer a session-change error when an obsolete OAuth link request fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.linkOAuthProvider('google'),
      reply(401, { error: 'old session rejected' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(result.data).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function unlinksProviders(): void {
  it('should unlink OAuth provider', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(200, {}));

    const { error } = await volcano.auth.unlinkOAuthProvider('github');

    expect(error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/auth/oauth/github/unlink',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should return error on unlinkOAuthProvider failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Cannot unlink only provider' }));

    const { error } = await volcano.auth.unlinkOAuthProvider('github');

    expect(error).toBeDefined();
  });
}

function rejectsStaleProviderUnlinks(): void {
  it('should reject an obsolete OAuth unlink success', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.unlinkOAuthProvider('google'),
      reply(204, {}),
      PROVIDER_REQUEST_LABELS,
    );

    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should prefer a session-change error when an obsolete OAuth unlink fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.unlinkOAuthProvider('google'),
      reply(401, { error: 'old session rejected' }),
      PROVIDER_REQUEST_LABELS,
    );

    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

describe('VolcanoAuth OAuth provider operations', () => {
  describe('OAuth', () => {
    signsInWithProviders();
    listsLinkedProviders();
    discardsStaleLinkedProviders();
    linksProviders();
    discardsStaleProviderLinks();
    unlinksProviders();
    rejectsStaleProviderUnlinks();
  });
});
