import { expect, jest, test } from '@jest/globals';
import type { RequestResult } from '../src/auth-request.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import {
  type AuthUserSessionsHost,
  deleteSession,
  getSessions,
} from '../src/auth-user-sessions.ts';
import { AuthSessionChangedError } from '../src/errors.ts';

const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const token = `header.${Buffer.from(JSON.stringify({ session_id: sessionId })).toString('base64url')}.signature`;
const context: AuthContext = {
  generation: 7,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: token,
  refreshToken: 'refresh',
};

function fixture(result: RequestResult): {
  host: AuthUserSessionsHost;
  clear: ReturnType<typeof jest.fn<(generation: number) => boolean>>;
} {
  const clear = jest.fn<(generation: number) => boolean>(() => false);
  return {
    host: {
      _authFetchWithContext: () => Promise.resolve({ result, context }),
      _isAuthContextCurrent: () => false,
      _clearSessionAtGeneration: clear,
    },
    clear,
  };
}

test('a failed current-session delete preserves the delete error when local ownership changes', async () => {
  const failure = new Error('connection lost');
  const { host, clear } = fixture({ ok: false, status: null, data: null, error: failure });

  const { error } = await deleteSession(host, sessionId);

  expect(clear).toHaveBeenCalledWith(7);
  expect(error).toBeInstanceOf(AuthSessionChangedError);
  expect(error?.cause).toBe(failure);
  expect(Object.getOwnPropertyDescriptor(error, 'cause')).toEqual({
    value: failure,
    writable: true,
    configurable: true,
    enumerable: false,
  });
});

test('a successful current-session delete does not invent a cause after ownership changes', async () => {
  const { host } = fixture({ ok: true, status: 204, data: null, error: null });

  const { error } = await deleteSession(host, sessionId);

  expect(error).toBeInstanceOf(AuthSessionChangedError);
  if (error === null) {
    throw new Error('Expected a changed-session error');
  }
  expect(Object.hasOwn(error, 'cause')).toBe(false);
});

test('session pagination omits defaults and sends explicit page and limit', async () => {
  const data = { sessions: [], total: 0, page: 1, limit: 20, total_pages: 0 };
  const { host } = fixture({ ok: true, status: 200, data, error: null });
  host._isAuthContextCurrent = () => true;
  const paths: string[] = [];
  host._authFetchWithContext = (path) => {
    paths.push(typeof path === 'function' ? path() : path);
    return Promise.resolve({ result: { ok: true, status: 200, data, error: null }, context });
  };

  expect(await getSessions(host, { page: 1, limit: 20 })).toEqual({ ...data, error: null });
  expect(await getSessions(host, { page: 3, limit: 7 })).toEqual({ ...data, error: null });
  expect(paths).toEqual(['/auth/user/sessions', '/auth/user/sessions?page=3&limit=7']);
});

test('a network failure deleting the current session still clears owned local credentials', async () => {
  const failure = new Error('connection lost');
  const { host, clear } = fixture({ ok: false, status: null, data: null, error: failure });
  clear.mockReturnValue(true);

  expect(await deleteSession(host, sessionId)).toEqual({ error: failure });
  expect(clear).toHaveBeenCalledWith(7);
});
