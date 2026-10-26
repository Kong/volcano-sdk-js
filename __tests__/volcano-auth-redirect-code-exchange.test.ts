/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchBody, fetchCall, jsonField, reply, within } from './auth-concurrency-fixtures.ts';
import {
  callbackRedirectURL,
  oauthSessionReply,
  oauthUserReply,
  resetRedirectState,
  seedOAuthCallback,
} from './support/volcano-auth-redirect-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

function respectsExplicitTokens(): void {
  it('exchanges a callback when an empty explicit token supplies no session', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        access_token: 'oauth-access',
        refresh_token: 'oauth-refresh',
        user: { id: 'oauth-user', email: 'oauth@example.test', status: 'active' },
        expires_in: 3600,
      }),
    );

    const sdk = new VolcanoAuth({ anonKey: 'ak-test-key', accessToken: '' });
    await within(sdk._completeOAuthExchange(), 'empty-token OAuth exchange');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(sdk.accessToken).toBe('oauth-access');
    expect(window.location.search).toBe('');
  });

  it('leaves a callback untouched when an explicit credential already owns the session', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');

    const sdk = new VolcanoAuth({ anonKey: 'ak-test-key', accessToken: 'server-access' });
    await within(sdk._completeOAuthExchange(), 'explicit-token OAuth bypass');

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sdk.accessToken).toBe('server-access');
    expect(window.location.search).toBe('?code=one-time-code&state=oauth-nonce');
  });
}

function exchangesCallbackCodes(): void {
  it('exchanges a matching one-time callback code and strips it from the URL', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    fetchMock.mockResolvedValueOnce(oauthSessionReply()).mockResolvedValueOnce(oauthUserReply());

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
    expect(v.accessToken).toBe('oauth-access');
    expect(window.location.search).toBe('');
    expect(fetchCall(0)[0]).toBe('https://api.test.com/auth/oauth/exchange');
    expect(JSON.parse(fetchBody(0))).toEqual({
      code: 'one-time-code',
      redirect_url: callbackRedirectURL(),
    });
  });

  it('keeps the exchanged session in memory when browser storage is unavailable', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    const storageSetItem = jest.mocked(localStorage).setItem;
    expect(jest.isMockFunction(storageSetItem)).toBe(true);
    storageSetItem.mockImplementationOnce(() => {
      throw new DOMException('Storage is unavailable', 'SecurityError');
    });
    fetchMock.mockResolvedValueOnce(oauthSessionReply()).mockResolvedValueOnce(oauthUserReply());

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
    expect(result.error).toBeNull();
    expect(v.accessToken).toBe('oauth-access');
    expect(v.refreshToken).toBe('oauth-refresh');
  });
}

function normalizesCallbackUrls(): void {
  it('matches callback URLs after equivalent browser query serialization', async () => {
    const storedRedirectURL = `${window.location.origin}/auth/callback?return_to=hello%20world`;
    seedOAuthCallback(
      '/auth/callback?return_to=hello+world&code=one-time-code&state=oauth-nonce',
      'oauth-nonce',
      storedRedirectURL,
    );
    fetchMock.mockResolvedValueOnce(oauthSessionReply()).mockResolvedValueOnce(oauthUserReply());

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
    expect(jsonField(fetchCall(0)[1], 'redirect_url')).toBe(storedRedirectURL);
    expect(window.location.search).toBe('?return_to=hello+world');
  });

  it('accepts and scrubs optional provider response metadata', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce&iss=https%3A%2F%2Fissuer.test');
    fetchMock.mockResolvedValueOnce(oauthSessionReply()).mockResolvedValueOnce(oauthUserReply());

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result.error).toBeNull();
    expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
    expect(window.location.search).toBe('');
  });
}

describe('VolcanoAuth', () => {
  describe('Authentication - OAuth authorization code exchange', () => {
    afterEach(resetRedirectState);

    respectsExplicitTokens();
    exchangesCallbackCodes();
    normalizesCallbackUrls();
  });
});
