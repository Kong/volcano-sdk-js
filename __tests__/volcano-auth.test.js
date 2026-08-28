const { VolcanoAuth } = require('../src/index.js');

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

describe('VolcanoAuth', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano;

  beforeEach(() => {
    volcano = new VolcanoAuth(config);
  });

  describe('Constructor', () => {
    it('should initialize with config', () => {
      expect(volcano.apiUrl).toBe(config.apiUrl);
      expect(volcano.anonKey).toBe(config.anonKey);
    });

    it('should use default apiUrl when not provided', () => {
      const v = new VolcanoAuth({ anonKey: 'ak-test-key' });
      expect(v.apiUrl).toBe('https://api.volcano.dev');
    });

    it('should throw error if anonKey is missing', () => {
      expect(() => new VolcanoAuth({ apiUrl: 'test' })).toThrow('anonKey is required');
    });

    it('should throw error if anonKey is missing even without apiUrl', () => {
      expect(() => new VolcanoAuth({})).toThrow('anonKey is required');
    });

    it('should throw error if service key used in browser', () => {
      // Mock browser environment
      const originalWindow = global.window;
      global.window = { document: {} };

      expect(
        () =>
          new VolcanoAuth({
            apiUrl: 'test',
            anonKey: 'sk-service-key',
          }),
      ).toThrow('Service keys (sk-*) cannot be used in client-side code');

      global.window = originalWindow;
    });

    it('should accept accessToken for server-side use', () => {
      const v = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-key',
        accessToken: 'server-side-token-123',
        refreshToken: 'server-side-refresh-456',
      });

      expect(v.accessToken).toBe('server-side-token-123');
      expect(v.refreshToken).toBe('server-side-refresh-456');
    });

    it('should use accessToken instead of localStorage when provided', () => {
      // Set up localStorage values
      localStorage.store['volcano_access_token'] = 'stored-token';
      localStorage.store['volcano_refresh_token'] = 'stored-refresh';

      const v = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-key',
        accessToken: 'constructor-token',
      });

      // Should use constructor value, not localStorage
      expect(v.accessToken).toBe('constructor-token');
    });

    it('should allow accessToken without refreshToken', () => {
      const v = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-test-key',
        accessToken: 'server-token-only',
      });

      expect(v.accessToken).toBe('server-token-only');
      expect(v.refreshToken).toBeNull();
    });

    it('should have auth and functions sub-objects', () => {
      expect(volcano.auth).toBeDefined();
      expect(volcano.functions).toBeDefined();
      expect(typeof volcano.auth.signUp).toBe('function');
      expect(typeof volcano.auth.signIn).toBe('function');
      expect(typeof volcano.functions.invoke).toBe('function');
    });

    it('should expose all auth methods', () => {
      // Core auth
      expect(typeof volcano.auth.signUp).toBe('function');
      expect(typeof volcano.auth.signIn).toBe('function');
      expect(typeof volcano.auth.signOut).toBe('function');
      expect(typeof volcano.auth.getUser).toBe('function');
      expect(typeof volcano.auth.updateUser).toBe('function');
      expect(typeof volcano.auth.refreshSession).toBe('function');
      expect(typeof volcano.auth.onAuthStateChange).toBe('function');
      expect(typeof volcano.auth.user).toBe('function');

      // Anonymous
      expect(typeof volcano.auth.signUpAnonymous).toBe('function');
      expect(typeof volcano.auth.convertAnonymous).toBe('function');

      // Email confirmation
      expect(typeof volcano.auth.confirmEmail).toBe('function');
      expect(typeof volcano.auth.resendConfirmation).toBe('function');

      // Password recovery
      expect(typeof volcano.auth.forgotPassword).toBe('function');
      expect(typeof volcano.auth.resetPassword).toBe('function');
      expect(typeof volcano.auth.getPasswordPolicy).toBe('function');
      expect(typeof volcano.auth.startDeviceAuthorization).toBe('function');
      expect(typeof volcano.auth.pollDeviceToken).toBe('function');
      expect(typeof volcano.auth.verifyDevice).toBe('function');
      expect(typeof volcano.auth.exchangePlatformToken).toBe('function');

      // Email change
      expect(typeof volcano.auth.requestEmailChange).toBe('function');
      expect(typeof volcano.auth.confirmEmailChange).toBe('function');
      expect(typeof volcano.auth.cancelEmailChange).toBe('function');

      // OAuth
      expect(typeof volcano.auth.signInWithOAuth).toBe('function');
      expect(typeof volcano.auth.signInWithGoogle).toBe('function');
      expect(typeof volcano.auth.signInWithGitHub).toBe('function');
      expect(typeof volcano.auth.signInWithMicrosoft).toBe('function');
      expect(typeof volcano.auth.signInWithApple).toBe('function');
      expect(typeof volcano.auth.linkOAuthProvider).toBe('function');
      expect(typeof volcano.auth.unlinkOAuthProvider).toBe('function');
      expect(typeof volcano.auth.getLinkedOAuthProviders).toBe('function');
      expect(typeof volcano.auth.refreshOAuthToken).toBe('function');
      expect(typeof volcano.auth.getOAuthProviderToken).toBe('function');
      expect(typeof volcano.auth.callOAuthAPI).toBe('function');

      // Identity management
      expect(typeof volcano.auth.listIdentities).toBe('function');
      expect(typeof volcano.auth.unlinkIdentity).toBe('function');
      expect(typeof volcano.auth.listMethods).toBe('function');
      expect(typeof volcano.auth.promoteMethod).toBe('function');

      // Session management
      expect(typeof volcano.auth.getSessions).toBe('function');
      expect(typeof volcano.auth.deleteSession).toBe('function');
      expect(typeof volcano.auth.deleteAllOtherSessions).toBe('function');
    });
  });

  describe('auth.user()', () => {
    it('should return current user', () => {
      volcano.currentUser = { id: 'user-123', email: 'test@example.com' };
      expect(volcano.auth.user()).toEqual({ id: 'user-123', email: 'test@example.com' });
    });

    it('should return null when not authenticated', () => {
      expect(volcano.auth.user()).toBeNull();
    });
  });

  describe('Authentication - signUp', () => {
    it('should acknowledge a session-less signup without issuing a session', async () => {
      // Session-less signup (VOL-309): the server returns an acknowledgement only.
      const mockResponse = {
        confirmation_required: true,
        message: 'If the account was created, a confirmation email has been sent.',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.confirmationRequired).toBe(true);
      expect(result.message).toBe(mockResponse.message);
      expect(result.error).toBeNull();
      // No session is issued, so neither token key is persisted (any value, incl. undefined/null).
      const persistedKeys = localStorage.setItem.mock.calls.map(([key]) => key);
      expect(persistedKeys).not.toContain('volcano_access_token');
      expect(persistedKeys).not.toContain('volcano_refresh_token');
    });

    it('should return error on signup failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Email already exists' }),
      });

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Email already exists');
    });

    it('should include error:null on successful signup', async () => {
      const mockResponse = {
        confirmation_required: false,
        message: 'If the account was created, you can now sign in.',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.error).toBeNull();
      expect(result.confirmationRequired).toBe(false);
      expect(result.message).toBe(mockResponse.message);
    });

    it('signs in after signup when confirmation is not required and signInWhenAllowed is set', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ confirmation_required: false, message: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'user-123', email: 'test@example.com' },
              access_token: 'access-token-123',
              refresh_token: 'refresh-token-123',
              expires_in: 3600,
            }),
        });

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
        signInWhenAllowed: true,
      });

      // A follow-up signin was issued, establishing and persisting a session.
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result.confirmationRequired).toBe(false);
      expect(result.user).toEqual({ id: 'user-123', email: 'test@example.com' });
      expect(result.session.access_token).toBe('access-token-123');
      expect(result.error).toBeNull();
      expect(localStorage.setItem).toHaveBeenCalledWith('volcano_access_token', 'access-token-123');
    });

    it('does not sign in when confirmation is required, even with signInWhenAllowed', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ confirmation_required: true, message: 'check your email' }),
      });

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
        signInWhenAllowed: true,
      });

      // Only the signup request is made; no session is established.
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect(result.confirmationRequired).toBe(true);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      const persistedKeys = localStorage.setItem.mock.calls.map(([key]) => key);
      expect(persistedKeys).not.toContain('volcano_access_token');
      expect(persistedKeys).not.toContain('volcano_refresh_token');
    });

    it('surfaces the sign-in error when the follow-up sign-in fails', async () => {
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ confirmation_required: false, message: 'ok' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'rate limit exceeded' }),
        });

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
        signInWhenAllowed: true,
      });

      expect(result.confirmationRequired).toBe(false);
      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('rate limit exceeded');
    });
  });

  describe('Authentication - signIn', () => {
    it('should sign in user successfully', async () => {
      const mockResponse = {
        user: { id: 'user-123', email: 'test@example.com' },
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await volcano.auth.signIn({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user.id).toBe('user-123');
      expect(volcano.accessToken).toBe('access-token-123');
    });

    it('should return error on invalid credentials', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid credentials' }),
      });

      const result = await volcano.auth.signIn({
        email: 'test@example.com',
        password: 'wrong',
      });

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('Invalid credentials');
    });

    it('should include error:null on successful signin', async () => {
      const mockResponse = {
        user: { id: 'user-123', email: 'test@example.com' },
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await volcano.auth.signIn({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
    });
  });

  describe('Authentication - signOut', () => {
    it('should clear session on signout', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'test-refresh';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      await volcano.auth.signOut();

      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('volcano_access_token');
      expect(localStorage.removeItem).toHaveBeenCalledWith('volcano_refresh_token');
    });
  });

  describe('Authentication - getUser', () => {
    it('should return user when authenticated', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123', email: 'test@example.com' } }),
      });

      const result = await volcano.auth.getUser();

      expect(result.user.id).toBe('user-123');
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.getUser();

      expect(result.user).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should refresh token on 401 and retry', async () => {
      volcano.accessToken = 'expired-token';
      volcano.refreshToken = 'valid-refresh';

      // First call returns 401
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' }),
      });

      // Refresh call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
      });

      // Retry call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123' } }),
      });

      const result = await volcano.auth.getUser();

      expect(result.user.id).toBe('user-123');
      expect(volcano.accessToken).toBe('new-access-token');
    });

    it('preserves the session-expired error when refresh is unavailable', async () => {
      volcano.accessToken = 'expired-token';
      volcano.refreshToken = null;
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      const result = await volcano.auth.getUser();

      expect(result.user).toBeNull();
      expect(result.error.message).toBe('Session expired');
    });
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
        json: () => Promise.resolve({ user: { id: 'user-redirect', email: 'r@example.com' } }),
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
        json: () => Promise.resolve({ user: { id: 'user-late' } }),
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
      expect(callback).not.toHaveBeenCalled();

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-ctor', email: 'c@example.com' } }),
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

    it('consumes the pending redirect notification when getUser refreshes', async () => {
      seedNonce();
      window.location.hash =
        '#access_token=expired-access&refresh_token=valid-refresh&state=' + NONCE;
      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const callback = jest.fn();
      v.auth.onAuthStateChange(callback);
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Access token expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'rotated-access',
              refresh_token: 'rotated-refresh',
              user: { id: 'redirect-user' },
            }),
        })
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'redirect-user' } }),
        });

      await v.auth.getUser();
      await v.auth.getUser();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ id: 'redirect-user' });
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
        json: () => Promise.resolve({ user: { id: 'user-once', email: 'once@example.com' } }),
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
              user: { id: 'oauth-user', email: 'oauth@example.com' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'oauth-user', email: 'oauth@example.com' } }),
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
              user: { id: 'oauth-user', email: 'oauth@example.com' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'oauth-user', email: 'oauth@example.com' } }),
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
              user: { id: 'oauth-user', email: 'oauth@example.com' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'oauth-user', email: 'oauth@example.com' } }),
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
              user: { id: 'oauth-user', email: 'oauth@example.com' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'oauth-user', email: 'oauth@example.com' } }),
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
              user: { id: 'signed-in-user', email: 'signed-in@example.com' },
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
          json: () => Promise.resolve({ user: { id: 'stored-user', email: 'stored@example.com' } }),
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
        user: { id: 'stored-user', email: 'stored@example.com' },
        error: null,
      });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('refreshes a valid stored session after an OAuth provider denial', async () => {
      window.localStorage.setItem('volcano_access_token', 'stored-access');
      window.localStorage.setItem('volcano_refresh_token', 'stored-refresh');
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?error=access_denied&state=oauth-nonce');
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'refreshed-access',
            refresh_token: 'refreshed-refresh',
            expires_in: 3600,
          }),
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.auth.refreshSession();

      expect(result).toEqual(
        expect.objectContaining({
          session: expect.objectContaining({ access_token: 'refreshed-access' }),
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
            user: { id: 'oauth-user', email: 'oauth@example.com' },
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
            user: { id: 'oauth-user', email: 'oauth@example.com' },
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
          json: () => Promise.resolve({ object: { path: 'avatar.png', is_public: true } }),
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
            user: { id: 'oauth-user', email: 'oauth@example.com' },
          }),
      });

      await expect(visibility).resolves.toEqual(expect.objectContaining({ error: null }));
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('preserves a failed code exchange error for function invocation', async () => {
      window.sessionStorage.setItem('volcano_auth_state', 'oauth-nonce');
      window.sessionStorage.setItem('volcano_auth_redirect_url', callbackRedirectURL());
      window.history.replaceState(null, '', '/auth/callback?code=rejected&state=oauth-nonce');
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'invalid authorization code' }),
      });

      const v = new VolcanoAuth({ apiUrl: 'https://api.test.com', anonKey: 'ak-test-key' });
      const result = await v.functions.invoke('my-function');

      expect(result.error).toEqual(
        expect.objectContaining({ message: 'invalid authorization code' }),
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('Authentication - updateUser', () => {
    it('should update user password', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123', email: 'test@example.com' } }),
      });

      const result = await volcano.auth.updateUser({ password: 'newPassword123' });

      expect(result.user.id).toBe('user-123');
      expect(result.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/user'),
        expect.objectContaining({ method: 'PUT' }),
      );
    });

    it('should update user metadata', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123', metadata: { name: 'John' } } }),
      });

      const result = await volcano.auth.updateUser({ metadata: { name: 'John' } });

      expect(result.user.metadata.name).toBe('John');
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.updateUser({ password: 'newpass' });

      expect(result.user).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should return error on failure', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Password too weak' }),
      });

      const result = await volcano.auth.updateUser({ password: '123' });

      expect(result.user).toBeNull();
      expect(result.error.message).toBe('Password too weak');
    });
  });

  describe('Authentication - refreshSession', () => {
    it('should refresh session successfully', async () => {
      volcano.refreshToken = 'valid-refresh';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
          }),
      });

      const result = await volcano.auth.refreshSession();

      expect(result.session.access_token).toBe('new-access');
      expect(result.session.refresh_token).toBe('new-refresh');
      expect(result.session.expires_in).toBe(3600);
      expect(result.error).toBeNull();
      expect(volcano.accessToken).toBe('new-access');
      expect(volcano.refreshToken).toBe('new-refresh');
    });

    it('should return error when no refresh token', async () => {
      volcano.accessToken = 'valid-access';
      volcano.refreshToken = null;

      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeNull();
      expect(result.error.message).toBe('No refresh token');
      expect(volcano.accessToken).toBeNull();
    });

    it('does not emit another signed-out event without local auth', async () => {
      const callback = jest.fn();
      volcano.auth.onAuthStateChange(callback);
      callback.mockClear();

      await volcano.auth.refreshSession();

      expect(callback).not.toHaveBeenCalled();
    });

    it('should clear session on refresh failure', async () => {
      volcano.accessToken = 'old-access';
      volcano.refreshToken = 'expired-refresh';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Refresh token expired' }),
      });

      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeNull();
      expect(result.error.message).toBe('Refresh token expired');
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });
  });

  describe('Authentication - onAuthStateChange', () => {
    it('defers restored-session callbacks until the user is hydrated', async () => {
      const restored = new VolcanoAuth({
        ...config,
        accessToken: 'restored-access',
      });
      const callback = jest.fn();
      restored.auth.onAuthStateChange(callback);
      expect(callback).not.toHaveBeenCalled();

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'restored-user' } }),
      });
      await restored.auth.getUser();

      expect(callback).toHaveBeenCalledWith({ id: 'restored-user' });
    });

    it('notifies restored-session hydration once when getUser refreshes', async () => {
      const restored = new VolcanoAuth({
        ...config,
        accessToken: 'expired-access',
        refreshToken: 'valid-refresh',
      });
      const callback = jest.fn();
      restored.auth.onAuthStateChange(callback);
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Access token expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'rotated-access',
              refresh_token: 'rotated-refresh',
              user: { id: 'restored-user' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'restored-user' } }),
        });

      await restored.auth.getUser();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ id: 'restored-user' });
    });

    it('should call callback with current user', () => {
      volcano.currentUser = { id: 'user-123' };
      const callback = jest.fn();

      volcano.auth.onAuthStateChange(callback);

      expect(callback).toHaveBeenCalledWith({ id: 'user-123' });
    });

    it('should call callback on session change', async () => {
      const callback = jest.fn();
      volcano.auth.onAuthStateChange(callback);

      // Clear initial call
      callback.mockClear();

      // Simulate signin
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-456' },
            access_token: 'token',
            refresh_token: 'refresh',
          }),
      });

      await volcano.auth.signIn({ email: 'test@test.com', password: 'pass' });

      expect(callback).toHaveBeenCalledWith({ id: 'user-456' });
    });

    it('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = volcano.auth.onAuthStateChange(callback);

      expect(typeof unsubscribe).toBe('function');

      // Clear initial call
      callback.mockClear();

      // Unsubscribe
      unsubscribe();

      // Trigger session change
      volcano._setSession({
        user: { id: 'user-789' },
        access_token: 'token',
        refresh_token: 'refresh',
      });

      // Callback should NOT be called since we unsubscribed
      expect(callback).not.toHaveBeenCalled();
    });

    it('should support multiple callbacks', async () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();

      volcano.auth.onAuthStateChange(callback1);
      volcano.auth.onAuthStateChange(callback2);

      // Clear initial calls
      callback1.mockClear();
      callback2.mockClear();

      // Trigger session change
      volcano._setSession({
        user: { id: 'user-multi' },
        access_token: 'token',
        refresh_token: 'refresh',
      });

      expect(callback1).toHaveBeenCalledWith({ id: 'user-multi' });
      expect(callback2).toHaveBeenCalledWith({ id: 'user-multi' });
    });

    it('should not crash if callback throws error', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      const badCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const goodCallback = jest.fn();

      // Register both callbacks
      volcano.auth.onAuthStateChange(badCallback);
      volcano.auth.onAuthStateChange(goodCallback);

      // Clear initial calls
      badCallback.mockClear();
      goodCallback.mockClear();

      // Trigger session change - should not throw
      expect(() => {
        volcano._setSession({
          user: { id: 'user-err' },
          access_token: 'token',
          refresh_token: 'refresh',
        });
      }).not.toThrow();

      // Bad callback was called (and threw)
      expect(badCallback).toHaveBeenCalled();
      // Good callback still got called despite the error
      expect(goodCallback).toHaveBeenCalledWith({ id: 'user-err' });
      // Error was logged
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('should not crash if callback throws error on initial registration', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
      volcano.currentUser = { id: 'current-user' };

      const badCallback = jest.fn(() => {
        throw new Error('Initial callback error');
      });

      // Should not throw when registering
      expect(() => {
        volcano.auth.onAuthStateChange(badCallback);
      }).not.toThrow();

      expect(badCallback).toHaveBeenCalledWith({ id: 'current-user' });
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Anonymous Authentication', () => {
    it('should sign up anonymous user', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'anon-123', is_anonymous: true },
            access_token: 'anon-token',
            refresh_token: 'anon-refresh',
            expires_in: 3600,
          }),
      });

      const result = await volcano.auth.signUpAnonymous();

      expect(result.user.is_anonymous).toBe(true);
      expect(result.session.access_token).toBe('anon-token');
      expect(result.error).toBeNull();
    });

    it('should sign up anonymous user with metadata', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'anon-123', is_anonymous: true, metadata: { device: 'mobile' } },
            access_token: 'anon-token',
            refresh_token: 'anon-refresh',
            expires_in: 3600,
          }),
      });

      const result = await volcano.auth.signUpAnonymous({ device: 'mobile' });

      expect(result.user.is_anonymous).toBe(true);

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.user_metadata).toEqual({ device: 'mobile' });
    });

    it('should return error on anonymous signup failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Anonymous signup disabled' }),
      });

      const result = await volcano.auth.signUpAnonymous();

      expect(result.user).toBeNull();
      expect(result.session).toBeNull();
      expect(result.error.message).toBe('Anonymous signup disabled');
    });

    it('should convert anonymous user', async () => {
      volcano.accessToken = 'anon-token';
      volcano.refreshToken = 'anon-refresh';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-123', email: 'new@example.com', is_anonymous: false },
          }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-123', email: 'new@example.com', is_anonymous: false },
            access_token: 'converted-token',
            refresh_token: 'converted-refresh',
            expires_in: 3600,
          }),
      });

      const result = await volcano.auth.convertAnonymous({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.user.is_anonymous).toBe(false);
      expect(result.user.email).toBe('new@example.com');
      expect(volcano.currentUser).toEqual(result.user);
      expect(volcano.accessToken).toBe('converted-token');
    });

    it('should return error when converting non-authenticated user', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.convertAnonymous({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should return error on convert anonymous failure', async () => {
      volcano.accessToken = 'anon-token';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Email already exists' }),
      });

      const result = await volcano.auth.convertAnonymous({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.error.message).toBe('Email already exists');
    });

    it('preserves successful conversion when session rotation fails', async () => {
      volcano.accessToken = 'anon-token';
      volcano.refreshToken = 'anon-refresh';
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'user-123', email: 'new@example.com', is_anonymous: false },
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: 'Refresh unavailable' }),
        });

      const result = await volcano.auth.convertAnonymous({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result).toEqual({
        user: { id: 'user-123', email: 'new@example.com', is_anonymous: false },
        error: null,
      });
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });

    it('clears an access-only anonymous session after conversion', async () => {
      volcano.accessToken = 'anon-token';
      volcano.refreshToken = null;
      volcano.currentUser = { id: 'anonymous-user', is_anonymous: true };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'anonymous-user', email: 'new@example.com', is_anonymous: false },
          }),
      });

      const result = await volcano.auth.convertAnonymous({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.user.is_anonymous).toBe(false);
      expect(volcano.accessToken).toBeNull();
      expect(volcano.currentUser).toBeNull();
    });
  });

  describe('Email Confirmation', () => {
    it('should confirm email', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Email confirmed' }),
      });

      const result = await volcano.auth.confirmEmail('confirm-token-123');

      expect(result.message).toBe('Email confirmed');
      expect(result.error).toBeNull();
    });

    it('notifies once when confirmation hydrates a restored session', async () => {
      volcano.accessToken = 'restored-access';
      const callback = jest.fn();
      volcano.auth.onAuthStateChange(callback);
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: 'Email confirmed' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'restored-user' } }),
        });

      const result = await volcano.auth.confirmEmail('confirm-token-123');

      expect(result.error).toBeNull();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ id: 'restored-user' });
    });

    it('notifies once when confirmation refreshes a resolved session', async () => {
      volcano.accessToken = 'expired-access';
      volcano.refreshToken = 'valid-refresh';
      volcano.currentUser = { id: 'resolved-user' };
      const callback = jest.fn();
      volcano.auth.onAuthStateChange(callback);
      callback.mockClear();
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: 'Email confirmed' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Access token expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: 'rotated-access',
              refresh_token: 'rotated-refresh',
              user: { id: 'resolved-user' },
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ user: { id: 'resolved-user' } }),
        });

      await volcano.auth.confirmEmail('confirm-token-123');

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ id: 'resolved-user' });
    });

    it('should return error on confirm email failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid or expired token' }),
      });

      const result = await volcano.auth.confirmEmail('bad-token');

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('Invalid or expired token');
    });

    it('preserves confirmation success when refreshing the current user fails', async () => {
      volcano.accessToken = 'access-token';
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: 'Email confirmed' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: 'Temporarily unavailable' }),
        });

      const result = await volcano.auth.confirmEmail('confirm-token-123');

      expect(result).toEqual({ message: 'Email confirmed', error: null });
    });

    it('should resend confirmation', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Confirmation sent' }),
      });

      const result = await volcano.auth.resendConfirmation('test@example.com');

      expect(result.message).toBe('Confirmation sent');
      expect(result.error).toBeNull();
    });

    it('should return error on resend confirmation failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Email already confirmed' }),
      });

      const result = await volcano.auth.resendConfirmation('confirmed@example.com');

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('Email already confirmed');
    });
  });

  describe('Password Recovery', () => {
    it('should request password reset', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Reset email sent' }),
      });

      const result = await volcano.auth.forgotPassword('test@example.com');

      expect(result.message).toBe('Reset email sent');
    });

    it('should reset password', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Password reset successful' }),
      });

      const result = await volcano.auth.resetPassword({
        token: 'reset-token',
        newPassword: 'newpassword123',
      });

      expect(result.message).toBe('Password reset successful');
    });

    it('clears a current session revoked by password reset', async () => {
      volcano.accessToken = 'access-token';
      volcano.refreshToken = 'refresh-token';
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ message: 'Password reset successful' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Access token expired' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Refresh token expired' }),
        });

      const result = await volcano.auth.resetPassword({
        token: 'reset-token',
        newPassword: 'newpassword123',
      });

      expect(result.message).toBe('Password reset successful');
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });

    it('should return error on forgotPassword failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'User not found' }),
      });

      const result = await volcano.auth.forgotPassword('unknown@example.com');

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('User not found');
    });

    it('should return error on resetPassword failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid token' }),
      });

      const result = await volcano.auth.resetPassword({
        token: 'bad-token',
        newPassword: 'newpassword123',
      });

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('Invalid token');
    });
  });

  describe('Email Change', () => {
    it('should request email change', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Confirmation email sent',
            new_email: 'new@example.com',
            email_change_token: 'change-token-123',
          }),
      });

      const result = await volcano.auth.requestEmailChange('new@example.com');

      expect(result.message).toBe('Confirmation email sent');
      expect(result.newEmail).toBe('new@example.com');
      expect(result.emailChangeToken).toBe('change-token-123');
      expect(result.error).toBeNull();
    });

    it('should return error when not authenticated for email change', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.requestEmailChange('new@example.com');

      expect(result.message).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should confirm email change', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-123', email: 'new@example.com' },
          }),
      });

      const result = await volcano.auth.confirmEmailChange('change-token-123');

      expect(result.user.email).toBe('new@example.com');
      expect(result.error).toBeNull();
      expect(volcano.currentUser.email).toBe('new@example.com');
    });

    it('should return error on confirm email change failure', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Invalid or expired token' }),
      });

      const result = await volcano.auth.confirmEmailChange('bad-token');

      expect(result.user).toBeNull();
      expect(result.error.message).toBe('Invalid or expired token');
    });

    it('should cancel email change', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Email change cancelled' }),
      });

      const result = await volcano.auth.cancelEmailChange();

      expect(result.message).toBe('Email change cancelled');
      expect(result.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/cancel-email-change'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should return error on cancel email change failure', async () => {
      volcano.accessToken = 'valid-token';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'No pending email change' }),
      });

      const result = await volcano.auth.cancelEmailChange();

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('No pending email change');
    });
  });

  describe('OAuth', () => {
    it('should redirect to OAuth provider with anon_key and separate client state', () => {
      const url = volcano.auth.signInWithOAuth('google');
      const parsed = new URL(url);
      expect(parsed.origin + parsed.pathname).toBe(
        'https://api.test.com/auth/oauth/google/authorize',
      );
      expect(parsed.searchParams.get('anon_key')).toBe('ak-test-anon-key');
      const redirectUrl = parsed.searchParams.get('redirect_url');
      expect(redirectUrl).toBeTruthy();
      expect(new URL(redirectUrl).searchParams.get('vh_state')).toBe(
        parsed.searchParams.get('client_state'),
      );
    });

    it('should have convenience methods for all providers', () => {
      expect(volcano.auth.signInWithGoogle()).toContain('/oauth/google/');
      expect(volcano.auth.signInWithGitHub()).toContain('/oauth/github/');
      expect(volcano.auth.signInWithMicrosoft()).toContain('/oauth/microsoft/');
      expect(volcano.auth.signInWithApple()).toContain('/oauth/apple/');
    });

    it('should get linked providers', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ providers: ['google', 'github'] }),
      });

      const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

      expect(error).toBeNull();
      expect(providers).toEqual(['google', 'github']);
    });

    it('should return empty array when no providers linked', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

      expect(error).toBeNull();
      expect(providers).toEqual([]);
    });

    it('should return error on getLinkedOAuthProviders failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      const { providers, error } = await volcano.auth.getLinkedOAuthProviders();

      expect(providers).toBeNull();
      expect(error).toBeDefined();
    });

    it('should link OAuth provider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'Provider linked', redirect_url: 'https://...' }),
      });

      const { data, error } = await volcano.auth.linkOAuthProvider('github');

      expect(error).toBeNull();
      expect(data.message).toBe('Provider linked');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/auth/oauth/github/link',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should return error on linkOAuthProvider failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Provider already linked' }),
      });

      const { data, error } = await volcano.auth.linkOAuthProvider('github');

      expect(data).toBeNull();
      expect(error).toBeDefined();
    });

    it('should unlink OAuth provider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const { error } = await volcano.auth.unlinkOAuthProvider('github');

      expect(error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/auth/oauth/github/unlink',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should return error on unlinkOAuthProvider failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Cannot unlink only provider' }),
      });

      const { error } = await volcano.auth.unlinkOAuthProvider('github');

      expect(error).toBeDefined();
    });

    it('should refresh OAuth token', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Token refreshed',
            provider: 'google',
            expires_in: 3600,
          }),
      });

      const result = await volcano.auth.refreshOAuthToken('google');

      expect(result.message).toBe('Token refreshed');
      expect(result.provider).toBe('google');
      expect(result.expiresIn).toBe(3600);
      expect(result.error).toBeNull();
    });

    it('should return error on refreshOAuthToken failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'Refresh not supported' }),
      });

      const result = await volcano.auth.refreshOAuthToken('github');

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('Refresh not supported');
    });

    it('should get OAuth provider token', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            message: 'Token retrieved',
            provider: 'google',
            expires_in: 3600,
          }),
      });

      const result = await volcano.auth.getOAuthProviderToken('google');

      expect(result.message).toBe('Token retrieved');
      expect(result.provider).toBe('google');
      expect(result.expiresIn).toBe(3600);
      expect(result.error).toBeNull();
    });

    it('should return error on getOAuthProviderToken failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Provider not linked' }),
      });

      const result = await volcano.auth.getOAuthProviderToken('apple');

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('Provider not linked');
    });

    it('should call OAuth API', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { repos: ['repo1', 'repo2'] },
          }),
      });

      const result = await volcano.auth.callOAuthAPI('github', {
        endpoint: '/user/repos',
        method: 'GET',
      });

      expect(result.data).toEqual({ repos: ['repo1', 'repo2'] });
      expect(result.error).toBeNull();

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.endpoint).toBe('/user/repos');
      expect(requestBody.method).toBe('GET');
    });

    it('should call OAuth API with POST body', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: { success: true },
          }),
      });

      const result = await volcano.auth.callOAuthAPI('github', {
        endpoint: '/user/repos',
        method: 'POST',
        body: { name: 'new-repo' },
      });

      expect(result.data).toEqual({ success: true });

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.body).toEqual({ name: 'new-repo' });
    });

    it('should return error on callOAuthAPI failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: 'Insufficient scope' }),
      });

      const result = await volcano.auth.callOAuthAPI('github', {
        endpoint: '/admin/repos',
      });

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('Insufficient scope');
    });

    it('uses structured codes to preserve auth for provider-level unauthorized responses', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'refresh-token';
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Provider unavailable', code: 'provider_not_linked' }),
      });

      const result = await volcano.auth.callOAuthAPI('github', { endpoint: '/user' });

      expect(result.error.message).toBe('Provider unavailable');
      expect(result.error.code).toBe('provider_not_linked');
      expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN);
    });

    it('preserves schema-valid provider errors that omit the optional code', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'refresh-token';
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Provider is not linked' }),
      });

      const result = await volcano.auth.callOAuthAPI('github', { endpoint: '/user' });

      expect(result.error.message).toBe('Provider is not linked');
      expect(volcano.accessToken).toBe(TEST_ACCESS_TOKEN);
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('clears an access-only expired session for provider API calls', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = null;
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Not authenticated' }),
      });

      const result = await volcano.auth.callOAuthAPI('github', { endpoint: '/user' });

      expect(result.error.message).toBe('Session expired');
      expect(volcano.accessToken).toBeNull();
    });

    it('reports session expiry when provider API token refresh fails', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'expired-refresh';
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Not authenticated' }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Refresh token expired' }),
        });

      const result = await volcano.auth.callOAuthAPI('github', { endpoint: '/user' });

      expect(result.error.message).toBe('Session expired');
      expect(volcano.accessToken).toBeNull();
    });

    it('refreshes an expired session before retrying a provider API call', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'refresh-token';
      global.fetch
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Not authenticated' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'user-123' },
              access_token: 'rotated-access',
              refresh_token: 'rotated-refresh',
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ data: { login: 'octocat' } }),
        });

      const result = await volcano.auth.callOAuthAPI('github', { endpoint: '/user' });

      expect(result).toEqual({ data: { login: 'octocat' }, error: null });
      expect(volcano.accessToken).toBe('rotated-access');
    });
  });

  describe('Identity Management', () => {
    it('lists, promotes, and unlinks identities through the stable auth facade', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      const identity = {
        id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
        email: 'user@example.com',
        email_verified: true,
        is_primary: true,
        created_at: '2026-08-27T12:00:00Z',
      };
      const method = {
        id: '7f518a4b-407b-4121-907b-d72a2c7c1ac6',
        type: 'oauth',
        provider: 'github',
        identity_id: identity.id,
        email: 'primary@example.com',
        is_primary: true,
        created_at: '2026-08-27T12:00:00Z',
        updated_at: '2026-08-28T12:00:00Z',
      };
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ identities: [identity] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ methods: [method] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () => Promise.resolve(method),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ error: 'Temporarily unavailable' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
        });

      const identities = await volcano.auth.listIdentities();
      const methods = await volcano.auth.listMethods();
      volcano.currentUser = { id: 'user-123', email: 'previous@example.com' };
      const promoted = await volcano.auth.promoteMethod(method.id);
      const unlinked = await volcano.auth.unlinkIdentity(identity.id);

      expect(identities).toEqual({ identities: [identity], error: null });
      expect(methods).toEqual({ methods: [method], error: null });
      expect(promoted).toEqual({ method, error: null });
      expect(unlinked).toEqual({ error: null });
      expect(volcano.currentUser.email).toBe('primary@example.com');
      expect(fetch.mock.calls.map(([url]) => url)).toEqual([
        'https://api.test.com/auth/user/identities',
        'https://api.test.com/auth/user/methods',
        `https://api.test.com/auth/user/methods/${method.id}/promote`,
        'https://api.test.com/auth/user',
        `https://api.test.com/auth/user/identities/${identity.id}`,
      ]);
    });
  });

  describe('Device and Platform Authentication', () => {
    it('accepts omitted device verification metadata', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });

      await expect(volcano.auth.verifyDevice('ABCD-EFGH')).resolves.toEqual({
        verification: {},
        error: null,
      });
    });

    it('rejects an unknown device action before making a request', async () => {
      await expect(volcano.auth.verifyDevice('ABCD-EFGH', 'ignore')).rejects.toThrow(
        'approve or deny',
      );
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('exposes password policy and commits an approved device session', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      const policy = {
        effective_min_length: 12,
        min_configurable_length: 8,
        max_length: 128,
        require_uppercase: true,
        require_lowercase: true,
        require_numbers: true,
        require_special_chars: true,
        compromised_passwords_rejected: true,
      };
      const authorization = {
        device_code: 'device-secret',
        user_code: 'ABCD-EFGH',
        verification_uri: 'https://verify.example',
        verification_uri_complete: 'https://verify.example?code=ABCD-EFGH',
        expires_in: 600,
        interval: 5,
      };
      const token = {
        access_token: 'device-access',
        refresh_token: 'device-refresh',
        expires_in: 3600,
        token_type: 'bearer',
        user: {
          id: 'user-123',
          email: 'user@example.com',
          status: 'active',
          email_confirmed: true,
          created_at: '2026-08-27T12:00:00Z',
          updated_at: '2026-08-28T12:00:00Z',
        },
      };
      const platform = {
        token: 'platform-secret',
        user_id: 'user-123',
        token_id: '00000000-0000-4000-8000-000000000001',
        expires_at: '2026-08-28T13:00:00Z',
      };
      [policy, authorization, token, { success: true, status: 'approved' }, platform].forEach(
        (payload) => {
          global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => Promise.resolve(payload),
          });
        },
      );

      const policyResult = await volcano.auth.getPasswordPolicy();
      const startResult = await volcano.auth.startDeviceAuthorization('volcano-cli');
      const tokenResult = await volcano.auth.pollDeviceToken('volcano-cli', 'device-secret');
      const verifyResult = await volcano.auth.verifyDevice('ABCD-EFGH');
      const platformResult = await volcano.auth.exchangePlatformToken('volcano-cli');

      expect(policyResult).toEqual({ policy, error: null });
      expect(startResult).toEqual({ authorization, error: null });
      expect(tokenResult.session.access_token).toBe('device-access');
      expect(volcano.currentUser).toEqual(token.user);
      expect(verifyResult.verification.status).toBe('approved');
      expect(platformResult).toEqual({ token: platform, error: null });
    });
  });

  describe('Session Management', () => {
    it('should get paginated sessions with default params', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [
              {
                id: 'session-1',
                provider: 'email',
                user_agent: 'Mozilla/5.0...',
                ip_address: '192.168.1.1',
                is_active: true,
                is_current: true,
              },
              {
                id: 'session-2',
                provider: 'google',
                user_agent: 'Chrome Mobile...',
                ip_address: '10.0.0.50',
                is_active: true,
                is_current: false,
              },
            ],
            total: 2,
            page: 1,
            limit: 20,
            total_pages: 1,
          }),
      });

      const result = await volcano.auth.getSessions();

      expect(result.sessions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBe(1);
      expect(result.error).toBeNull();
      expect(result.sessions[0].is_current).toBe(true);
      expect(result.sessions[1].is_current).toBe(false);
    });

    it('should get sessions with custom pagination params', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            sessions: [{ id: 'session-3', provider: 'email' }],
            total: 25,
            page: 2,
            limit: 10,
            total_pages: 3,
          }),
      });

      const result = await volcano.auth.getSessions({ page: 2, limit: 10 });

      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total).toBe(25);
      expect(result.total_pages).toBe(3);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('/auth/user/sessions?page=2&limit=10'),
        expect.any(Object),
      );
    });

    it('preserves an explicit first-page offset request', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ sessions: [], total: 0, page: 1, limit: 20, total_pages: 0 }),
      });

      await volcano.auth.getSessions({ sort: 'created_at', status: 'expired', page: 1 });
      const query = Object.fromEntries(new URL(fetch.mock.calls[0][0]).searchParams);

      expect(query).toEqual({ page: '1', sort: 'created_at', status: 'expired' });
    });

    it('should expose session filters and cursor navigation', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            data: [{ id: 'session-3', provider: 'email' }],
            has_more: true,
            next_cursor: 'next',
            prev_cursor: 'previous',
          }),
      });

      const result = await volcano.auth.getSessions({
        sort: 'created_at',
        status: 'active',
        endingBefore: 'previous-page',
        offset: 1,
        limit: 1,
      });
      const query = Object.fromEntries(new URL(fetch.mock.calls[0][0]).searchParams);

      expect(result.sessions.map((session) => session.id)).toEqual(['session-3']);
      expect([result.has_more, result.next_cursor, result.prev_cursor]).toEqual([
        true,
        'next',
        'previous',
      ]);
      expect([result.total, result.limit]).toEqual([null, null]);
      expect(query).toEqual({
        limit: '1',
        sort: 'created_at',
        status: 'active',
        offset: '1',
        ending_before: 'previous-page',
      });
    });

    it('should return error when not authenticated for getSessions', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.getSessions();

      expect(result.sessions).toBeNull();
      expect(result.error).toBeDefined();
    });

    it('should delete specific session', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

      const result = await volcano.auth.deleteSession('session-123');

      expect(result.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/auth/user/sessions/session-123',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should return error on deleteSession failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: 'Session not found' }),
      });

      const result = await volcano.auth.deleteSession('invalid-session');

      expect(result.error.message).toBe('Session not found');
    });

    it('clears local auth after deleting the current device session', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'refresh-token';
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sessions: [{ id: 'current-session', is_current: true }],
              total: 1,
              page: 1,
              limit: 20,
              total_pages: 1,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sessions: [],
              total: 1,
              page: 2,
              limit: 20,
              total_pages: 2,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
        });

      await volcano.auth.getSessions();
      await volcano.auth.getSessions({ page: 2 });
      const result = await volcano.auth.deleteSession('current-session');

      expect(result.error).toBeNull();
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });

    it('clears local auth when directly deleting the session identified by the access token', async () => {
      volcano.accessToken = createTestJwtToken('project-123', {
        session_id: 'current-session',
      });
      volcano.refreshToken = 'refresh-token';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

      const result = await volcano.auth.deleteSession('current-session');

      expect(result.error).toBeNull();
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });

    it('clears local auth when deleting the current session retries after refresh', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.refreshToken = 'refresh-token';
      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              sessions: [{ id: 'current-session', is_current: true }],
              total: 1,
              page: 1,
              limit: 20,
              total_pages: 1,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Access token expired' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              user: { id: 'user-123' },
              access_token: 'rotated-access',
              refresh_token: 'rotated-refresh',
              expires_in: 3600,
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 204,
          json: () => Promise.resolve({}),
        });

      await volcano.auth.getSessions();
      const result = await volcano.auth.deleteSession('current-session');

      expect(result.error).toBeNull();
      expect(volcano.accessToken).toBeNull();
      expect(volcano.refreshToken).toBeNull();
    });

    it('should delete all other sessions', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.resolve({}),
      });

      const result = await volcano.auth.deleteAllOtherSessions();

      expect(result.error).toBeNull();
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/auth/user/sessions',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should return error on deleteAllOtherSessions failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Internal server error' }),
      });

      const result = await volcano.auth.deleteAllOtherSessions();

      expect(result.error.message).toBe('Internal server error');
    });
  });

  describe('Logs', () => {
    it('should expose log methods', () => {
      expect(volcano.logs).toBeDefined();
      expect(typeof volcano.logs.search).toBe('function');
      expect(typeof volcano.logs.activity).toBe('function');
    });

    it('should search project logs with date-time windows', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      const request = {
        resource: { type: 'function', ids: ['fn-1'] },
        q: 'build failed',
        levels: ['error'],
        regions: ['us-east-1'],
        start_time: '2024-01-01T00:00:00.000Z',
        end_time: '2024-01-02T00:00:00.000Z',
        limit: 50,
      };
      const response = {
        data: [
          {
            id: 'log-1',
            timestamp: '2024-01-01T00:00:01.000Z',
            message: 'build failed',
            resource: { type: 'function', id: 'fn-1' },
          },
        ],
        limit: 50,
        has_more: false,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      });

      const result = await volcano.logs.search('project-1', request);

      expect(result.error).toBeNull();
      expect(result.data).toEqual(response);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/projects/project-1/logs/search',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should fetch project log activity with date-time windows', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      const request = {
        resource: { type: 'frontend', ids: ['frontend-1'] },
        levels: ['warn'],
        start_time: '2024-01-01T00:00:00.000Z',
        end_time: '2024-01-01T01:00:00.000Z',
        bucket_count: 12,
      };
      const response = {
        data: [
          {
            start_time: '2024-01-01T00:00:00.000Z',
            end_time: '2024-01-01T00:05:00.000Z',
            counts: {
              levels: { warn: 2 },
              regions: { 'us-east-1': 2 },
              resource_ids: { 'frontend-1': 2 },
            },
            total: 2,
          },
        ],
        total: 2,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(response),
      });

      const result = await volcano.logs.activity('project-1', request);

      expect(result.error).toBeNull();
      expect(result.data).toEqual(response);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/projects/project-1/logs/activity',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify(request),
          headers: expect.objectContaining({
            Authorization: `Bearer ${TEST_ACCESS_TOKEN}`,
            'Content-Type': 'application/json',
          }),
        }),
      );
    });

    it('should return an error when searching logs without a session', async () => {
      const result = await volcano.logs.search('project-1', {
        resource: { type: 'function' },
      });

      expect(result.data).toBeNull();
      expect(result.error.message).toBe('No active session');
      expect(fetch).not.toHaveBeenCalled();
    });
  });

  describe('Functions', () => {
    it('should invoke function successfully', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            cache_ttl_seconds: 300,
          }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name) => {
            if (name?.toLowerCase() === 'x-volcano-version') return 'staging-xyz';
            if (name?.toLowerCase() === 'content-type') return 'application/json';
            return null;
          },
          forEach: (callback) => {
            callback('staging-xyz', 'x-volcano-version');
            callback('application/json', 'content-type');
          },
        },
        json: () => Promise.resolve({ result: 'success', data: [1, 2, 3] }),
      });

      const { data, status, headers, version, error } = await volcano.functions.invoke(
        'my-function',
        { action: 'getData' },
      );

      expect(error).toBeNull();
      expect(status).toBe(200);
      expect(version).toBe('staging-xyz');
      expect(headers['x-volcano-version']).toBe('staging-xyz');
      expect(data.result).toBe('success');
      expect(fetch).toHaveBeenNthCalledWith(
        1,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({
          method: 'GET',
        }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.com/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ payload: { action: 'getData' } }),
        }),
      );
    });

    it('should reject non-hostname-safe identifiers (no fallback)', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      const { error } = await volcano.functions.invoke('get_my_profile', { action: 'getData' });

      expect(error).toBeDefined();
      expect(error.message).toContain('DNS-safe');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should surface a platform-blocked invocation as a VolcanoSystemError', async () => {
      const { VolcanoSystemError } = require('../src/index.js');
      volcano.accessToken = TEST_ACCESS_TOKEN;

      // Resolve succeeds...
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            cache_ttl_seconds: 300,
          }),
      });
      // ...but the invocation is blocked by the platform: 400 with an error body
      // and NO x-volcano-version header (request never reached a running version).
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        headers: {
          get: (name) => {
            if (name?.toLowerCase() === 'content-type') return 'application/json';
            return null;
          },
          forEach: (callback) => {
            callback('application/json', 'content-type');
          },
        },
        json: () => Promise.resolve({ error: 'function cannot be invoked (status: failed)' }),
      });

      const { data, status, error } = await volcano.functions.invoke('my-function', {
        action: 'getData',
      });

      expect(data).toBeNull();
      expect(status).toBe(400);
      expect(error).toBeInstanceOf(VolcanoSystemError);
      expect(VolcanoSystemError.is(error)).toBe(true);
      expect(error.isSystemError).toBe(true);
      expect(error.status).toBe(400);
      expect(error.message).toBe('function cannot be invoked (status: failed)');
      // Extra fields are non-enumerable → serialization shape matches a plain
      // Error (additive, no surprise for consumer log/redaction pipelines).
      expect(Object.keys(error)).toEqual([]);
      expect(JSON.stringify(error)).toBe('{}');
      expect(error.name).toBe('VolcanoSystemError');
    });

    it('VolcanoSystemError.is() only matches system errors', () => {
      const { VolcanoSystemError } = require('../src/index.js');
      expect(VolcanoSystemError.is(new VolcanoSystemError('x', { status: 503 }))).toBe(true);
      expect(VolcanoSystemError.is(new Error('plain'))).toBe(false);
      expect(VolcanoSystemError.is(null)).toBe(false);
      expect(VolcanoSystemError.is(undefined)).toBe(false);
      expect(VolcanoSystemError.is('boom')).toBe(false);
      // Duck-typed brand → holds across a duplicate class identity.
      expect(VolcanoSystemError.is({ isSystemError: true })).toBe(true);
    });

    it('should surface a transport failure as a VolcanoSystemError with null status and cause', async () => {
      const { VolcanoSystemError } = require('../src/index.js');
      volcano.accessToken = TEST_ACCESS_TOKEN;

      // Resolve succeeds...
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            cache_ttl_seconds: 300,
          }),
      });
      // ...but the invocation fetch rejects (network down / DNS / offline).
      const networkError = new Error('network down');
      global.fetch.mockRejectedValueOnce(networkError);

      const { data, status, error } = await volcano.functions.invoke('my-function', {
        action: 'getData',
      });

      expect(data).toBeNull();
      expect(status).toBeNull();
      expect(error).toBeInstanceOf(VolcanoSystemError);
      expect(error.isSystemError).toBe(true);
      expect(error.status).toBeNull();
      expect(error.message).toBe('network down');
      expect(error.cause).toBe(networkError);
    });

    it('should reject invoke when apiUrl does not follow api.<domain> pattern', async () => {
      const customVolcano = new VolcanoAuth({
        apiUrl: 'https://edge.example.com',
        anonKey: 'ak-test-anon-key',
      });
      customVolcano.accessToken = TEST_ACCESS_TOKEN;

      const { error } = await customVolcano.functions.invoke('my-function', {});

      expect(error).toBeDefined();
      expect(error.message).toContain('api.<domain>');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('should use direct invoke path when apiUrl points to localhost', async () => {
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
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            cache_ttl_seconds: 300,
          }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: 'success' }),
      });

      const { error } = await localVolcano.functions.invoke('my-function', {});

      expect(error).toBeNull();
      expect(fetch).toHaveBeenNthCalledWith(
        2,
        'http://localhost:8000/functions/3cd3e058-e3ff-42a5-ae4d-650ef9b45746/invoke',
        expect.objectContaining({ method: 'POST' }),
      );
    });

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

    it('should return error when not authenticated', async () => {
      volcano.accessToken = null;

      const { data, error } = await volcano.functions.invoke('my-function');

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('No active session');
    });

    it('should reject invocation when access token is not a JWT', async () => {
      volcano.accessToken = 'not-a-jwt-token';

      const { data, error } = await volcano.functions.invoke('my-function', {});

      expect(data).toBeNull();
      expect(error).toBeDefined();
      expect(error.message).toBe('accessToken must be a JWT with project_id claim');
      expect(fetch).not.toHaveBeenCalled();
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

    it('should passthrough non-2xx function response when version header is present', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            name: 'my-function',
            function_id: '3cd3e058-e3ff-42a5-ae4d-650ef9b45746',
            cache_ttl_seconds: 300,
          }),
      });
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        headers: {
          get: (name) => {
            if (name?.toLowerCase() === 'x-volcano-version') return 'staging-xyz';
            if (name?.toLowerCase() === 'content-type') return 'application/json';
            return null;
          },
          forEach: (callback) => {
            callback('staging-xyz', 'x-volcano-version');
            callback('application/json', 'content-type');
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
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.com/',
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
              cache_ttl_seconds: 300,
            }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'function not found' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              name: 'my-function',
              function_id: '22222222-2222-2222-2222-222222222222',
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
        'https://11111111-1111-1111-1111-111111111111.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://22222222-2222-2222-2222-222222222222.functions.test.com/',
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
        'https://11111111-1111-1111-1111-111111111111.functions.test.com/',
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
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://3cd3e058-e3ff-42a5-ae4d-650ef9b45746.functions.test.com/',
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
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=shared-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.com/',
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
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=same-name',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.com/',
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
        'https://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        3,
        'https://api.test.com/functions/resolve?name=my-function',
        expect.objectContaining({ method: 'GET' }),
      );
      expect(fetch).toHaveBeenNthCalledWith(
        4,
        'https://bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.functions.test.com/',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('should dedupe in-flight resolve requests across instances with same token', async () => {
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
      releaseResolve();
      const [resultA, resultB] = await Promise.all([invokeA, invokeB]);

      expect(resultA.error).toBeNull();
      expect(resultB.error).toBeNull();
      expect(resolveCalls).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(3);
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

  describe('Database Methods', () => {
    it('should set database name', () => {
      volcano.database('my-database');
      expect(volcano._currentDatabaseName).toBe('my-database');
    });

    it('should chain database() call', () => {
      const result = volcano.database('my-database');
      expect(result).toBe(volcano);
    });
  });

  describe('Database Query - URL Encoding', () => {
    it('should URL-encode databaseName in SELECT query URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], count: 0 }),
      });

      await volcano.from('users').execute();

      const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain(encodeURIComponent('db-with/special&chars'));
      expect(lastCall[0]).not.toContain('db-with/special&chars');
    });

    it('should URL-encode databaseName in INSERT mutation URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], count: 0 }),
      });

      await volcano.insert('users', { name: 'test' }).execute();

      const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain(encodeURIComponent('db-with/special&chars'));
    });

    it('should URL-encode databaseName in UPDATE mutation URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], count: 0 }),
      });

      await volcano.update('users', { name: 'test' }).eq('id', '1').execute();

      const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain(encodeURIComponent('db-with/special&chars'));
    });

    it('should URL-encode databaseName in DELETE mutation URL', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      volcano.database('db-with/special&chars');

      global.fetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: [], count: 0 }),
      });

      await volcano.delete('users').eq('id', '1').execute();

      const lastCall = global.fetch.mock.calls[global.fetch.mock.calls.length - 1];
      expect(lastCall[0]).toContain(encodeURIComponent('db-with/special&chars'));
    });
  });

  describe('Initialize', () => {
    it('should restore session from localStorage', async () => {
      localStorage.store['volcano_access_token'] = 'stored-token';
      localStorage.store['volcano_refresh_token'] = 'stored-refresh';

      const newVolcano = new VolcanoAuth(config);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'restored-user' } }),
      });

      const result = await newVolcano.initialize();

      expect(result.user.id).toBe('restored-user');
    });

    it('should return null user when no stored session', async () => {
      const result = await volcano.initialize();

      expect(result.user).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe('Security - Provider Sanitization', () => {
    // SDK now sanitizes provider format (lowercase letters, numbers, hyphens only)
    // but does NOT validate against a whitelist - backend handles provider validation

    it('should throw error for invalid provider format in signInWithOAuth', () => {
      // Empty string should fail
      expect(() => volcano.auth.signInWithOAuth('')).toThrow('Provider must be a non-empty string');
      // Uppercase should fail (sanitization)
      expect(() => volcano.auth.signInWithOAuth('Google')).toThrow(
        'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
      );
      // Special characters should fail
      expect(() => volcano.auth.signInWithOAuth('my_provider')).toThrow(
        'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
      );
    });

    it('should accept any valid-format provider (backend validates whitelist)', () => {
      // SDK accepts any valid format - backend validates if provider is supported
      expect(() => volcano.auth.signInWithOAuth('google')).not.toThrow();
      expect(() => volcano.auth.signInWithOAuth('github')).not.toThrow();
      expect(() => volcano.auth.signInWithOAuth('facebook')).not.toThrow(); // SDK passes, backend may reject
      expect(() => volcano.auth.signInWithOAuth('custom-provider')).not.toThrow();
    });

    it('should throw error for invalid format in linkOAuthProvider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      // Empty or invalid format fails
      await expect(volcano.auth.linkOAuthProvider('')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
      await expect(volcano.auth.linkOAuthProvider('My_Provider')).rejects.toThrow(
        'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
      );
    });

    it('should accept valid format in linkOAuthProvider (backend validates whitelist)', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ redirect_url: 'https://example.com' }),
      });
      // 'unknown-provider' has valid format, backend will validate if supported
      const result = await volcano.auth.linkOAuthProvider('unknown-provider');
      expect(result.error).toBeNull();
    });

    it('should throw error for invalid format in unlinkOAuthProvider', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(volcano.auth.unlinkOAuthProvider('')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });

    it('should throw error for invalid format in refreshOAuthToken', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(volcano.auth.refreshOAuthToken('')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });

    it('should throw error for invalid format in getOAuthProviderToken', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(volcano.auth.getOAuthProviderToken('')).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });

    it('should throw error for invalid format in callOAuthAPI', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;
      await expect(volcano.auth.callOAuthAPI('', { endpoint: '/test' })).rejects.toThrow(
        'Provider must be a non-empty string',
      );
    });
  });

  describe('Security - updateUser Validation', () => {
    // SDK no longer validates params - backend handles validation
    it('should pass empty params to backend (backend validates)', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      // Mock backend returning validation error
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'At least one of password or metadata is required' }),
      });

      const result = await volcano.auth.updateUser({});

      // SDK passes request to backend, backend returns error
      expect(result.user).toBeNull();
      expect(result.error).toBeDefined();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should allow update with password only', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123' } }),
      });

      const result = await volcano.auth.updateUser({ password: 'newpass123' });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
    });

    it('should allow update with metadata only', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123' } }),
      });

      const result = await volcano.auth.updateUser({ metadata: { name: 'Test' } });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
    });

    it('should allow update with both password and metadata', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ user: { id: 'user-123' } }),
      });

      const result = await volcano.auth.updateUser({
        password: 'newpass123',
        metadata: { name: 'Test' },
      });

      expect(result.error).toBeNull();
      expect(result.user).toBeDefined();
    });
  });
});
