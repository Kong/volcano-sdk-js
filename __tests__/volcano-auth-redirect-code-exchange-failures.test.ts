/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchBody, reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';
import { resetRedirectState, seedOAuthCallback } from './support/volcano-auth-redirect-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const TEST_ANON_KEY = `ak-${testAccessToken('00000000-0000-0000-0000-000000000001', {
  role: 'anon',
})}`;

function rejectsMismatchedCallbacks(): void {
  it('rejects a callback whose state does not match without exchanging it', async () => {
    seedOAuthCallback('/auth/callback?code=one-time-code&state=attacker', 'expected');

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result.user).toBeNull();
    expect(result.error).toEqual(
      expect.objectContaining({
        message: 'OAuth callback state did not match',
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('reports a settled callback error after another API call awaited the exchange', async () => {
    seedOAuthCallback('/auth/callback?code=rejected&state=oauth-nonce');
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' }));

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const apiResult = await v.auth.getUser();
    const initializeResult = await v.initialize();

    expect(apiResult.error).toEqual(expect.objectContaining({ message: 'invalid authorization code' }));
    expect(initializeResult.error).toEqual(expect.objectContaining({ message: 'invalid authorization code' }));
    expect(v._oauthExchangeError).toBeNull();
  });
}

function ignoresForeignCallbacks(): void {
  it('leaves unrelated code and state query parameters untouched', async () => {
    window.history.replaceState(null, '', '/checkout?code=promo&state=selected');

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result).toEqual({ user: null, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?code=promo&state=selected');
  });

  it('leaves another integration callback untouched when a stale nonce exists', async () => {
    seedOAuthCallback('/stripe/callback?code=stripe-code&state=stripe-state', 'abandoned-volcano-nonce');

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result).toEqual({ user: null, error: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?code=stripe-code&state=stripe-state');
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBe('abandoned-volcano-nonce');
  });
}

function surfacesProviderDenials(): void {
  it('surfaces a provider-denied callback and clears its one-time context', async () => {
    seedOAuthCallback('/auth/callback?error=access_denied&error_description=Sign-in%20cancelled&state=oauth-nonce');

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.initialize();

    expect(result.user).toBeNull();
    expect(result.error).toEqual(
      expect.objectContaining({
        message: 'Sign-in cancelled',
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBeNull();
    expect(window.sessionStorage.getItem('volcano_auth_redirect_url')).toBeNull();
  });

  it('clears a previous exchange error when a later sign-in succeeds', async () => {
    seedOAuthCallback('/auth/callback?code=rejected&state=oauth-nonce');
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' })).mockResolvedValueOnce(
      reply(200, {
        access_token: 'signed-in-access',
        refresh_token: 'signed-in-refresh',
        user: { id: 'signed-in-user', email: 'signed-in@example.com', status: 'active' },
        expires_in: 3600,
      }),
    );

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const failed = await v.initialize();
    expect(failed.error).toEqual(expect.objectContaining({ message: 'invalid authorization code' }));

    const signedIn = await v.auth.signIn({ email: 'signed-in@example.com', password: 'valid-password' });

    expect(signedIn.error).toBeNull();
    expect(v._oauthExchangeError).toBeNull();
  });
}

function recoversStoredSessions(): void {
  it('surfaces a failed fresh exchange instead of hiding it behind a stored session', async () => {
    window.localStorage.setItem('volcano_access_token', 'stored-access');
    window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
    seedOAuthCallback('/auth/callback?code=rejected&state=oauth-nonce');
    fetchMock
      .mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' }))
      .mockResolvedValueOnce(
        reply(200, { user: { id: 'stored-user', email: 'stored@example.com', status: 'active' } }),
      );

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const failed = await v.initialize();

    expect(failed.user).toBeNull();
    expect(failed.error).toEqual(expect.objectContaining({ message: 'invalid authorization code' }));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const recovered = await v.initialize();
    expect(recovered).toEqual({
      user: { id: 'stored-user', email: 'stored@example.com', status: 'active' },
      error: null,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
}

function refreshesAfterProviderDenials(): void {
  it('refreshes a valid stored session after an OAuth provider denial', async () => {
    window.localStorage.setItem('volcano_access_token', sessionToken());
    window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
    seedOAuthCallback('/auth/callback?error=access_denied&state=oauth-nonce');
    fetchMock.mockResolvedValueOnce(
      reply(200, {
        access_token: sessionToken(undefined, true),
        refresh_token: 'refreshed-refresh',
        expires_in: 3600,
        user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
      }),
    );

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const result = await v.auth.refreshSession();

    expect(result).toEqual(
      expect.objectContaining({
        session: expect.objectContaining({ access_token: sessionToken(undefined, true) }),
        error: null,
      }),
    );
    expect(JSON.parse(fetchBody(0))).toEqual({
      refresh_token: 'stored-refresh',
    });
    expect(v._oauthExchangeError).toBeNull();
  });
}

function fallsBackToAnonKey(): void {
  it('uses the anon key after a failed code exchange without clearing the auth error', async () => {
    seedOAuthCallback('/auth/callback?code=rejected&state=oauth-nonce');
    fetchMock
      .mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' }))
      .mockResolvedValueOnce(
        reply(200, {
          name: 'public-function',
          function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
          cache_ttl_seconds: 300,
        }),
      )
      .mockResolvedValueOnce(reply(200, { submitted: true }));

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: TEST_ANON_KEY });
    const result = await v.functions.invoke('public-function');
    const initialization = await v.initialize();

    expect(result).toEqual(expect.objectContaining({ data: { submitted: true }, error: null }));
    expect(initialization.error).toEqual(expect.objectContaining({ message: 'invalid authorization code' }));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
}

describe('VolcanoAuth', () => {
  describe('Authentication - OAuth authorization code exchange', () => {
    afterEach(resetRedirectState);

    rejectsMismatchedCallbacks();
    ignoresForeignCallbacks();
    surfacesProviderDenials();
    recoversStoredSessions();
    refreshesAfterProviderDenials();
    fallsBackToAnonKey();
  });
});
