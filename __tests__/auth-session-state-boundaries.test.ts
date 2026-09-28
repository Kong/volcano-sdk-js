import { expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import {
  adoptPersistedSession,
  adoptSessionInMemory,
  type AuthSessionStateHost,
  captureAuthContext,
  clearRejectedSession,
  clearSession,
  clearSessionAtGeneration,
  isAuthContextCurrent,
  notifyAuthCallbacks,
  persistedSessionContext,
  setRefreshedSession,
  setSession,
} from '../src/auth-session-state.ts';
import { sessionToken } from './session-fixtures.ts';

const user = { id: 'user-1', email: 'user@example.com', status: 'active' } as const;
const nextSession = { access_token: 'new-access', refresh_token: 'new-refresh', user };

function fixture(): { host: AuthSessionStateHost; storage: Map<string, string> } {
  const storage = new Map<string, string>([
    ['volcano_access_token', 'old-access'],
    ['volcano_refresh_token', 'old-refresh'],
  ]);
  const host: AuthSessionStateHost = {
    _sessionGeneration: 3,
    _sessionOperations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
    _oauthExchangeError: new Error('old redirect failure'),
    _pendingUrlAuthNotify: true,
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    currentUser: user,
    _authCallbacks: [],
    _getStorageItem(key) {
      return storage.get(key) ?? null;
    },
    _setStorageItem(key, value) {
      storage.set(key, value);
    },
    _removeStorageItem(key) {
      storage.delete(key);
    },
    _isAuthContextCurrent(context) {
      return isAuthContextCurrent(host, context);
    },
    _clearSessionAtGeneration(generation) {
      return clearSessionAtGeneration(host, generation);
    },
    _notifyAuthCallbacks(value) {
      notifyAuthCallbacks(host, value);
    },
  };
  return { host, storage };
}

test('captured auth context is frozen and binds credentials, generation, and user identity', () => {
  const { host } = fixture();
  const captured = captureAuthContext(host);

  expect(captured).toEqual({
    generation: 3,
    operations: host._sessionOperations,
    userId: 'user-1',
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
  });
  expect(Object.isFrozen(captured)).toBe(true);
  host.currentUser = null;
  expect(captureAuthContext(host).userId).toBeNull();
  expect(isAuthContextCurrent(host, captured)).toBe(true);
  host._sessionGeneration = 4;
  expect(isAuthContextCurrent(host, captured)).toBe(false);
});

test('in-memory adoption replaces captured operations and clears redirect state', () => {
  const { host } = fixture();
  const priorOperations = host._sessionOperations;

  adoptSessionInMemory(host, nextSession);

  expect(host._sessionGeneration).toBe(4);
  expect(host._sessionOperations).not.toBe(priorOperations);
  expect(host._oauthExchangeError).toBeNull();
  expect(host._pendingUrlAuthNotify).toBe(false);
  expect([host.accessToken, host.refreshToken, host.currentUser]).toEqual([
    'new-access',
    'new-refresh',
    user,
  ]);
});

test('setSession rejects stale generations and persists only the accepted credentials', () => {
  const { host, storage } = fixture();
  const notify = jest.fn<(value: unknown) => void>();
  host._authCallbacks.push(notify);

  expect(setSession(host, nextSession, 2)).toBe(false);
  expect(host.accessToken).toBe('old-access');
  expect(storage.get('volcano_access_token')).toBe('old-access');
  expect(notify).not.toHaveBeenCalled();

  expect(setSession(host, nextSession, 3)).toBe(true);
  expect(host._sessionGeneration).toBe(4);
  expect(storage.get('volcano_access_token')).toBe('new-access');
  expect(storage.get('volcano_refresh_token')).toBe('new-refresh');
  expect(host._sessionOperations.hasVerifiedPair('new-access', 'new-refresh')).toBe(true);
  expect(host._oauthExchangeError).toBeNull();
  expect(host._pendingUrlAuthNotify).toBe(false);
  expect(notify).toHaveBeenCalledWith(user);

  expect(setSession(host, { access_token: 'cookie-access', user }, 4)).toBe(true);
  expect(host.refreshToken).toBeNull();
  expect(storage.has('volcano_refresh_token')).toBe(false);

  expect(setSession(host, { access_token: 'blank-refresh', refresh_token: '', user }, 5)).toBe(
    true,
  );
  expect(storage.has('volcano_refresh_token')).toBe(false);
});

test('refresh adopts only the captured session and preserves its user identity', () => {
  const { host, storage } = fixture();
  const notify = jest.fn<(value: unknown) => void>();
  host._authCallbacks.push(notify);
  const context = captureAuthContext(host);

  expect(setRefreshedSession(host, nextSession, { ...context, generation: 2 })).toBe(false);
  expect(setRefreshedSession(host, nextSession, { ...context, refreshToken: 'other' })).toBe(false);
  expect(host.accessToken).toBe('old-access');
  expect(notify).not.toHaveBeenCalled();

  expect(setRefreshedSession(host, nextSession, context)).toBe(true);
  expect([host.accessToken, host.refreshToken, host.currentUser]).toEqual([
    'new-access',
    'new-refresh',
    user,
  ]);
  expect(storage.get('volcano_access_token')).toBe('new-access');
  expect(storage.get('volcano_refresh_token')).toBe('new-refresh');
  expect(host._pendingUrlAuthNotify).toBe(false);
  expect(notify).toHaveBeenCalledWith(user);
});

test('refresh rejects credentials for a different user without replacing the current session', () => {
  const { host, storage } = fixture();
  const context = captureAuthContext(host);

  expect(() => {
    setRefreshedSession(host, { ...nextSession, user: { ...user, id: 'user-2' } }, context);
  }).toThrow('Refreshed session belongs to a different user');
  expect(host.accessToken).toBe('old-access');
  expect(storage.get('volcano_refresh_token')).toBe('old-refresh');
});

test('clearSession rejects stale ownership and removes only current credentials', () => {
  const { host, storage } = fixture();
  const notify = jest.fn<(value: unknown) => void>();
  host._authCallbacks.push(notify);
  const context = captureAuthContext(host);

  expect(clearSessionAtGeneration(host, 2)).toBe(false);
  expect(clearSession(host, { ...context, refreshToken: 'other' })).toBe(false);
  expect(clearSession(host, { ...context, generation: 2 })).toBe(false);
  expect(host.accessToken).toBe('old-access');
  expect(storage.get('volcano_refresh_token')).toBe('old-refresh');

  expect(clearSession(host, context)).toBe(true);
  expect([host.accessToken, host.refreshToken, host.currentUser]).toEqual([null, null, null]);
  expect(host._sessionGeneration).toBe(4);
  expect(host._sessionOperations.locallyCleared).toBe(true);
  expect(host._oauthExchangeError).toBeNull();
  expect(host._pendingUrlAuthNotify).toBe(false);
  expect(storage.size).toBe(0);
  expect(notify).toHaveBeenCalledWith(null);
});

const sessionId = '00000000-0000-4000-8000-00000000000a';
const currentAccess = sessionToken(sessionId);
const rotatedAccess = sessionToken(sessionId, true);

function rotatedFixture(stored: [string | null, string | null] = [rotatedAccess, 'rotated']) {
  const fixed = fixture();
  fixed.host.accessToken = currentAccess;
  fixed.storage.clear();
  const [access, refresh] = stored;
  if (access !== null) {
    fixed.storage.set('volcano_access_token', access);
  }
  if (refresh !== null) {
    fixed.storage.set('volcano_refresh_token', refresh);
  }
  return { ...fixed, context: captureAuthContext(fixed.host) };
}

test('reads a rotation of the captured server session from storage', () => {
  const { host, context } = rotatedFixture();

  const persisted = persistedSessionContext(host, context);
  expect(persisted).toEqual({
    ...context,
    accessToken: rotatedAccess,
    refreshToken: 'rotated',
    sessionId,
  });
  expect(Object.isFrozen(persisted)).toBe(true);
});

test.each([
  ['no stored refresh token', rotatedAccess, null],
  ['an empty stored refresh token', rotatedAccess, ''],
  ['the captured refresh token', rotatedAccess, 'old-refresh'],
  ['no stored access token', null, 'rotated'],
  ['another server session', sessionToken('00000000-0000-4000-8000-00000000000b'), 'rotated'],
  ['an access token without a session', 'opaque-access', 'rotated'],
])('ignores storage with %s', (_label, access, refresh) => {
  const { host, context } = rotatedFixture([access, refresh]);
  expect(persistedSessionContext(host, context)).toBeNull();
});

test('does not pair a stored refresh token with an older access token', () => {
  const { host, storage, context } = rotatedFixture();
  const otherSignIn = sessionToken('00000000-0000-4000-8000-00000000000b');
  // Another tab signs in between this client's two storage reads.
  host._getStorageItem = (key) => {
    const value = storage.get(key) ?? null;
    storage.set('volcano_access_token', otherSignIn);
    storage.set('volcano_refresh_token', 'other-refresh');
    return value;
  };

  expect(persistedSessionContext(host, context)).toBeNull();
});

test('does not pair a stored access token with the refresh token it replaced', () => {
  const { host, storage, context } = rotatedFixture();
  const newerAccess = sessionToken(sessionId, true);
  // Another tab's rotation lands between this client's reads.
  host._getStorageItem = (key) => {
    const value = storage.get(key) ?? null;
    storage.set('volcano_access_token', newerAccess);
    storage.set('volcano_refresh_token', 'newer');
    return value;
  };

  expect(persistedSessionContext(host, context)).toBeNull();
});

test('ignores storage when the captured access token has no session', () => {
  const { host, storage } = fixture();
  storage.set('volcano_access_token', 'other-opaque-access');
  storage.set('volcano_refresh_token', 'rotated');
  expect(persistedSessionContext(host, captureAuthContext(host))).toBeNull();
});

test.each([
  ['a known user', user, [user]],
  ['an unknown user', null, []],
])('adopts persisted credentials for %s without writing storage', (_label, currentUser, calls) => {
  const { host, storage, context } = rotatedFixture();
  host.currentUser = currentUser;
  const notify = jest.fn<(value: unknown) => void>();
  host._authCallbacks.push(notify);
  const persisted = persistedSessionContext(host, context);
  if (persisted === null) {
    throw new Error('Expected a persisted session');
  }
  storage.clear();

  expect(adoptPersistedSession(host, context, persisted)).toBe(true);
  expect([host.accessToken, host.refreshToken, host._sessionGeneration]).toEqual([
    rotatedAccess,
    'rotated',
    3,
  ]);
  expect(storage.size).toBe(0);
  expect(notify.mock.calls).toEqual(calls.map((value) => [value]));
});

test.each(['stale generation', 'replaced refresh token', 'sign-out'])(
  'does not adopt persisted credentials after a %s',
  (change) => {
    const { host, context } = rotatedFixture();
    const persisted = persistedSessionContext(host, context);
    if (persisted === null) {
      throw new Error('Expected a persisted session');
    }
    let captured = context;
    if (change === 'stale generation') {
      captured = { ...context, generation: 2 };
    } else if (change === 'replaced refresh token') {
      host.refreshToken = 'replacement';
    } else {
      void context.operations.signOut(() => Promise.resolve({ error: null }));
    }

    expect(adoptPersistedSession(host, captured, persisted)).toBe(false);
    expect(host.accessToken).toBe(currentAccess);
  },
);

test.each([
  ['still holds the rejected token', 'old-refresh', true, 0],
  ['holds another token', 'newer-refresh', true, 2],
  ['may be changing without a cross-tab lock', 'old-refresh', false, 2],
])('clears a rejected session when storage %s', (_label, storedRefresh, shared, storedKeys) => {
  const { host, storage } = fixture();
  storage.set('volcano_refresh_token', storedRefresh);
  const notify = jest.fn<(value: unknown) => void>();
  host._authCallbacks.push(notify);
  const context = captureAuthContext(host);

  expect(clearRejectedSession(host, { ...context, generation: 2 }, 'old-refresh', shared)).toBe(
    false,
  );
  expect(clearRejectedSession(host, { ...context, refreshToken: 'other' }, 'other', shared)).toBe(
    false,
  );
  expect(host.accessToken).toBe('old-access');

  expect(clearRejectedSession(host, context, 'old-refresh', shared)).toBe(true);
  expect([host.accessToken, host.refreshToken, host.currentUser]).toEqual([null, null, null]);
  expect(host._sessionGeneration).toBe(4);
  expect(storage.size).toBe(storedKeys);
  expect(notify).toHaveBeenCalledWith(null);
});

test('a failing auth callback does not prevent later subscribers from receiving state', () => {
  const { host } = fixture();
  const failure = new Error('subscriber failed');
  const error = jest.spyOn(console, 'error').mockImplementation((message: unknown) => {
    expect(message).toBe('[VolcanoAuth] Error in auth state callback:');
  });
  const next = jest.fn<(value: unknown) => void>();
  host._authCallbacks.push(() => {
    throw failure;
  }, next);

  notifyAuthCallbacks(host, user);

  expect(error).toHaveBeenCalledWith('[VolcanoAuth] Error in auth state callback:', failure);
  expect(next).toHaveBeenCalledWith(user);
  error.mockRestore();
});

test('new listeners join after the current auth notification finishes', () => {
  const { host } = fixture();
  const received: string[] = [];
  host._authCallbacks.push(() => {
    received.push('existing');
    host._authCallbacks.push(() => {
      received.push('new');
    });
  });

  notifyAuthCallbacks(host, user);
  expect(received).toEqual(['existing']);

  notifyAuthCallbacks(host, user);
  expect(received).toEqual(['existing', 'existing', 'new']);
});
