/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { reply, within } from './auth-concurrency-fixtures.ts';
import {
  installWindow,
  pendingFetch,
  restoreWindow,
  settleAfterReplacement,
} from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function acknowledgesEmailChangeRequests(): void {
  it('should not return an email-change acknowledgement for a replaced session', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.requestEmailChange('new@example.com'),
      reply(200, {}),
      ['email change request', 'stale email change request'],
    );

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
}

function requestsEmailChanges(): void {
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
}

function confirmsEmailChanges(): void {
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

  it('should return error on confirm email change failure', async () => {
    volcano.accessToken = 'valid-token';

    fetchMock.mockResolvedValueOnce(reply(400, { error: 'Invalid or expired token' }));

    const result = await volcano.auth.confirmEmailChange('bad-token');

    expect(result.user).toBeNull();
    expect(result.error?.message).toBe('Invalid or expired token');
  });
}

function discardsStaleEmailChangeConfirmations(): void {
  it('should not apply a confirmation response to a replaced session', async () => {
    volcano._setSession({
      access_token: 'original-access',
      refresh_token: 'original-refresh',
      user: { id: 'original-user', email: 'old@example.com', status: 'active' },
    });
    const { response, started } = pendingFetch();

    const request = volcano.auth.confirmEmailChange('change-token-123');
    await within(started.promise, 'email change confirmation request');
    volcano._setSession({
      access_token: 'replacement-access',
      refresh_token: 'replacement-refresh',
      user: { id: 'replacement-user', email: 'replacement@example.com', status: 'active' },
    });
    response.resolve(reply(200, { user: { id: 'original-user', email: 'new@example.com', status: 'active' } }));

    const result = await within(request, 'stale email change confirmation');

    expect(result.user).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser).toEqual({
      id: 'replacement-user',
      email: 'replacement@example.com',
      status: 'active',
    });
  });
}

function cancelsEmailChanges(): void {
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
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.cancelEmailChange(),
      reply(200, { message: 'Email change cancelled' }),
      ['email change cancellation request', 'stale email change cancellation'],
    );

    expect(result.message).toBeNull();
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function acknowledgesEmailChangeCancellations(): void {
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
}

describe('VolcanoAuth account recovery', () => {
  describe('Email Change', () => {
    acknowledgesEmailChangeRequests();
    requestsEmailChanges();
    confirmsEmailChanges();
    discardsStaleEmailChangeConfirmations();
    cancelsEmailChanges();
    acknowledgesEmailChangeCancellations();
  });
});
