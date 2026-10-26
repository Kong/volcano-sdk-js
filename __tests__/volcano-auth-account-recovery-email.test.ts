/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchBody, fetchCall, reply } from './auth-concurrency-fixtures.ts';
import { legacyAuthCall } from './support/volcano-auth-recovery-fixtures.ts';
import { installWindow, restoreWindow } from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function confirmsEmails(): void {
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
}

function resendsConfirmations(): void {
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
}

function requestsPasswordResets(): void {
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

    const result = await legacyAuthCall(volcano, 'forgotPassword', 'test@example.com');

    expect(result).toMatchObject({ message: 'Reset email sent' });
  });
}

function resetsPasswords(): void {
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
}

function rejectsFailedPasswordRecovery(): void {
  it('should return error on forgotPassword failure', async () => {
    fetchMock.mockResolvedValueOnce(reply(400, { error: 'User not found' }));

    const result = await legacyAuthCall(volcano, 'forgotPassword', 'unknown@example.com');

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
}

describe('VolcanoAuth account recovery', () => {
  describe('Email Confirmation', () => {
    confirmsEmails();
    resendsConfirmations();
  });

  describe('Password Recovery', () => {
    requestsPasswordResets();
    resetsPasswords();
    rejectsFailedPasswordRecovery();
  });
});
