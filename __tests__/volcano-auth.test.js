const VolcanoAuth = require('../src/index.js');

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
    it('should sign up a new user successfully', async () => {
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

      const result = await volcano.auth.signUp({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.user).toEqual(mockResponse.user);
      expect(result.session.access_token).toBe('access-token-123');
      expect(localStorage.setItem).toHaveBeenCalledWith('volcano_access_token', 'access-token-123');
      expect(localStorage.setItem).toHaveBeenCalledWith(
        'volcano_refresh_token',
        'refresh-token-123',
      );
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
        user: { id: 'user-123', email: 'test@example.com' },
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        expires_in: 3600,
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
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
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
      volcano.refreshToken = null;

      const result = await volcano.auth.refreshSession();

      expect(result.session).toBeNull();
      expect(result.error.message).toBe('No refresh token');
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

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            user: { id: 'user-123', email: 'new@example.com', is_anonymous: false },
          }),
      });

      const result = await volcano.auth.convertAnonymous({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.user.is_anonymous).toBe(false);
      expect(result.user.email).toBe('new@example.com');
      expect(volcano.currentUser).toEqual(result.user);
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

    it('should return error on confirm email failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid or expired token' }),
      });

      const result = await volcano.auth.confirmEmail('bad-token');

      expect(result.message).toBeNull();
      expect(result.error.message).toBe('Invalid or expired token');
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
    it('should redirect to OAuth provider', () => {
      expect(volcano.auth.signInWithOAuth('google')).toBe(
        'https://api.test.com/auth/oauth/google/authorize?anon_key=ak-test-anon-key',
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
          body: JSON.stringify({ action: 'getData' }),
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
          payload: { limit: 5 },
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
          body: JSON.stringify({ action: 'retry' }),
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
