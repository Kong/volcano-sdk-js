/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { AuthSessionChangedError, VolcanoAuth } from '../src/index.ts';
import { reply } from './auth-concurrency-fixtures.ts';
import { testAccessToken } from './auth-token-fixtures.ts';
import { installWindow, restoreWindow, settleAfterReplacement } from './support/volcano-auth-sessions-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);
const config = { apiUrl: 'https://api.test.com', anonKey: 'ak-test-anon-key' };
const TEST_ACCESS_TOKEN = testAccessToken('00000000-0000-0000-0000-000000000001');
let volcano: VolcanoAuth;

beforeEach(() => {
  installWindow({ document: {}, localStorage });
  volcano = new VolcanoAuth(config);
});

afterEach(restoreWindow);

function listsDefaultSessionPage(): void {
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
}

function listsCustomSessionPage(): void {
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
}

function rejectsUnavailableSessionLists(): void {
  it('should not return sessions for a replaced local session', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.getSessions(),
      reply(200, {
        sessions: [{ id: 'stale-session', provider: 'email' }],
        total: 1,
        page: 1,
        limit: 20,
        total_pages: 1,
      }),
      ['session list request', 'stale session operation'],
    );

    expect(result.sessions).toBeNull();
    expect(result.total).toBe(0);
    expect(AuthSessionChangedError.is(result.error)).toBe(true);
    expect(volcano.currentUser?.id).toBe('replacement-user');
  });

  it('should prefer a session-change error from a replaced request that fails', async () => {
    const result = await settleAfterReplacement(
      volcano,
      () => volcano.auth.getSessions(),
      reply(403, { error: 'old session rejected' }),
      ['failed session list request', 'stale session operation'],
    );

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
}

describe('VolcanoAuth session management', () => {
  describe('Session Management', () => {
    listsDefaultSessionPage();
    listsCustomSessionPage();
    rejectsUnavailableSessionLists();
  });
});
