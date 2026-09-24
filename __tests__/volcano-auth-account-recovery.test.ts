/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import {
  deferred,
  fetchBody,
  fetchCall,
  reply,
  signal,
  within,
} from './auth-concurrency-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

function legacyAuthCall(
  name: 'signUpAnonymous' | 'forgotPassword',
  ...args: unknown[]
): Promise<unknown> {
  const method: unknown = Reflect.get(volcano.auth, name);
  if (typeof method !== 'function') {
    throw new TypeError(`Missing legacy auth method ${name}`);
  }
  const result: unknown = Reflect.apply(method, volcano.auth, args);
  return Promise.resolve(result);
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { document: {}, localStorage },
  });
  volcano = new VolcanoAuth(config);
});

afterEach(() => {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', previousWindow);
  }
});

describe('VolcanoAuth account recovery', () => {
  describe('Anonymous Authentication', () => {
    it('should sign in anonymously through the preferred auth method', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: {
            id: 'anon-123',
            is_anonymous: true,
            email: 'fixture@example.com',
            status: 'active',
          },
          access_token: 'anon-token',
          refresh_token: 'anon-refresh',
          expires_in: 3600,
        }),
      );

      const result = await volcano.auth.signInAnonymously({ device: 'mobile' });

      expect(result.user).toMatchObject({ is_anonymous: true });
      expect(result.session?.access_token).toBe('anon-token');
      expect(result.error).toBeNull();
      expect(JSON.parse(fetchBody(0))).toEqual({
        user_metadata: { device: 'mobile' },
      });
    });

    it('discards an anonymous signup after another session wins', async () => {
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const signup = legacyAuthCall('signUpAnonymous');
      await within(started.promise, 'anonymous signup request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(
        reply(200, {
          access_token: 'stale-access',
          refresh_token: 'stale-refresh',
          expires_in: 3600,
          user: {
            id: 'stale-anonymous',
            is_anonymous: true,
            email: 'fixture@example.com',
            status: 'active',
          },
        }),
      );

      const result = await within(signup, 'stale anonymous signup');

      expect(result).toMatchObject({ user: null, session: null });
      expect(AuthSessionChangedError.is(Reflect.get(new Object(result), 'error'))).toBe(true);
      expect(volcano.accessToken).toBe('replacement-access');
      expect(volcano.currentUser).toEqual({
        id: 'replacement-user',
        email: 'fixture@example.com',
        status: 'active',
      });
    });

    it('should sign up anonymous user', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: {
            id: 'anon-123',
            is_anonymous: true,
            email: 'fixture@example.com',
            status: 'active',
          },
          access_token: 'anon-token',
          refresh_token: 'anon-refresh',
          expires_in: 3600,
        }),
      );

      const result = await legacyAuthCall('signUpAnonymous');

      expect(result).toMatchObject({
        user: { is_anonymous: true },
        session: { access_token: 'anon-token' },
        error: null,
      });
    });

    it('should sign up anonymous user with metadata', async () => {
      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: {
            id: 'anon-123',
            is_anonymous: true,
            metadata: { device: 'mobile' },
            email: 'fixture@example.com',
            status: 'active',
          },
          access_token: 'anon-token',
          refresh_token: 'anon-refresh',
          expires_in: 3600,
        }),
      );

      const result = await legacyAuthCall('signUpAnonymous', { device: 'mobile' });

      expect(result).toMatchObject({ user: { is_anonymous: true } });

      expect(JSON.parse(fetchBody(0))).toEqual({ user_metadata: { device: 'mobile' } });
    });

    it('should return error on anonymous signup failure', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Anonymous signup disabled' }));

      const result = await legacyAuthCall('signUpAnonymous');

      expect(result).toMatchObject({
        user: null,
        session: null,
        error: { message: 'Anonymous signup disabled' },
      });
    });

    it('should convert anonymous user', async () => {
      volcano.accessToken = 'anon-token';

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: {
            id: 'user-123',
            email: 'new@example.com',
            is_anonymous: false,
            status: 'active',
          },
        }),
      );

      const result = await volcano.auth.convertAnonymous({
        email: 'new@example.com',
        password: 'password123',
      });

      expect(result.user).toMatchObject({ is_anonymous: false });
      expect(result.user?.email).toBe('new@example.com');
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

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Email already exists' }));

      const result = await volcano.auth.convertAnonymous({
        email: 'existing@example.com',
        password: 'password123',
      });

      expect(result.user).toBeNull();
      expect(result.error?.message).toBe('Email already exists');
    });
  });

  describe('Email Confirmation', () => {
    it('should confirm email', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { message: 'Email confirmed' }));

      const result = await volcano.auth.confirmEmail('confirm-token-123');

      expect(result.message).toBe('Email confirmed');
      expect(result.error).toBeNull();
    });

    it('should accept email confirmation without a message or session change', async () => {
      volcano.accessToken = 'unrelated-access-token';
      volcano.refreshToken = 'unrelated-refresh-token';
      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const result = await volcano.auth.confirmEmail('confirmation-token');

      expect(result).toEqual({ message: null, error: null });
      expect(volcano.accessToken).toBe('unrelated-access-token');
      expect(volcano.refreshToken).toBe('unrelated-refresh-token');
    });

    it('should return error on confirm email failure', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Invalid or expired token' }));

      const result = await volcano.auth.confirmEmail('bad-token');

      expect(result.message).toBeNull();
      expect(result.error?.message).toBe('Invalid or expired token');
    });

    it('should resend confirmation', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { message: 'Confirmation sent' }));

      const result = await volcano.auth.resendConfirmation('test@example.com');

      expect(result.message).toBe('Confirmation sent');
      expect(result.error).toBeNull();
    });

    it('should accept a message-less resend without changing the session', async () => {
      volcano.accessToken = 'unrelated-access-token';
      volcano.refreshToken = 'unrelated-refresh-token';
      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const result = await volcano.auth.resendConfirmation('test@example.com');

      expect(result).toEqual({ message: null, error: null });
      expect(volcano.accessToken).toBe('unrelated-access-token');
      expect(volcano.refreshToken).toBe('unrelated-refresh-token');
    });

    it('should return error on resend confirmation failure', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Email already confirmed' }));

      const result = await volcano.auth.resendConfirmation('confirmed@example.com');

      expect(result.message).toBeNull();
      expect(result.error?.message).toBe('Email already confirmed');
    });
  });

  describe('Password Recovery', () => {
    it('should request password reset with the Supabase-style method', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { message: 'Reset email sent' }));

      const result = await volcano.auth.resetPasswordForEmail('test@example.com');

      expect(result).toEqual({ message: 'Reset email sent', error: null });
      expect(fetchCall(0)[0]).toBe('https://api.test.com/auth/forgot-password');
      expect(JSON.parse(fetchBody(0))).toEqual({
        email: 'test@example.com',
      });
    });

    it('should accept a password reset request acknowledgement without a message', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const result = await volcano.auth.resetPasswordForEmail('test@example.com');

      expect(result).toEqual({ message: null, error: null });
    });

    it('should request password reset', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { message: 'Reset email sent' }));

      const result = await legacyAuthCall('forgotPassword', 'test@example.com');

      expect(result).toMatchObject({ message: 'Reset email sent' });
    });

    it('should reset password', async () => {
      fetchMock.mockResolvedValueOnce(reply(200, { message: 'Password reset successful' }));

      const result = await volcano.auth.resetPassword({
        token: 'reset-token',
        newPassword: 'newpassword123',
      });

      expect(result.message).toBe('Password reset successful');
    });

    it('should accept a password reset completion without a message', async () => {
      volcano.accessToken = 'unrelated-access-token';
      volcano.refreshToken = 'unrelated-refresh-token';
      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const result = await volcano.auth.resetPassword({
        token: 'reset-token',
        newPassword: 'newpassword123',
      });

      expect(result).toEqual({ message: null, error: null });
      expect(volcano.accessToken).toBe('unrelated-access-token');
      expect(volcano.refreshToken).toBe('unrelated-refresh-token');
    });

    it('should return error on forgotPassword failure', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'User not found' }));

      const result = await legacyAuthCall('forgotPassword', 'unknown@example.com');

      expect(result).toMatchObject({ message: null, error: { message: 'User not found' } });
    });

    it('should return error on resetPassword failure', async () => {
      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Invalid token' }));

      const result = await volcano.auth.resetPassword({
        token: 'bad-token',
        newPassword: 'newpassword123',
      });

      expect(result.message).toBeNull();
      expect(result.error?.message).toBe('Invalid token');
    });
  });

  describe('Email Change', () => {
    it('should not return an email-change acknowledgement for a replaced session', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.requestEmailChange('new@example.com');
      await within(started.promise, 'email change request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(200, {}));

      const result = await within(request, 'stale email change request');

      expect(result.message).toBeNull();
      expect(result.newEmail).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should accept an acknowledgement without optional fields', async () => {
      volcano.accessToken = 'valid-token';
      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const result = await volcano.auth.requestEmailChange('new@example.com');

      expect(result).toEqual({
        message: null,
        newEmail: null,
        emailChangeToken: undefined,
        error: null,
      });
    });

    it('should request email change', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          message: 'Confirmation email sent',
          new_email: 'new@example.com',
          email_change_token: 'change-token-123',
        }),
      );

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

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          user: { id: 'user-123', email: 'new@example.com', status: 'active' },
        }),
      );

      const result = await volcano.auth.confirmEmailChange('change-token-123');

      expect(result.user?.email).toBe('new@example.com');
      expect(result.error).toBeNull();
      expect(volcano.currentUser?.email).toBe('new@example.com');
    });

    it('should not apply a confirmation response to a replaced session', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'old@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.confirmEmailChange('change-token-123');
      await within(started.promise, 'email change confirmation request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'replacement@example.com', status: 'active' },
      });
      response.resolve(
        reply(200, { user: { id: 'original-user', email: 'new@example.com', status: 'active' } }),
      );

      const result = await within(request, 'stale email change confirmation');

      expect(result.user).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser).toEqual({
        id: 'replacement-user',
        email: 'replacement@example.com',
        status: 'active',
      });
    });

    it('should return error on confirm email change failure', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'Invalid or expired token' }));

      const result = await volcano.auth.confirmEmailChange('bad-token');

      expect(result.user).toBeNull();
      expect(result.error?.message).toBe('Invalid or expired token');
    });

    it('should cancel email change', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(reply(200, { message: 'Email change cancelled' }));

      const result = await volcano.auth.cancelEmailChange();

      expect(result.message).toBe('Email change cancelled');
      expect(result.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/cancel-email-change'),
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should not acknowledge cancellation for a replaced session', async () => {
      volcano._setSession({
        access_token: 'original-access',
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.cancelEmailChange();
      await within(started.promise, 'email change cancellation request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(200, { message: 'Email change cancelled' }));

      const result = await within(request, 'stale email change cancellation');

      expect(result.message).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should accept a cancellation acknowledgement without a message', async () => {
      volcano.accessToken = 'valid-token';
      fetchMock.mockResolvedValueOnce(reply(200, {}));

      const result = await volcano.auth.cancelEmailChange();

      expect(result).toEqual({ message: null, error: null });
    });

    it('should return error on cancel email change failure', async () => {
      volcano.accessToken = 'valid-token';

      fetchMock.mockResolvedValueOnce(reply(400, { error: 'No pending email change' }));

      const result = await volcano.auth.cancelEmailChange();

      expect(result.message).toBeNull();
      expect(result.error?.message).toBe('No pending email change');
    });
  });
});
