/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import {
  installWindow,
  originalSession,
  restoreWindow,
  settleAfterReplacement,
} from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN = testAccessToken('00000000-0000-0000-0000-000000000001');
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function sessionAccessToken(sessionId: string): string {
  return testAccessToken('00000000-0000-0000-0000-000000000001', { session_id: sessionId });
}

function deletesSpecificSessions(): void {
  it('should delete specific session', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(204, {}));

    const result = await volcano.auth.deleteSession('session-123');

    expect(result.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/auth/user/sessions/session-123',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should not acknowledge specific-session deletion for a replaced session', async () => {
    const sessionId = 'session-123';
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.deleteSession(sessionId),
      reply(204),
      ['session deletion request', 'stale session operation'],
      { ...originalSession(), access_token: sessionAccessToken(sessionId) },
    );

    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });
}

function clearsDeletedCurrentSessions(): void {
  it('should clear local state after deleting the current session', async () => {
    const sessionId = '00000000-0000-4000-8000-0000000000ab';
    volcano._setSession({
      access_token: sessionAccessToken(sessionId),
      refresh_token: 'current-refresh',
      user: { id: 'current-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockResolvedValueOnce(reply(204, {}));

    const result = await volcano.auth.deleteSession(sessionId.toUpperCase());

    expect(result.error).toBeNull();
    expect(volcano.accessToken).toBeNull();
    expect(volcano.refreshToken).toBeNull();
    expect(volcano.currentUser).toBeNull();
  });

  it('should clear the current session when its deletion response is lost', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000099';
    volcano._setSession({
      access_token: sessionAccessToken(sessionId),
      refresh_token: 'current-refresh',
      user: { id: 'current-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockRejectedValueOnce(new Error('connection lost'));

    const result = await volcano.auth.deleteSession(sessionId);

    expect(result.error?.message).toBe('connection lost');
    expect(volcano.accessToken).toBeNull();
    expect(volcano.refreshToken).toBeNull();
    expect(volcano.currentUser).toBeNull();
  });
}

function preservesRejectedSessionDeletions(): void {
  it('should preserve the current session when deletion is rejected', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000099';
    const accessToken = sessionAccessToken(sessionId);
    volcano._setSession({
      access_token: accessToken,
      refresh_token: null,
      user: { id: 'current-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock.mockResolvedValueOnce(reply(401, { error: 'expired' }));

    const result = await volcano.auth.deleteSession(sessionId);

    expect(result.error?.message).toBe('Session expired');
    expect(volcano.accessToken).toBe(accessToken);
    expect(volcano.currentUser?.id).toBe('current-user');
  });
}

function deletesRefreshedSessions(): void {
  it('should clear a refreshed current session after deletion', async () => {
    const sessionId = '00000000-0000-4000-8000-000000000099';
    volcano._setSession({
      access_token: sessionAccessToken(sessionId),
      refresh_token: 'old-refresh',
      user: { id: 'current-user', email: 'fixture@example.com', status: 'active' },
    });
    fetchMock
      .mockResolvedValueOnce(reply(401, { error: 'expired' }))
      .mockResolvedValueOnce(
        reply(200, {
          access_token: sessionAccessToken(sessionId),
          refresh_token: 'new-refresh',
          user: { id: 'current-user', email: 'fixture@example.com', status: 'active' },
          expires_in: 3600,
        }),
      )
      .mockResolvedValueOnce(reply(204, {}));

    const result = await volcano.auth.deleteSession(sessionId);

    expect(result.error).toBeNull();
    expect(volcano.accessToken).toBeNull();
    expect(volcano.refreshToken).toBeNull();
    expect(volcano.currentUser).toBeNull();
  });

  it('should return error on deleteSession failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(404, { error: 'Session not found' }));

    const result = await volcano.auth.deleteSession('invalid-session');

    expect(result.error?.message).toBe('Session not found');
  });
}

function deletesOtherSessions(): void {
  it('should delete all other sessions', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(204, {}));

    const result = await volcano.auth.deleteAllOtherSessions();

    expect(result.error).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      'https://api.test.com/auth/user/sessions',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('should not acknowledge deletion for a replaced session', async () => {
    const result = await settleAfterReplacement(volcano, () => volcano.auth.deleteAllOtherSessions(), reply(204), [
      'other session deletion request',
      'stale session operation',
    ]);

    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should return error on deleteAllOtherSessions failure', async () => {
    volcano.accessToken = TEST_ACCESS_TOKEN;

    fetchMock.mockResolvedValueOnce(reply(500, { error: 'Internal server error' }));

    const result = await volcano.auth.deleteAllOtherSessions();

    expect(result.error?.message).toBe('Internal server error');
  });
}

describe('VolcanoAuth session management', () => {
  describe('Session Management', () => {
    deletesSpecificSessions();
    clearsDeletedCurrentSessions();
    preservesRejectedSessionDeletions();
    deletesRefreshedSessions();
    deletesOtherSessions();
  });
});
