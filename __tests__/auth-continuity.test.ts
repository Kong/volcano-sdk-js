import { describe, expect, test } from '@jest/globals';
import {
  type RefreshContext,
  sessionIdsEqual,
  validateRefreshSource,
  validateSessionContinuation,
} from '../src/auth-continuity.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';

const sessionId = 'abcdef12-0000-4000-8000-000000000003';
const otherSessionId = 'abcdef12-0000-4000-8000-000000000004';

function token(id: string): string {
  return `header.${btoa(JSON.stringify({ session_id: id }))}.signature`;
}

function context(accessToken: string | null, verified = false): RefreshContext {
  return {
    accessToken,
    refreshToken: 'refresh',
    operations: new AuthSessionOperations(
      verified ? { access_token: accessToken, refresh_token: 'refresh' } : null,
    ),
  };
}

const session = {
  access_token: token(sessionId),
  refresh_token: 'renewed-refresh',
  user: { id: 'user' },
};

describe('refresh source', () => {
  test.each([null, '', 'malformed', token('not-a-uuid')])(
    'refuses unverified credentials without a session identifier: %p',
    (accessToken) => {
      expect(() => {
        validateRefreshSource(context(accessToken));
      }).toThrow('Cannot refresh supplied credentials without a session identifier');
    },
  );

  test('accepts verified credentials without decoding a continuity claim', () => {
    expect(() => {
      validateRefreshSource(context('opaque', true));
    }).not.toThrow();
  });

  test('requires the verified refresh token to belong to the captured access token', () => {
    const captured = context('opaque', true);
    captured.refreshToken = 'unverified-refresh';
    expect(() => {
      validateRefreshSource(captured);
    }).toThrow('Cannot refresh supplied credentials without a session identifier');
  });

  test('accepts supplied credentials constrained to a server session', () => {
    expect(() => {
      validateRefreshSource(context(token(sessionId)));
    }).not.toThrow();
  });
});

describe('session continuation', () => {
  test('accepts the same server session and user without mutating the response', () => {
    const original = { ...session, user: { ...session.user } };
    validateSessionContinuation(session, context(token(sessionId.toUpperCase())), 'user');
    expect(session).toEqual(original);
  });

  test.each([undefined, null, '', false, 0])('accepts an unknown user identity: %p', (userId) => {
    expect(() => {
      validateSessionContinuation(session, context('opaque', true), userId);
    }).not.toThrow();
  });

  test.each(['different-user', 'USER', true, {}])('rejects a changed user: %p', (userId) => {
    expect(() => {
      validateSessionContinuation(session, context(token(sessionId)), userId);
    }).toThrow('Refreshed session belongs to a different user');
  });

  test.each(['opaque', token(otherSessionId)])(
    'rejects lost or changed session identity: %s',
    (accessToken) => {
      expect(() => {
        validateSessionContinuation(
          { ...session, access_token: accessToken },
          context(token(sessionId)),
          'user',
        );
      }).toThrow('Refreshed credentials belong to a different server session');
    },
  );

  test.each([
    [null, 'Session must be an object'],
    [{}, 'Session access_token must be a non-empty string'],
    [{ access_token: 'access' }, 'Session refresh_token must be a non-empty string'],
    [{ ...session, user: null }, 'Session user must be an object'],
    [{ ...session, user: { id: '' } }, 'Session user ID must be a non-empty string'],
  ])('validates complete credentials before continuity: %p', (data, message) => {
    expect(() => {
      validateSessionContinuation(data, context(token(otherSessionId)), 'other-user');
    }).toThrow(message);
  });
});

describe('case-insensitive session comparison', () => {
  test.each([
    [sessionId, sessionId.toUpperCase(), true],
    [sessionId, otherSessionId, false],
    [null, sessionId, false],
    [sessionId, undefined, false],
    ['', '', true],
  ])('compares %p and %p', (left, right, equal) => {
    expect(sessionIdsEqual(left, right)).toBe(equal);
  });
});
