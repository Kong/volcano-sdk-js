/** @jest-environment ./__tests__/browser-environment.cjs */
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import {
  deferred,
  fetchBody,
  fetchCall,
  jsonField,
  reply,
  signal,
  within,
} from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const TEST_ANON_KEY = `ak-${testAccessToken('00000000-0000-0000-0000-000000000001', {
  role: 'anon',
})}`;

function callbackRedirectURL(): string {
  return `${window.location.origin}/auth/callback`;
}

describe('VolcanoAuth', () => {
  describe('Authentication - managed auth redirect (URL hash adoption)', () => {
    // These run under jsdom, so drive the real window/location/history.
    const NONCE = 'rp-nonce-abc123';
    // Simulate signInWithHostedAuth()/signInWithOAuth() having stored the
    // one-time nonce in sessionStorage before the redirect.
    const seedNonce = (nonce = NONCE) => {
      window.sessionStorage.setItem('volcano_auth_state', nonce);
    };

    afterEach(() => {
      window.history.replaceState(null, '', '/');
      window.sessionStorage.clear();
    });

    it.each(['', 42])('uses stored credentials when an explicit token is %p', (accessToken) => {
      window.localStorage.setItem('volcano_access_token', 'stored-access');
      window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
      const sdk: unknown = Reflect.construct(VolcanoAuth, [
        { anonKey: 'ak-test-key', accessToken },
      ]);
      if (!(sdk instanceof VolcanoAuth)) {
        throw new TypeError('Expected a VolcanoAuth instance');
      }

      expect(sdk.accessToken).toBe('stored-access');
      expect(sdk.refreshToken).toBe('stored-refresh');
    });

    it('adopts the session from the URL fragment at construction, persists it, and strips the hash', () => {
      seedNonce();
      window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
      const replaceSpy = jest.spyOn(window.history, 'replaceState');

      // Construction alone must establish the session (no getUser needed).
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      expect(v.accessToken).toBe('hash-access');
      expect(v.refreshToken).toBe('hash-refresh');
      expect(localStorage.getItem('volcano_access_token')).toBe('hash-access');
      expect(localStorage.getItem('volcano_refresh_token')).toBe('hash-refresh');
      // Tokens were removed from the URL immediately.
      expect(replaceSpy).toHaveBeenCalled();
      expect(window.location.hash).toBe('');
      // The one-time nonce was consumed.
      expect(window.sessionStorage.getItem('volcano_auth_state')).toBeNull();
      replaceSpy.mockRestore();
    });

    it('lets an authenticated request use the adopted session without calling getUser() first', async () => {
      seedNonce();
      window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      // No getUser() call — go straight to an authenticated operation.
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-redirect', email: 'r@example.com', status: 'active' },
        }),
      );
      const result = await v.auth.updateUser({ metadata: { ok: true } });

      expect(result.error).toBeNull();
      expect(result.user?.id).toBe('user-redirect');
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/user'),
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({ Authorization: 'Bearer hash-access' }),
        }),
      );
    });

    it('falls back to adopting the session on getUser() when the URL changes after construction', async () => {
      // Nonce was stored before navigating to the hosted page; it persists in
      // sessionStorage across the redirect back.
      seedNonce();
      // Client constructed before the redirect fragment exists.
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      expect(v.accessToken).toBeFalsy();

      const callback = jest.fn();
      v.auth.onAuthStateChange(callback);
      callback.mockClear(); // ignore any initial emission on subscribe

      // Fragment appears later (e.g. SPA navigation back from the hosted page).
      window.location.hash = `#access_token=late-access&refresh_token=late-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-late', email: 'fixture@example.com', status: 'active' },
        }),
      );

      const result = await v.auth.getUser();
      expect(result.user?.id).toBe('user-late');
      expect(v.accessToken).toBe('late-access');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-late' }));
    });

    it('fires onAuthStateChange once on the first getUser() after construction-time adoption', async () => {
      seedNonce();
      // Fragment present at load → the session is adopted in the constructor,
      // before any listener can subscribe (the common SPA hosted-redirect path).
      window.location.hash = `#access_token=ctor-access&refresh_token=ctor-refresh&token_type=bearer&expires_in=3600&state=${NONCE}`;
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      expect(v.accessToken).toBe('ctor-access');

      const callback = jest.fn();
      v.auth.onAuthStateChange(callback);
      // Immediate emission on subscribe reflects the not-yet-fetched user.
      expect(callback).toHaveBeenLastCalledWith(null);
      callback.mockClear();

      fetchMock.mockImplementation(() =>
        Promise.resolve(
          reply(200, { user: { id: 'user-ctor', email: 'c@example.com', status: 'active' } }),
        ),
      );

      // First getUser() announces the SIGNED_IN transition for the adoption that
      // happened at construction.
      await v.auth.getUser();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-ctor' }));

      // Subsequent getUser() calls must not re-fire the adoption callback.
      await v.auth.getUser();
      expect(callback).toHaveBeenCalledTimes(1);
    });

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

    it('adopts the URL session only once even when the preserved hash keeps tokens around', async () => {
      seedNonce();
      // App params keep the hash (and thus the tokens) in the URL after adoption.
      window.location.hash = `#access_token=hash-access&refresh_token=hash-refresh&state=${NONCE}&app_view=billing`;
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      const callback = jest.fn();
      v.auth.onAuthStateChange(callback);
      callback.mockClear(); // ignore the initial emission on subscribe

      // The session was already consumed at construction, so the first getUser()
      // announces that adoption exactly once; repeated getUser() calls must not
      // re-adopt or re-fire the auth callback even though the tokens are still
      // present in window.location.hash.
      fetchMock.mockImplementation(() =>
        Promise.resolve(
          reply(200, {
            user: { id: 'user-once', email: 'once@example.com', status: 'active' },
          }),
        ),
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
  });

  describe('Authentication - hosted auth / OAuth initiation (RP nonce)', () => {
    afterEach(() => {
      window.sessionStorage.clear();
    });

    it('generates a random state nonce and stores it without a redirect URL by default', () => {
      const sdk = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const nonce = sdk._generateAuthStateNonce();

      expect(nonce).toMatch(/^[\da-f]{32}$/);
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
      expect(new URL(transportRedirectUrl ?? '').searchParams.get('vh_state')).toBe(nonce);
      expect(window.sessionStorage.getItem('volcano_auth_state')).toBe(nonce);
      const storedRedirectUrl = window.sessionStorage.getItem('volcano_auth_redirect_url');
      expect(storedRedirectUrl).toBeTruthy();
      expect(new URL(storedRedirectUrl ?? '').searchParams.get('vh_state')).toBeNull();
    });

    it('preserves the registered redirect query encoding when adding transport state', () => {
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const redirectTo = 'https://app.test/auth/callback?z=hello%20world&a=%21';

      const oauthUrl = v.auth.signInWithOAuth('google', { redirectTo });
      const parsed = new URL(oauthUrl);
      const nonce = parsed.searchParams.get('client_state');

      expect(parsed.searchParams.get('redirect_url')).toBe(`${redirectTo}&vh_state=${nonce ?? ''}`);
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
  });

  describe('Authentication - OAuth authorization code exchange', () => {
    afterEach(() => {
      window.history.replaceState(null, '', '/');
      window.sessionStorage.clear();
    });

    it('exchanges a callback when an empty explicit token supplies no session', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
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
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');

      const sdk = new VolcanoAuth({ anonKey: 'ak-test-key', accessToken: 'server-access' });
      await within(sdk._completeOAuthExchange(), 'explicit-token OAuth bypass');

      expect(fetchMock).not.toHaveBeenCalled();
      expect(sdk.accessToken).toBe('server-access');
      expect(window.location.search).toBe('?code=one-time-code&state=oauth-nonce');
    });

    it('discards a successful code exchange after another session wins', async () => {
      const response = deferred<Response>();
      const requestStarted = signal();
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      fetchMock.mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      await within(requestStarted.promise, 'OAuth exchange request');
      v._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
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
      const response = deferred<Response>();
      const requestStarted = signal();
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      fetchMock.mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      await within(requestStarted.promise, 'OAuth exchange request');
      v._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
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

    it('exchanges a matching one-time callback code and strips it from the URL', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            expires_in: 3600,
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          }),
        )
        .mockResolvedValueOnce(
          reply(200, {
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          }),
        );

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
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      const storageSetItem: unknown = Reflect.get(localStorage, 'setItem');
      if (!jest.isMockFunction(storageSetItem)) {
        throw new TypeError('Expected mocked browser storage');
      }
      storageSetItem.mockImplementationOnce(() => {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      });
      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            expires_in: 3600,
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          }),
        )
        .mockResolvedValueOnce(
          reply(200, {
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          }),
        );

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
      expect(result.error).toBeNull();
      expect(v.accessToken).toBe('oauth-access');
      expect(v.refreshToken).toBe('oauth-refresh');
    });

    it('matches callback URLs after equivalent browser query serialization', async () => {
      const storedRedirectURL = `${window.location.origin}/auth/callback?return_to=hello%20world`;
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', storedRedirectURL);
      window.history.replaceState(
        null,
        '',
        '/auth/callback?return_to=hello+world&code=one-time-code&state=oauth-nonce',
      );
      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          reply(200, {
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          }),
        );

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
      expect(jsonField(fetchCall(0)[1], 'redirect_url')).toBe(storedRedirectURL);
      expect(window.location.search).toBe('?return_to=hello+world');
    });

    it('accepts and scrubs optional provider response metadata', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(
        null,
        '',
        '/auth/callback?code=one-time-code&state=oauth-nonce&iss=https%3A%2F%2Fissuer.test',
      );
      fetchMock
        .mockResolvedValueOnce(
          reply(200, {
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            expires_in: 3600,
          }),
        )
        .mockResolvedValueOnce(
          reply(200, {
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          }),
        );

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result.error).toBeNull();
      expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
      expect(window.location.search).toBe('');
    });

    it('rejects a callback whose state does not match without exchanging it', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'expected');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=attacker');

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
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' }));

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const apiResult = await v.auth.getUser();
      const initializeResult = await v.initialize();

      expect(apiResult.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(initializeResult.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(v._oauthExchangeError).toBeNull();
    });

    it('leaves unrelated code and state query parameters untouched', async () => {
      window.history.replaceState(null, '', '/checkout?code=promo&state=selected');

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result).toEqual({ user: null, error: null });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?code=promo&state=selected');
    });

    it('leaves another integration callback untouched when a stale nonce exists', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'abandoned-volcano-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/stripe/callback?code=stripe-code&state=stripe-state');

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result).toEqual({ user: null, error: null });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?code=stripe-code&state=stripe-state');
      expect(window.sessionStorage.getItem('volcano_auth_state')).toBe('abandoned-volcano-nonce');
    });

    it('surfaces a provider-denied callback and clears its one-time context', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(
        null,
        '',
        '/auth/callback?error=access_denied&error_description=Sign-in%20cancelled&state=oauth-nonce',
      );

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
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      fetchMock
        .mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' }))
        .mockResolvedValueOnce(
          reply(200, {
            access_token: 'signed-in-access',
            refresh_token: 'signed-in-refresh',
            user: { id: 'signed-in-user', email: 'signed-in@example.com', status: 'active' },
            expires_in: 3600,
          }),
        );

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const failed = await v.initialize();
      expect(failed.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );

      const signedIn = await v.auth.signIn({
        email: 'signed-in@example.com',
        password: 'valid-password',
      });

      expect(signedIn.error).toBeNull();
      expect(v._oauthExchangeError).toBeNull();
    });

    it('surfaces a failed fresh exchange instead of hiding it behind a stored session', async () => {
      window.localStorage.setItem('volcano_access_token', 'stored-access');
      window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      fetchMock
        .mockResolvedValueOnce(reply(400, { error: 'invalid authorization code' }))
        .mockResolvedValueOnce(
          reply(200, {
            user: { id: 'stored-user', email: 'stored@example.com', status: 'active' },
          }),
        );

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const failed = await v.initialize();

      expect(failed.user).toBeNull();
      expect(failed.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const recovered = await v.initialize();
      expect(recovered).toEqual({
        user: { id: 'stored-user', email: 'stored@example.com', status: 'active' },
        error: null,
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('refreshes a valid stored session after an OAuth provider denial', async () => {
      window.localStorage.setItem('volcano_access_token', sessionToken());
      window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?error=access_denied&state=oauth-nonce');
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

    it('waits for code exchange before refreshing the resulting session', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      const exchange = deferred<Response>();
      const requestStarted = signal();
      fetchMock
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return exchange.promise;
        })
        .mockResolvedValueOnce(
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
      exchange.resolve(
        reply(200, {
          access_token: 'oauth-access',
          refresh_token: 'oauth-refresh',
          user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

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

    it('waits for an in-flight exchange before signing out', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      const exchange = deferred<Response>();
      const requestStarted = signal();
      fetchMock
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return exchange.promise;
        })
        .mockResolvedValueOnce(reply(200, {}));

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const signOut = v.auth.signOut();

      await within(requestStarted.promise, 'OAuth exchange request');
      expect(fetchMock).toHaveBeenCalledTimes(1);
      exchange.resolve(
        reply(200, {
          access_token: 'oauth-access',
          refresh_token: 'oauth-refresh',
          user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      await expect(within(signOut, 'OAuth sign-out')).resolves.toEqual({ error: null });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(v.accessToken).toBeNull();
      expect(v.refreshToken).toBeNull();
      expect(v._oauthExchangeError).toBeNull();
    });

    it('waits for code exchange before checking storage authentication', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      const exchange = deferred<Response>();
      const requestStarted = signal();
      fetchMock
        .mockImplementationOnce(() => {
          requestStarted.resolve();
          return exchange.promise;
        })
        .mockResolvedValueOnce(
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
      exchange.resolve(
        reply(200, {
          access_token: 'oauth-access',
          refresh_token: 'oauth-refresh',
          user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
          expires_in: 3600,
        }),
      );

      await expect(within(visibility, 'OAuth storage visibility')).resolves.toEqual(
        expect.objectContaining({ error: null }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses the anon key after a failed code exchange without clearing the auth error', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
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
      expect(initialization.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });
  });
});
