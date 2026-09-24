import { expect, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import { type AuthUserSessionsHost, getSessions } from '../src/auth-user-sessions.ts';
import type { AuthSession } from '../src/sdk-public-types.ts';

const context: AuthContext = {
  generation: 1,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: 'access',
  refreshToken: 'refresh',
};

const session: AuthSession = {
  id: 'session-1',
  user_id: 'user-1',
  provider: 'email',
  expires_at: '2026-09-24T00:00:00Z',
  is_active: true,
  is_current: true,
};

function hostWith(data: unknown): AuthUserSessionsHost {
  return {
    _isAuthContextCurrent: () => true,
    _clearSessionAtGeneration: () => false,
    _authFetchWithContext: () =>
      Promise.resolve({ result: { ok: true, status: 200, data, error: null }, context }),
  };
}

function response(sessions: unknown): Record<string, unknown> {
  return { sessions, total: 1, page: 1, limit: 20, total_pages: 1 };
}

test('accepts required session fields without invented timestamps', async () => {
  await expect(getSessions(hostWith(response([session])), {})).resolves.toEqual({
    ...response([session]),
    error: null,
  });
});

test.each(['email', 'google', 'github', 'microsoft', 'apple', 'anonymous'] as const)(
  'accepts a %s session provider',
  async (provider) => {
    const linked = { ...session, provider };
    await expect(getSessions(hostWith(response([linked])), {})).resolves.toMatchObject({
      sessions: [linked],
      error: null,
    });
  },
);

test.each([
  'user_agent',
  'ip_address',
  'last_ip_address',
  'last_activity_at',
  'session_started_at',
  'created_at',
  'updated_at',
] as const)('rejects a non-string %s field', async (field) => {
  await expect(getSessions(hostWith(response([{ ...session, [field]: 42 }])), {})).rejects.toThrow(
    'Auth sessions response must contain valid sessions',
  );
});

test.each([
  null,
  'session',
  [null],
  [Object.assign([], session)],
  [Object.assign(() => 0, session)],
  [{ ...session, id: 12 }],
  [{ ...session, user_id: null }],
  [{ ...session, provider: 'unsupported' }],
  [{ ...session, expires_at: 12 }],
  [{ ...session, is_active: 1 }],
  [{ ...session, is_current: null }],
  [{ ...session, updated_at: 12 }],
])('rejects malformed session arrays: %p', async (sessions) => {
  await expect(getSessions(hostWith(response(sessions)), {})).rejects.toThrow(
    'Auth sessions response must contain valid sessions',
  );
});

test.each([
  ['total', -1],
  ['page', 0],
  ['limit', 0],
  ['total_pages', 1.5],
] as const)('rejects invalid pagination %s: %p', async (name, value) => {
  const data = { ...response([session]), [name]: value };
  await expect(getSessions(hostWith(data), {})).rejects.toThrow(
    `Auth sessions ${name} must be an integer of at least ${String(name === 'page' || name === 'limit' ? 1 : 0)}`,
  );
});

test('preserves omitted optional session-list fields without inventing defaults', async () => {
  await expect(getSessions(hostWith({}), {})).resolves.toEqual({
    sessions: undefined,
    total: undefined,
    page: undefined,
    limit: undefined,
    total_pages: undefined,
    error: null,
  });
});

test.each(['sessions', 'total', 'page', 'limit', 'total_pages'])(
  'preserves a session-list response when only %s is omitted',
  async (field) => {
    const data = response([session]);
    Reflect.deleteProperty(data, field);
    await expect(getSessions(hostWith(data), {})).resolves.toEqual({
      ...data,
      [field]: undefined,
      error: null,
    });
  },
);
