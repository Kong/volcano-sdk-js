const { sessionToken } = require('./session-fixtures.ts');
const { AuthSessionChangedError, VolcanoAuth } = require('../src/index.js');

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createTestJwtToken(projectId, extraClaims = {}) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64UrlEncode(JSON.stringify({ project_id: projectId, ...extraClaims }));
  return `${header}.${payload}.test-signature`;
}

const TEST_ACCESS_TOKEN_PROJECT_A = createTestJwtToken('00000000-0000-0000-0000-000000000001');
const TEST_ACCESS_TOKEN_PROJECT_B = createTestJwtToken('00000000-0000-0000-0000-000000000002');
const TEST_ACCESS_TOKEN_SHARED = createTestJwtToken('00000000-0000-0000-0000-000000000010');
const TEST_ACCESS_TOKEN_SHARED_TWO = createTestJwtToken('00000000-0000-0000-0000-000000000011');
const TEST_ACCESS_TOKEN = TEST_ACCESS_TOKEN_PROJECT_A;
const TEST_ANON_KEY = `ak-${createTestJwtToken('00000000-0000-0000-0000-000000000001', {
  role: 'anon',
})}`;

describe('VolcanoAuth', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano;

  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('Authentication - managed auth redirect (URL hash adoption)', () => {
    // These run under jsdom, so drive the real window/location/history.
    const NONCE = 'rp-nonce-abc123';
    // Simulate signInWithHostedAuth()/signInWithOAuth() having stored the
    // one-time nonce in sessionStorage before the redirect.
    const seedNonce = (nonce = NONCE) => window.sessionStorage.setItem('volcano_auth_state', nonce);

    afterEach(() => {
      try {
        window.history.replaceState(null, '', '/');
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });

    it('adopts the session from the URL fragment at construction, persists it, and strips the hash', () => {
      seedNonce();
      window.location.hash =
        '#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=' +
        NONCE;
      const replaceSpy = jest.spyOn(window.history, 'replaceState');

      // Construction alone must establish the session (no getUser needed).
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      expect(v.accessToken).toBe('hash-access');
      expect(v.refreshToken).toBe('hash-refresh');
      expect(localStorage.store['volcano_access_token']).toBe('hash-access');
      expect(localStorage.store['volcano_refresh_token']).toBe('hash-refresh');
      // Tokens were removed from the URL immediately.
      expect(replaceSpy).toHaveBeenCalled();
      expect(window.location.hash).toBe('');
      // The one-time nonce was consumed.
      expect(window.sessionStorage.getItem('volcano_auth_state')).toBeNull();
      replaceSpy.mockRestore();
    });

    it('lets an authenticated request use the adopted session without calling getUser() first', async () => {
      seedNonce();
      window.location.hash =
        '#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=' +
        NONCE;
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      // No getUser() call — go straight to an authenticated operation.
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-redirect', email: 'r@example.com', status: 'active' },
          }),
      });
      const result = await v.auth.updateUser({ metadata: { ok: true } });

      expect(result.error).toBeNull();
      expect(result.user.id).toBe('user-redirect');
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
      window.location.hash =
        '#access_token=late-access&refresh_token=late-refresh&token_type=bearer&expires_in=3600&state=' +
        NONCE;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-late', email: 'fixture@example.com', status: 'active' },
          }),
      });

      const result = await v.auth.getUser();
      expect(result.user.id).toBe('user-late');
      expect(v.accessToken).toBe('late-access');
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-late' }));
    });

    it('fires onAuthStateChange once on the first getUser() after construction-time adoption', async () => {
      seedNonce();
      // Fragment present at load → the session is adopted in the constructor,
      // before any listener can subscribe (the common SPA hosted-redirect path).
      window.location.hash =
        '#access_token=ctor-access&refresh_token=ctor-refresh&token_type=bearer&expires_in=3600&state=' +
        NONCE;
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      expect(v.accessToken).toBe('ctor-access');

      const callback = jest.fn();
      v.auth.onAuthStateChange(callback);
      // Immediate emission on subscribe reflects the not-yet-fetched user.
      expect(callback).toHaveBeenLastCalledWith(null);
      callback.mockClear();

      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ user: { id: 'user-ctor', email: 'c@example.com', status: 'active' } }),
      });

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
      expect(localStorage.store['volcano_access_token']).toBeUndefined();
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
      localStorage.store['volcano_refresh_token'] = 'stale-stored-refresh';
      // The redirect fragment carries a fresh access token but NO refresh token.
      window.location.hash =
        '#access_token=fresh-access&token_type=bearer&expires_in=3600&state=' + NONCE;

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      // The redirect session takes precedence: the stale refresh token is not
      // adopted and is purged so it can't refresh into the previous account.
      expect(v.accessToken).toBe('fresh-access');
      expect(v.refreshToken).toBeNull();
      expect(localStorage.store['volcano_refresh_token']).toBeUndefined();
      expect(localStorage.removeItem).toHaveBeenCalledWith('volcano_refresh_token');
    });

    it('strips the fragment cleanly when only auth params (incl. state) are present', () => {
      seedNonce();
      window.location.hash =
        '#access_token=hash-access&refresh_token=hash-refresh&token_type=bearer&expires_in=3600&state=' +
        NONCE;
      const replaceSpy = jest.spyOn(window.history, 'replaceState');

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      expect(v.accessToken).toBe('hash-access');
      expect(replaceSpy).toHaveBeenCalled();
      expect(window.location.hash).toBe('');
      replaceSpy.mockRestore();
    });

    it('leaves the fragment intact when an unknown app param rides alongside the tokens', () => {
      seedNonce();
      window.location.hash =
        '#access_token=hash-access&refresh_token=hash-refresh&state=' + NONCE + '&app_view=billing';

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      // Session is still adopted, but the fragment is preserved so we never
      // clobber an app's own hash state/routing.
      expect(v.accessToken).toBe('hash-access');
      expect(window.location.hash).toBe(
        '#access_token=hash-access&refresh_token=hash-refresh&state=' + NONCE + '&app_view=billing',
      );
    });

    it('adopts the URL session only once even when the preserved hash keeps tokens around', async () => {
      seedNonce();
      // App params keep the hash (and thus the tokens) in the URL after adoption.
      window.location.hash =
        '#access_token=hash-access&refresh_token=hash-refresh&state=' + NONCE + '&app_view=billing';
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });

      const callback = jest.fn();
      v.auth.onAuthStateChange(callback);
      callback.mockClear(); // ignore the initial emission on subscribe

      // The session was already consumed at construction, so the first getUser()
      // announces that adoption exactly once; repeated getUser() calls must not
      // re-adopt or re-fire the auth callback even though the tokens are still
      // present in window.location.hash.
      global.fetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-once', email: 'once@example.com', status: 'active' },
          }),
      });

      await v.auth.getUser();
      await v.auth.getUser();
      await v.auth.getUser();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-once' }));
      expect(window.location.hash).toBe(
        '#access_token=hash-access&refresh_token=hash-refresh&state=' + NONCE + '&app_view=billing',
      );
      expect(v.accessToken).toBe('hash-access');
    });
  });

  describe('Authentication - hosted auth / OAuth initiation (RP nonce)', () => {
    afterEach(() => {
      try {
        window.sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });

    it('getHostedAuthUrl stores a nonce and includes it as state with anon_key', () => {
      // anonKey must be a JWT carrying project_id for projectId derivation.
      const anonKey = createTestJwtToken('11111111-1111-1111-1111-111111111111');
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
      expect(new URL(transportRedirectUrl).searchParams.get('vh_state')).toBe(nonce);
      expect(window.sessionStorage.getItem('volcano_auth_state')).toBe(nonce);
      const storedRedirectUrl = window.sessionStorage.getItem('volcano_auth_redirect_url');
      expect(storedRedirectUrl).toBeTruthy();
      expect(new URL(storedRedirectUrl).searchParams.get('vh_state')).toBeNull();
    });

    it('preserves the registered redirect query encoding when adding transport state', () => {
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const redirectTo = 'https://app.test/auth/callback?z=hello%20world&a=%21';

      const oauthUrl = v.auth.signInWithOAuth('google', { redirectTo });
      const parsed = new URL(oauthUrl);
      const nonce = parsed.searchParams.get('client_state');

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
  });

  describe('Authentication - OAuth authorization code exchange', () => {
    const callbackRedirectURL = () => `${window.location.origin}/auth/callback`;

    afterEach(() => {
      window.history.replaceState(null, '', '/');
      window.sessionStorage.clear();
    });

    it('discards a successful code exchange after another session wins', async () => {
      const response = createDeferred();
      const requestStarted = createDeferred();
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      global.fetch.mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      await requestStarted.promise;
      v._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'stale-access',
            refresh_token: 'stale-refresh',
            user: { id: 'stale-user', email: 'fixture@example.com', status: 'active' },
            expires_in: 3600,
          }),
      });

      await v._completeOAuthExchange();

      expect(v.accessToken).toBe('replacement-access');
      expect(v.currentUser).toEqual({
        id: 'replacement-user',
        email: 'fixture@example.com',
        status: 'active',
      });
      expect(v._oauthExchangeError).toBeNull();
    });

    it('does not retain a stale code exchange failure after another session wins', async () => {
      const response = createDeferred();
      const requestStarted = createDeferred();
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      global.fetch.mockImplementationOnce(() => {
        requestStarted.resolve();
        return response.promise;
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      await requestStarted.promise;
      v._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve({
        ok: false,
        json: () => Promise.resolve({ error: 'stale exchange failed' }),
      });

      await v._completeOAuthExchange();

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
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'oauth-access',
              refresh_token: 'oauth-refresh',
              expires_in: 3600,
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            }),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
      expect(v.accessToken).toBe('oauth-access');
      expect(window.location.search).toBe('');
      expect(global.fetch.mock.calls[0][0]).toBe('https://api.test.com/auth/oauth/exchange');
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
        code: 'one-time-code',
        redirect_url: callbackRedirectURL(),
      });
    });

    it('keeps the exchanged session in memory when browser storage is unavailable', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      localStorage.setItem.mockImplementationOnce(() => {
        throw new DOMException('Storage is unavailable', 'SecurityError');
      });
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'oauth-access',
              refresh_token: 'oauth-refresh',
              expires_in: 3600,
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            }),
        });

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
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'oauth-access',
              refresh_token: 'oauth-refresh',
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
              expires_in: 3600,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            }),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result.user).toEqual(expect.objectContaining({ id: 'oauth-user' }));
      expect(JSON.parse(global.fetch.mock.calls[0][1].body).redirect_url).toBe(storedRedirectURL);
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
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'oauth-access',
              refresh_token: 'oauth-refresh',
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
              expires_in: 3600,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            }),
        });

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
      expect(global.fetch).not.toHaveBeenCalled();
      expect(window.location.search).toBe('');
    });

    it('reports a settled callback error after another API call awaited the exchange', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'invalid authorization code' }),
      });

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
      expect(global.fetch).not.toHaveBeenCalled();
      expect(window.location.search).toBe('?code=promo&state=selected');
    });

    it('leaves another integration callback untouched when a stale nonce exists', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'abandoned-volcano-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/stripe/callback?code=stripe-code&state=stripe-state');

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.initialize();

      expect(result).toEqual({ user: null, error: null });
      expect(global.fetch).not.toHaveBeenCalled();
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
      expect(global.fetch).not.toHaveBeenCalled();
      expect(window.location.search).toBe('');
      expect(window.sessionStorage.getItem('volcano_auth_state')).toBeNull();
      expect(window.sessionStorage.getItem('volcano_auth_redirect_url')).toBeNull();
    });

    it('clears a previous exchange error when a later sign-in succeeds', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'invalid authorization code' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'signed-in-access',
              refresh_token: 'signed-in-refresh',
              user: { id: 'signed-in-user', email: 'signed-in@example.com', status: 'active' },
              expires_in: 3600,
            }),
        });

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
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'invalid authorization code' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'stored-user', email: 'stored@example.com', status: 'active' },
            }),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const failed = await v.initialize();

      expect(failed.user).toBeNull();
      expect(failed.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);

      const recovered = await v.initialize();
      expect(recovered).toEqual({
        user: { id: 'stored-user', email: 'stored@example.com', status: 'active' },
        error: null,
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('refreshes a valid stored session after an OAuth provider denial', async () => {
      window.localStorage.setItem('volcano_access_token', sessionToken());
      window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?error=access_denied&state=oauth-nonce');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: sessionToken(undefined, true),
            refresh_token: 'refreshed-refresh',
            expires_in: 3600,
            user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
          }),
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.auth.refreshSession();

      expect(result).toEqual(
        expect.objectContaining({
          session: expect.objectContaining({ access_token: sessionToken(undefined, true) }),
          error: null,
        }),
      );
      expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({
        refresh_token: 'stored-refresh',
      });
      expect(v._oauthExchangeError).toBeNull();
    });

    it('waits for code exchange before refreshing the resulting session', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      let resolveExchange;
      global.fetch
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveExchange = resolve;
            }),
        )
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'refreshed-access',
              refresh_token: 'refreshed-refresh',
              user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
              expires_in: 3600,
            }),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const refresh = v.auth.refreshSession();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      resolveExchange({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            expires_in: 3600,
          }),
      });

      await expect(refresh).resolves.toEqual(
        expect.objectContaining({
          session: expect.objectContaining({ access_token: 'refreshed-access' }),
          error: null,
        }),
      );
      expect(JSON.parse(global.fetch.mock.calls[1][1].body)).toEqual({
        refresh_token: 'oauth-refresh',
      });
    });

    it('waits for an in-flight exchange before signing out', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      let resolveExchange;
      global.fetch
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveExchange = resolve;
            }),
        )
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({}),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const signOut = v.auth.signOut();

      expect(global.fetch).toHaveBeenCalledTimes(1);
      resolveExchange({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            expires_in: 3600,
          }),
      });

      await expect(signOut).resolves.toEqual({ error: null });
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(v.accessToken).toBeNull();
      expect(v.refreshToken).toBeNull();
      expect(v._oauthExchangeError).toBeNull();
    });

    it('waits for code exchange before checking storage authentication', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=one-time-code&state=oauth-nonce');
      let resolveExchange;
      global.fetch
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveExchange = resolve;
            }),
        )
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'object-1',
              bucket_id: 'bucket-1',
              name: 'avatar.png',
              is_public: true,
              size: 4,
              mime_type: 'image/png',
            }),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const visibility = v.storage.from('avatars').updateVisibility('avatar.png', true);

      expect(global.fetch).toHaveBeenCalledTimes(1);
      resolveExchange({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'oauth-access',
            refresh_token: 'oauth-refresh',
            user: { id: 'oauth-user', email: 'oauth@example.com', status: 'active' },
            expires_in: 3600,
          }),
      });

      await expect(visibility).resolves.toEqual(expect.objectContaining({ error: null }));
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('uses the anon key after a failed code exchange without clearing the auth error', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'invalid authorization code' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'public-function',
              function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
              invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: {},
          json: () => Promise.resolve({ submitted: true }),
        });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: TEST_ANON_KEY });
      const result = await v.functions.invoke('public-function');
      const initialization = await v.initialize();

      expect(result).toEqual(expect.objectContaining({ data: { submitted: true }, error: null }));
      expect(initialization.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('Functions', () => {
    describe('local mode invoke fallback', () => {
      it('positive: resolves by name and invokes via direct API path', async () => {
        const localVolcano = new VolcanoAuth({
          apiUrl: 'http://127.0.0.1:8000',
          anonKey: 'ak-test-anon-key',
        });
        localVolcano.accessToken = TEST_ACCESS_TOKEN;

        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'notes-summary',
              function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              cache_ttl_seconds: 300,
            }),
        });
        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });

        const result = await localVolcano.functions.invoke('notes-summary', {
          limit: 5,
        });

        expect(result.error).toBeNull();
        expect(fetch).toHaveBeenNthCalledWith(
          1,
          'http://127.0.0.1:8000/functions/resolve?name=notes-summary',
          expect.objectContaining({ method: 'GET' }),
        );
        expect(fetch).toHaveBeenNthCalledWith(
          2,
          'http://127.0.0.1:8000/functions/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/invoke',
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ payload: { limit: 5 } }),
          }),
        );
      });

      it('negative: returns function not found when local resolve returns 404', async () => {
        const localVolcano = new VolcanoAuth({
          apiUrl: 'http://localhost:8000',
          anonKey: 'ak-test-anon-key',
        });
        localVolcano.accessToken = TEST_ACCESS_TOKEN;

        global.fetch.mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'Function not found' }),
        });

        const result = await localVolcano.functions.invoke('missing-function', {});

        expect(result.data).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error.message.toLowerCase()).toBe('function not found');
        expect(fetch).toHaveBeenCalledTimes(1);
      });

      it('negative: fails when local resolve response has invalid function_id', async () => {
        const localVolcano = new VolcanoAuth({
          apiUrl: 'http://localhost:8000',
          anonKey: 'ak-test-anon-key',
        });
        localVolcano.accessToken = TEST_ACCESS_TOKEN;

        global.fetch.mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'notes-summary',
              function_id: 'INVALID-ID',
              cache_ttl_seconds: 300,
            }),
        });

        const result = await localVolcano.functions.invoke('notes-summary', {});

        expect(result.data).toBeNull();
        expect(result.error).toBeDefined();
        expect(result.error.message).toBe('Resolve response missing valid function_id');
        expect(fetch).toHaveBeenCalledTimes(1);
      });
    });

    it('should reject invocation when access token is not a JWT', async () => {
      volcano.accessToken = 'not-a-jwt-token';

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('accessToken must be a JWT with project_id claim');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should send the fixed local anon key to the function resolver', async () => {
      const localAnonKey = 'ak-0000000000000000000000000000000000000000';
      const anonymousVolcano = new VolcanoAuth({
        apiUrl: 'http://localhost:8000',
        anonKey: localAnonKey,
      });
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Function not found' }),
      });

      const { data, error } = await anonymousVolcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toEqual(expect.objectContaining({ message: 'Function not found' }));
      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:8000/functions/resolve?name=my-function',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: `Bearer ${localAnonKey}` }),
        }),
      );
    });

    it('should reject invocation when JWT is missing project_id claim', async () => {
      const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
      const payload = base64UrlEncode(JSON.stringify({ sub: 'user-123' }));
      volcano.accessToken = `${header}.${payload}.test-signature`;

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('accessToken missing project_id claim');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject resolver responses without valid cache_ttl_seconds', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
          }),
      });

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('Resolve response missing valid cache_ttl_seconds');
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should handle server errors gracefully', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
    });

    it('should handle rate limit errors', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Rate limit exceeded' }),
      });

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
    });

    it('should passthrough a non-2xx the function itself returned', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
            cache_ttl_seconds: 300,
          }),
      });
      // The dispatch marker is what makes this the function's answer. The
      // version stamp alone cannot: the server puts it on every response,
      // including the ones it refuses before the function runs.
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        headers: {
          get: (name) =>
            ({
              'x-volcano-version': 'staging-xyz',
              'content-type': 'application/json',
              'x-volcano-function-invoked': 'true',
            })[name?.toLowerCase()] ?? null,
          forEach: (callback) => {
            callback('staging-xyz', 'x-volcano-version');
            callback('application/json', 'content-type');
            callback('true', 'x-volcano-function-invoked');
          },
        },
        json: () => Promise.resolve({ error: 'payment required' }),
      });

      const { data, status, headers, version, error } = await volcano.functions.invoke(
        'my-function',
        {},
      );

      expect(error).toBeNull();
      expect(status).toBe(402);
      expect(version).toBe('staging-xyz');
      expect(headers['x-volcano-version']).toBe('staging-xyz');
      expect(data).toEqual({ error: 'payment required' });
    });
    it('should cache name-to-id resolution and skip repeated resolve calls', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
              invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'ok' }),
        });

      const first = await volcano.functions.invoke('my-function', {});
      const second = await volcano.functions.invoke('my-function', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should cache missing-function resolve failures and avoid repeated lookups', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'function not found' }),
      });

      const first = await volcano.functions.invoke('missing-function', {});
      const second = await volcano.functions.invoke('missing-function', {});

      expect(first.data).toBeNull();
      expect(second.data).toBeNull();
      expect(first.error).toBeDefined();
      expect(second.error).toBeDefined();
      expect(first.error.message).toBe('function not found');
      expect(second.error.message).toBe('function not found');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/functions/resolve?name=missing-function',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should return resolver auth errors and never call invoke endpoint', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'invalid token' }),
      });

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('Session expired');
      expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN);
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should return a function-owned 404 without invoking twice', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '11111111-1111-1111-1111-111111111111',
              invoke_url: 'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          // What the server sends once a function has run: the dispatch marker
          // alongside the version stamp every response carries.
          headers: {
            get: (name) =>
              ({ 'x-volcano-version': 'v1', 'x-volcano-function-invoked': 'true' })[
                name.toLowerCase()
              ] ?? null,
          },
          json: () => Promise.resolve({ error: 'no such route' }),
        });

      const { status, version, error } = await volcano.functions.invoke('my-function', {});

      expect(error).toBeNull();
      expect(status).toBe(404);
      expect(version).toBe('v1');
      // Resolve plus one invocation: a retry would run the caller's function twice.
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should invalidate stale function ID mapping on invoke 404 and retry with fresh resolve', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '11111111-1111-1111-1111-111111111111',
              invoke_url: 'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          // A platform 404 still carries the version stamp — every response
          // does. Only the dispatch marker is missing, and keying the retry on
          // the version header instead would never fire against a real server.
          headers: { get: (name) => (name.toLowerCase() === 'x-volcano-version' ? 'v1' : null) },
          json: () => Promise.resolve({ error: 'function not found' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '22222222-2222-2222-2222-222222222222',
              invoke_url: 'https://22222222-2222-2222-2222-222222222222.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'recovered' }),
        });

      const { data, error } = await volcano.functions.invoke('my-function', { action: 'retry' });

      expect(error).toBeNull();
      expect(data).toEqual({ result: 'recovered' });
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://22222222-2222-2222-2222-222222222222.functions.test.run/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ payload: { action: 'retry' } }),
        }),
      );
    });

    it('should fail after stale ID invalidation when second resolve is still missing', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '11111111-1111-1111-1111-111111111111',
              invoke_url: 'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'function not found' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'function not found' }),
        });

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('function not found');
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://11111111-1111-1111-1111-111111111111.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('should share resolver cache across instances with the same server-side token', async () => {
      jest.clearAllMocks();
      const sharedToken = TEST_ACCESS_TOKEN_SHARED;
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
              invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValue({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'ok' }),
        });

      const first = await instanceA.functions.invoke('my-function', { call: 1 });
      const second = await instanceB.functions.invoke('my-function', { call: 2 });

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(3);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(localStorage.getItem).not.toHaveBeenCalled();
    });

    it('should isolate resolver cache across different auth scopes', async () => {
      jest.clearAllMocks();
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: TEST_ACCESS_TOKEN_PROJECT_A,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: TEST_ACCESS_TOKEN_PROJECT_B,
      });

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'shared-name',
              function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              invoke_url: 'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'from-a' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'shared-name',
              function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              invoke_url: 'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'from-b' }),
        });

      const a = await instanceA.functions.invoke('shared-name', {});
      const b = await instanceB.functions.invoke('shared-name', {});

      expect(a.error).toBeNull();
      expect(b.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=shared-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=shared-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should isolate resolver cache for different tokens in the same project', async () => {
      jest.clearAllMocks();
      const tokenOne = createTestJwtToken('00000000-0000-0000-0000-0000000000aa', { sid: 'one' });
      const tokenTwo = createTestJwtToken('00000000-0000-0000-0000-0000000000aa', { sid: 'two' });

      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: tokenOne,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: tokenTwo,
      });

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'same-name',
              function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              invoke_url: 'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'token-one' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'same-name',
              function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              invoke_url: 'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'token-two' }),
        });

      const first = await instanceA.functions.invoke('same-name', {});
      const second = await instanceB.functions.invoke('same-name', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=same-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=same-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should not reuse resolver cache after auth token changes on the same instance', async () => {
      jest.clearAllMocks();
      volcano.accessToken = TEST_ACCESS_TOKEN_PROJECT_A;

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
              invoke_url: 'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'from-a' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
              invoke_url: 'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'from-b' }),
        });

      const first = await volcano.functions.invoke('my-function', {});
      volcano.accessToken = TEST_ACCESS_TOKEN_PROJECT_B;
      const second = await volcano.functions.invoke('my-function', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(fetch).toHaveBeenCalledTimes(4);
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.run/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should isolate auth context while deduping resolve requests across instances', async () => {
      jest.clearAllMocks();
      const sharedToken = TEST_ACCESS_TOKEN_SHARED_TWO;
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });

      let resolveCalls = 0;
      let releaseResolve;
      const resolveGate = new Promise((resolve) => {
        releaseResolve = resolve;
      });

      global.fetch.mockImplementation(async (url) => {
        const requestUrl = String(url);
        if (requestUrl === 'https://api.test.com/functions/resolve?name=my-function') {
          resolveCalls += 1;
          await resolveGate;
          return {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                name: 'my-function',
                function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
                invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
                cache_ttl_seconds: 300,
              }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'ok' }),
        };
      });

      const invokeA = instanceA.functions.invoke('my-function', { call: 'a' });
      const invokeB = instanceB.functions.invoke('my-function', { call: 'b' });
      await Promise.resolve();
      instanceA._setSession({
        access_token: TEST_ACCESS_TOKEN_PROJECT_B,
        refresh_token: 'refresh-token-b',
        user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
      });
      releaseResolve();
      const [resultA, resultB] = await Promise.all([invokeA, invokeB]);

      expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
      expect(resultB.error).toBeNull();
      expect(resolveCalls).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should validate each caller when a shared resolve request fails', async () => {
      jest.clearAllMocks();
      const sharedToken = TEST_ACCESS_TOKEN_SHARED_TWO;
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
      });

      const resolveStarted = createDeferred();
      const resolveGate = createDeferred();
      global.fetch.mockImplementationOnce(async () => {
        resolveStarted.resolve();
        await resolveGate.promise;
        return {
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'Function not found' }),
        };
      });

      const invokeA = instanceA.functions.invoke('missing-function');
      const invokeB = instanceB.functions.invoke('missing-function');
      await resolveStarted.promise;
      instanceA._setSession({
        access_token: TEST_ACCESS_TOKEN_PROJECT_B,
        refresh_token: 'refresh-token-b',
        user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
      });
      resolveGate.resolve();
      const [resultA, resultB] = await Promise.all([invokeA, invokeB]);

      expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
      expect(resultB.error).toEqual(expect.objectContaining({ message: 'Function not found' }));
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh a shared resolver 401 in each unchanged caller context', async () => {
      jest.clearAllMocks();
      const sharedToken = createTestJwtToken('00000000-0000-0000-0000-000000000011', {
        session_id: '00000000-0000-4000-8000-000000000013',
        renewed: false,
      });
      const refreshedToken = createTestJwtToken('00000000-0000-0000-0000-000000000011', {
        session_id: '00000000-0000-4000-8000-000000000013',
      });
      const instanceA = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
        refreshToken: 'refresh-token-a',
      });
      const instanceB = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-anon-key',
        accessToken: sharedToken,
        refreshToken: 'refresh-token-b',
      });

      const resolveStarted = createDeferred();
      const resolveGate = createDeferred();
      let resolveCalls = 0;
      let refreshCalls = 0;
      const refreshBodies = [];
      global.fetch.mockImplementation(async (url, options = {}) => {
        const requestUrl = String(url);
        if (requestUrl === 'https://api.test.com/functions/resolve?name=my-function') {
          resolveCalls += 1;
          if (resolveCalls === 1) {
            resolveStarted.resolve();
            await resolveGate.promise;
            return {
              ok: false,
              status: 401,
              json: () => Promise.resolve({ error: 'Token expired' }),
            };
          }
          return {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                name: 'my-function',
                function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
                invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
                cache_ttl_seconds: 300,
              }),
          };
        }
        if (requestUrl === 'https://api.test.com/auth/refresh') {
          refreshCalls += 1;
          refreshBodies.push(JSON.parse(options.body));
          return {
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                access_token: refreshedToken,
                refresh_token: 'rotated-refresh-token-b',
                user: { id: 'user-b', email: 'fixture@example.com', status: 'active' },
                expires_in: 3600,
              }),
          };
        }
        return {
          ok: true,
          status: 200,
          headers: {},
          json: () => Promise.resolve({ result: 'ok' }),
        };
      });

      const invokeA = instanceA.functions.invoke('my-function');
      const invokeB = instanceB.functions.invoke('my-function');
      await resolveStarted.promise;
      instanceA._setSession({
        access_token: TEST_ACCESS_TOKEN_PROJECT_B,
        refresh_token: 'replacement-refresh-token',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      resolveGate.resolve();
      const [resultA, resultB] = await Promise.all([invokeA, invokeB]);

      expect(AuthSessionChangedError.is(resultA.error)).toBe(true);
      expect(resultB).toEqual(expect.objectContaining({ data: { result: 'ok' }, error: null }));
      expect(instanceB.accessToken).toBe(refreshedToken);
      expect(resolveCalls).toBe(2);
      expect(refreshCalls).toBe(1);
      expect(refreshBodies).toEqual([{ refresh_token: 'refresh-token-b' }]);
      expect(fetch).toHaveBeenCalledTimes(4);
    });

    it('should cap resolver cache size and evict oldest-expiring entries', async () => {
      jest.clearAllMocks();
      VolcanoAuth.__setFunctionResolveCacheMaxEntriesForTests(2);
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const idByName = {
        'f-one': '11111111-1111-1111-1111-111111111111',
        'f-two': '22222222-2222-2222-2222-222222222222',
        'f-three': '33333333-3333-3333-3333-333333333333',
      };

      let resolveCalls = 0;
      global.fetch.mockImplementation((url) => {
        const requestUrl = String(url);
        if (requestUrl.startsWith('https://api.test.com/functions/resolve?name=')) {
          resolveCalls += 1;
          const name = new URL(requestUrl).searchParams.get('name');
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                name,
                function_id: idByName[name],
                invoke_url: `https://${idByName[name]}.functions.test.run/`,
                cache_ttl_seconds: 300,
              }),
          });
        }

        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ ok: true }),
        });
      });

      const first = await volcano.functions.invoke('f-one', {});
      const second = await volcano.functions.invoke('f-two', {});
      const third = await volcano.functions.invoke('f-three', {});
      const fourth = await volcano.functions.invoke('f-one', {});

      expect(first.error).toBeNull();
      expect(second.error).toBeNull();
      expect(third.error).toBeNull();
      expect(fourth.error).toBeNull();
      expect(resolveCalls).toBe(4);

      const metrics = VolcanoAuth.__getFunctionResolveCacheMetricsForTests();
      expect(metrics.maxEntries).toBe(2);
      expect(metrics.cacheSize).toBeLessThanOrEqual(2);
    });
  });

  describe('Functions - Security', () => {
    it('should reject empty functionName', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const { data, error } = await volcano.functions.invoke('', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('functionName must be a non-empty string');
    });

    it('should reject null functionName', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const { data, error } = await volcano.functions.invoke(null, {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('functionName must be a non-empty string');
    });

    it('should reject undefined functionName', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const { data, error } = await volcano.functions.invoke(undefined, {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('functionName must be a non-empty string');
    });

    it('should reject path traversal identifiers before network request', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const maliciousIds = ['../admin', '../../etc/passwd', 'func/../other'];
      for (const id of maliciousIds) {
        const { data, error } = await volcano.functions.invoke(id, {});
        expect(data).toBeNull();
        expect(error).toBeDefined();
        expect(error.message).toContain('DNS-safe');
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should reject special characters before network request', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const specialIds = ['func;drop', 'func&cmd', 'func|pipe'];
      for (const id of specialIds) {
        const { error } = await volcano.functions.invoke(id, {});
        expect(error).toBeDefined();
        expect(error.message).toContain('DNS-safe');
      }
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should allow DNS-safe function names', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockImplementation((url) => {
        if (String(url).startsWith('https://api.test.com/functions/resolve?name=')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
                invoke_url: 'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.run/',
                cache_ttl_seconds: 300,
              }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ result: 'success' }),
        });
      });

      const validNames = ['my-function', 'func123', 'a'];
      for (const name of validNames) {
        const { error } = await volcano.functions.invoke(name, {});
        expect(error).toBeNull();
      }
    });
  });
});
