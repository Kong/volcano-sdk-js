/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.js';
import { deferred, reply, signal, within } from './auth-concurrency-fixtures.ts';

function createTestJwtToken(projectId: string, extraClaims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ project_id: projectId, ...extraClaims })).toString(
    'base64url',
  );
  return `${header}.${payload}.test-signature`;
}

const fetchMock = jest.mocked(globalThis.fetch);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN = createTestJwtToken('00000000-0000-0000-0000-000000000001');
let volcano: VolcanoAuth;

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

describe('VolcanoAuth session management', () => {
  describe('Session Management', () => {
    it('should get paginated sessions with default params', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          sessions: [
            {
              id: 'session-1',
              user_id: 'user-123',
              provider: 'email',
              expires_at: '2026-09-24T00:00:00Z',
              user_agent: 'Mozilla/5.0...',
              ip_address: '192.168.1.1',
              is_active: true,
              is_current: true,
            },
            {
              id: 'session-2',
              user_id: 'user-123',
              provider: 'google',
              expires_at: '2026-09-24T00:00:00Z',
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
      );

      const result = await volcano.auth.getSessions();

      expect(result.sessions).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBe(1);
      expect(result.error).toBeNull();
      expect(result.sessions?.[0]?.is_current).toBe(true);
      expect(result.sessions?.[1]?.is_current).toBe(false);
    });

    it('should get sessions with custom pagination params', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(
        reply(200, {
          sessions: [
            {
              id: 'session-3',
              user_id: 'user-123',
              provider: 'email',
              expires_at: '2026-09-24T00:00:00Z',
              is_active: true,
              is_current: false,
            },
          ],
          total: 25,
          page: 2,
          limit: 10,
          total_pages: 3,
        }),
      );

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

    it('should not return sessions for a replaced local session', async () => {
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

      const request = volcano.auth.getSessions();
      await within(started.promise, 'session list request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(
        reply(200, {
          sessions: [{ id: 'stale-session', provider: 'email' }],
          total: 1,
          page: 1,
          limit: 20,
          total_pages: 1,
        }),
      );

      const result = await within(request, 'stale session operation');

      expect(result.sessions).toBeNull();
      expect(result.total).toBe(0);
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should prefer a session-change error from a replaced request that fails', async () => {
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

      const request = volcano.auth.getSessions();
      await within(started.promise, 'failed session list request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(403, { error: 'old session rejected' }));

      const result = await within(request, 'stale session operation');

      expect(result.sessions).toBeNull();
      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should return error when not authenticated for getSessions', async () => {
      volcano.accessToken = null;

      const result = await volcano.auth.getSessions();

      expect(result.sessions).toBeNull();
      expect(result.error).toBeDefined();
    });

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
      volcano._setSession({
        access_token: createTestJwtToken('00000000-0000-0000-0000-000000000001', {
          session_id: sessionId,
        }),
        refresh_token: 'original-refresh',
        user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
      });
      const response = deferred<Response>();
      const started = signal();
      fetchMock.mockImplementationOnce(() => {
        started.resolve();
        return response.promise;
      });

      const request = volcano.auth.deleteSession(sessionId);
      await within(started.promise, 'session deletion request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(204));

      const result = await within(request, 'stale session operation');

      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should clear local state after deleting the current session', async () => {
      const sessionId = '00000000-0000-4000-8000-0000000000ab';
      volcano._setSession({
        access_token: createTestJwtToken('00000000-0000-0000-0000-000000000001', {
          session_id: sessionId,
        }),
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
        access_token: createTestJwtToken('00000000-0000-0000-0000-000000000001', {
          session_id: sessionId,
        }),
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

    it('should preserve the current session when deletion is rejected', async () => {
      const sessionId = '00000000-0000-4000-8000-000000000099';
      const accessToken = createTestJwtToken('00000000-0000-0000-0000-000000000001', {
        session_id: sessionId,
      });
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

    it('should clear a refreshed current session after deletion', async () => {
      const sessionId = '00000000-0000-4000-8000-000000000099';
      volcano._setSession({
        access_token: createTestJwtToken('00000000-0000-0000-0000-000000000001', {
          session_id: sessionId,
        }),
        refresh_token: 'old-refresh',
        user: { id: 'current-user', email: 'fixture@example.com', status: 'active' },
      });
      fetchMock
        .mockResolvedValueOnce(reply(401, { error: 'expired' }))
        .mockResolvedValueOnce(
          reply(200, {
            access_token: createTestJwtToken('00000000-0000-0000-0000-000000000001', {
              session_id: sessionId,
            }),
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

      const request = volcano.auth.deleteAllOtherSessions();
      await within(started.promise, 'other session deletion request');
      volcano._setSession({
        access_token: 'replacement-access',
        refresh_token: 'replacement-refresh',
        user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
      });
      response.resolve(reply(204));

      const result = await within(request, 'stale session operation');

      expect(AuthSessionChangedError.is(result.error)).toBe(true);
      expect(volcano.currentUser?.id).toBe('replacement-user');
    });

    it('should return error on deleteAllOtherSessions failure', async () => {
      volcano.accessToken = TEST_ACCESS_TOKEN;

      fetchMock.mockResolvedValueOnce(reply(500, { error: 'Internal server error' }));

      const result = await volcano.auth.deleteAllOtherSessions();

      expect(result.error?.message).toBe('Internal server error');
    });
  });
});
