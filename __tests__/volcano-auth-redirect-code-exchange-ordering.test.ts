/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchBody, reply, within } from './auth-concurrency-fixtures.ts';
import { oauthSessionReply, resetRedirectState, seedOAuthCallback } from './support/volcano-auth-redirect-fixtures.ts';
import { pendingFetch, replacementSession } from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

function discardsSupersededExchanges(): void {
  it('discards a successful code exchange after another session wins', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    const { response, started } = pendingFetch();

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    await within(started.promise, 'OAuth exchange request');
    v._setSession(replacementSession());
    response.resolve(
      reply(200, {
        access_token: 'stale-access',
        refresh_token: 'stale-refresh',
        user: { id: 'stale-user', email: 'fixture@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    await within(v._completeOAuthExchange(), 'OAuth exchange completion');

    expect(v.accessToken).toBe('replacement-access');
    expect(v.currentUser).toEqual({
      id: 'replacement-user',
      email: 'fixture@example.com',
      status: 'active',
    });
    expect(v._oauthExchangeError).toBeNull();
  });

  it('does not retain a stale code exchange failure after another session wins', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    const { response, started } = pendingFetch();

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    await within(started.promise, 'OAuth exchange request');
    v._setSession(replacementSession());
    response.resolve(reply(400, { error: 'stale exchange failed' }));

    await within(v._completeOAuthExchange(), 'OAuth exchange completion');

    expect(v.accessToken).toBe('replacement-access');
    expect(v.currentUser).toEqual({
      id: 'replacement-user',
      email: 'fixture@example.com',
      status: 'active',
    });
    expect(v._oauthExchangeError).toBeNull();
  });
}

function refreshesAfterExchange(): void {
  it('waits for code exchange before refreshing the resulting session', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    const { response: exchange, started: requestStarted } = pendingFetch();
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        access_token: 'refreshed-access',
        refresh_token: 'refreshed-refresh',
        user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const refresh = v.auth.refreshSession();

    await within(requestStarted.promise, 'OAuth exchange request');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    exchange.resolve(oauthSessionReply());

    await expect(within(refresh, 'OAuth refresh')).resolves.toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ access_token: 'refreshed-access' }),
        error: null,
      }),
    );
    expect(JSON.parse(fetchBody(1))).toEqual({
      refresh_token: 'oauth-refresh',
    });
  });
}

function signsOutAfterExchange(): void {
  it('waits for an in-flight exchange before signing out', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    const { response: exchange, started: requestStarted } = pendingFetch();
    fetchMock.mockResolvedValueOnce(reply(200, {}));

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const signOut = v.auth.signOut();

    await within(requestStarted.promise, 'OAuth exchange request');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    exchange.resolve(oauthSessionReply());

    await expect(within(signOut, 'OAuth sign-out')).resolves.toEqual({ error: null });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(v.accessToken).toBeNull();
    expect(v.refreshToken).toBeNull();
    expect(v._oauthExchangeError).toBeNull();
  });
}

function authorizesStorageAfterExchange(): void {
  it('waits for code exchange before checking storage authentication', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=oauth-nonce');
    const { response: exchange, started: requestStarted } = pendingFetch();
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        id: 'object-1',
        bucket_id: 'bucket-1',
        name: 'avatar.png',
        is_public: true,
        size: 4,
        mime_type: 'image/png',
      }),
    );

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const visibility = v.storage.from('avatars').updateVisibility('avatar.png', true);

    await within(requestStarted.promise, 'OAuth exchange request');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    exchange.resolve(oauthSessionReply());

    await expect(within(visibility, 'OAuth storage visibility')).resolves.toEqual(
      expect.objectContaining({ error: null }),
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
}

describe('VolcanoAuth', () => {
  describe('Authentication - OAuth authorization code exchange', () => {
    afterEach(resetRedirectState);

    discardsSupersededExchanges();
    refreshesAfterExchange();
    signsOutAfterExchange();
    authorizesStorageAfterExchange();
  });
});
