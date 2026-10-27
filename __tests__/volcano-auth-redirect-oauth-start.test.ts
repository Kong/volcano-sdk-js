/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { expectPresent } from './support/assertions.ts';

function startsHostedAuth(): void {
  it('generates a random state nonce and stores it without a redirect URL by default', () => {
    const sdk = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const nonce = sdk._generateAuthStateNonce();

    expect(nonce).toMatch(/^[\da-f]{32}$/u);
    sdk._storeAuthState(nonce);
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBe(nonce);
    expect(window.sessionStorage.getItem('volcano_auth_redirect_url')).toBeNull();
  });

  it('getHostedAuthUrl stores a nonce and includes it as state with anon_key', () => {
    // anonKey must be a JWT carrying project_id for projectId derivation.
    const anonKey = testAccessToken('11111111-1111-1111-1111-111111111111');
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey });

    const url = v.auth.getHostedAuthUrl({ action: 'signup' });
    const parsed = new URL(url);

    expect(parsed.pathname).toBe('/projects/11111111-1111-1111-1111-111111111111/auth/hosted');
    expect(parsed.searchParams.get('anon_key')).toBe(anonKey);
    expect(parsed.searchParams.get('action')).toBe('signup');
    const stateInUrl = parsed.searchParams.get('state');
    expect(stateInUrl).toBeTruthy();
    // The same nonce is stored for validation on return.
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBe(stateInUrl);
  });

  it('getHostedAuthUrl accepts an explicit projectId when the anon key is opaque', () => {
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-opaque-key' });
    const url = v.auth.getHostedAuthUrl({ projectId: 'proj-xyz' });
    expect(new URL(url).pathname).toBe('/projects/proj-xyz/auth/hosted');
  });
}

function startsOAuthSignIn(): void {
  it('signInWithOAuth stores a nonce and sends an exact redirect_url separately', () => {
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

    const oauthUrl = v.auth.signInWithOAuth('google');
    const parsed = new URL(oauthUrl);

    expect(parsed.pathname).toBe('/auth/oauth/google/authorize');
    expect(parsed.searchParams.get('anon_key')).toBe('ak-test-key');
    const transportRedirectUrl = parsed.searchParams.get('redirect_url');
    expect(transportRedirectUrl).toBeTruthy();
    const nonce = parsed.searchParams.get('client_state');
    expect(nonce).toBeTruthy();
    expect(parsed.searchParams.get('response_mode')).toBe('code');
    expectPresent(transportRedirectUrl);
    expect(new URL(transportRedirectUrl).searchParams.get('vh_state')).toBe(nonce);
    expect(window.sessionStorage.getItem('volcano_auth_state')).toBe(nonce);
    const storedRedirectUrl = window.sessionStorage.getItem('volcano_auth_redirect_url');
    expect(storedRedirectUrl).toBeTruthy();
    expectPresent(storedRedirectUrl);
    expect(new URL(storedRedirectUrl).searchParams.get('vh_state')).toBeNull();
  });
}

function guardsOAuthRedirects(): void {
  it('preserves the registered redirect query encoding when adding transport state', () => {
    const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
    const redirectTo = 'https://app.test/auth/callback?z=hello%20world&a=%21';

    const oauthUrl = v.auth.signInWithOAuth('google', { redirectTo });
    const parsed = new URL(oauthUrl);
    const nonce = parsed.searchParams.get('client_state');

    expectPresent(nonce);
    expect(parsed.searchParams.get('redirect_url')).toBe(`${redirectTo}&vh_state=${nonce}`);
    expect(window.sessionStorage.getItem('volcano_auth_redirect_url')).toBe(redirectTo);
  });

  it.each(['code', 'state', 'error', 'error_description', 'error_uri', 'iss', 'vh_state'])(
    'rejects a redirectTo containing the reserved %s query parameter',
    (key) => {
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      expect(() =>
        v.auth.signInWithOAuth('google', {
          redirectTo: `https://app.test/auth/callback?${key}=app-value`,
        }),
      ).toThrow(`OAuth redirectTo must not contain the reserved "${key}" query parameter`);
    },
  );
}

describe('VolcanoAuth', () => {
  describe('Authentication - hosted auth / OAuth initiation (RP nonce)', () => {
    afterEach(() => {
      window.sessionStorage.clear();
    });

    startsHostedAuth();
    startsOAuthSignIn();
    guardsOAuthRedirects();
  });
});
