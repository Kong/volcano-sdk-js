/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { type AuthStateCallback, VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { NONCE, resetRedirectState, seedNonce } from './support/volcano-auth-redirect-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

function rejectsUnsolicitedFragments(): void {
  it('ignores a fragment that does not contain an access token', () => {
    window.location.hash = '#section=pricing';
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    // No token adopted; app hash routing is left untouched.
    expect(v.accessToken).toBeFalsy();
    expect(window.location.hash).toBe('#section=pricing');
  });

  it('rejects an unsolicited session when no nonce was stored (login-CSRF defense)', () => {
    // No seedNonce(): the victim never initiated a hosted-auth flow in this tab.
    window.location.hash =
      '#access_token=attacker-access&refresh_token=attacker-refresh&token_type=bearer&expires_in=3600&state=attacker-state';

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    // The attacker-crafted session is NOT adopted...
    expect(v.accessToken).toBeFalsy();
    expect(localStorage.getItem('volcano_access_token')).toBeNull();
    // ...and the tokens are scrubbed from the URL.
    expect(window.location.hash).toBe('');
  });

  it('rejects a session whose state does not match the stored nonce', () => {
    seedNonce('the-real-nonce');
    window.location.hash =
      '#access_token=attacker-access&refresh_token=attacker-refresh&token_type=bearer&expires_in=3600&state=a-different-nonce';

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    expect(v.accessToken).toBeFalsy();
    expect(window.location.hash).toBe('');
    // The stored nonce is consumed even on rejection (single-use).
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBeNull();
  });
}

function replacesStoredSessions(): void {
  it('clears a stored refresh token when the redirect hand-off carries none', () => {
    seedNonce();
    // A previous session left a refresh token in storage.
    localStorage.setItem('volcano_refresh_token', 'stale-stored-refresh');
    // The redirect fragment carries a fresh access token but NO refresh token.
    window.location.hash = `#access_token=fresh-access&token_type=bearer&expires_in=3600&state=${NONCE}`;

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    // The redirect session takes precedence: the stale refresh token is not
    // adopted and is purged so it can't refresh into the previous account.
    expect(v.accessToken).toBe('fresh-access');
    expect(v.refreshToken).toBeNull();
    expect(localStorage.getItem('volcano_refresh_token')).toBeNull();
    expect(Reflect.get(localStorage, 'removeItem')).toHaveBeenCalledWith('volcano_refresh_token');
  });

  it('strips the fragment cleanly when only auth params (incl. state) are present', () => {
    seedNonce();
    window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
    const replaceSpy = jest.spyOn(window.history, 'replaceState');

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    expect(v.accessToken).toBe('hash-access');
    expect(replaceSpy).toHaveBeenCalled();
    expect(window.location.hash).toBe('');
    replaceSpy.mockRestore();
  });
}

function preservesAppFragments(): void {
  it('leaves the fragment intact when an unknown app param rides alongside the tokens', () => {
    seedNonce();
    window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&state=${NONCE}&app_view=billing`;

    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    // Session is still adopted, but the fragment is preserved so we never
    // clobber an app's own hash state/routing.
    expect(v.accessToken).toBe('hash-access');
    expect(window.location.hash).toBe(
      `#access_token=hash-access&refresh_token=hash-refresh&state=${NONCE}&app_view=billing`,
    );
  });
}

function adoptsPreservedFragmentsOnce(): void {
  it('adopts the URL session only once even when the preserved hash keeps tokens around', async () => {
    seedNonce();
    // App params keep the hash (and thus the tokens) in the URL after adoption.
    window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&state=${NONCE}&app_view=billing`;
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    const callback = jest.fn<AuthStateCallback>();
    v.auth.onAuthStateChange(callback);
    // ignore the initial emission on subscribe
    callback.mockClear();

    // The session was already consumed at construction, so the first getUser()
    // announces that adoption exactly once; repeated getUser() calls must not
    // re-adopt or re-fire the auth callback even though the tokens are still
    // present in window.location.hash.
    fetchMock.mockImplementation(() =>
      Promise.resolve(reply(200, { user: { id: 'user-once', email: 'once@example.com', status: 'active' } })),
    );

    await v.auth.getUser();
    await v.auth.getUser();
    await v.auth.getUser();

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-once' }));
    expect(window.location.hash).toBe(
      `#access_token=hash-access&refresh_token=hash-refresh&state=${NONCE}&app_view=billing`,
    );
    expect(v.accessToken).toBe('hash-access');
  });
}

describe('VolcanoAuth', () => {
  describe('Authentication - managed auth redirect (URL hash adoption)', () => {
    // These run under jsdom, so drive the real window/location/history.
    afterEach(resetRedirectState);

    rejectsUnsolicitedFragments();
    replacesStoredSessions();
    preservesAppFragments();
    adoptsPreservedFragmentsOnce();
  });
});
