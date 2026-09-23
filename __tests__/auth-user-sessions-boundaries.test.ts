import { expect, jest, test } from '@jest/globals';
import type { RequestResult } from '../src/auth-request.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import { type AuthUserSessionsHost, deleteSession } from '../src/auth-user-sessions.ts';
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
