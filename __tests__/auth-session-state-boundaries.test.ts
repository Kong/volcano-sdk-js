import { expect, jest, test } from '@jest/globals';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';
import {
  adoptSessionInMemory,
  type AuthSessionStateHost,
  captureAuthContext,
  clearSession,
  clearSessionAtGeneration,
  isAuthContextCurrent,
  notifyAuthCallbacks,
  setRefreshedSession,
  setSession,
} from '../src/auth-session-state.ts';
import { writeStoredSession } from '../src/auth-session-storage.ts';

const user = { id: 'user-1', email: 'user@example.com', status: 'active' } as const;
const nextSession = { access_token: 'new-access', refresh_token: 'new-refresh', user };
const oldRecord = { access_token: 'old-access', refresh_token: 'old-refresh' };

function record(storage: Map<string, string>): unknown {
  const value = storage.get('volcano_auth_session');
  return value === undefined ? undefined : JSON.parse(value);
}

function fixture(): { host: AuthSessionStateHost; storage: Map<string, string> } {
  const storage = new Map<string, string>([['volcano_auth_session', JSON.stringify(oldRecord)]]);
  const host: AuthSessionStateHost = {
    _sessionGeneration: 3,
    _sessionOperations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
    _oauthExchangeError: new Error('old redirect failure'),
    _pendingUrlAuthNotify: true,
    accessToken: 'old-access',
    refreshToken: 'old-refresh',
    currentUser: user,
    _authCallbacks: [],
    _writeStoredSession(session) {
      writeStoredSession(host, session);
    },
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
    _clearSessionAtGeneration(generation, removeStored) {
      return clearSessionAtGeneration(host, generation, removeStored);
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
  expect(record(storage)).toEqual(oldRecord);
  expect(notify).not.toHaveBeenCalled();

  expect(setSession(host, nextSession, 3)).toBe(true);
  expect(host._sessionGeneration).toBe(4);
  expect(record(storage)).toEqual({ access_token: 'new-access', refresh_token: 'new-refresh' });
  expect(host._sessionOperations.hasVerifiedPair('new-access', 'new-refresh')).toBe(true);
  expect(host._oauthExchangeError).toBeNull();
  expect(host._pendingUrlAuthNotify).toBe(false);
  expect(notify).toHaveBeenCalledWith(user);

  expect(setSession(host, { access_token: 'cookie-access', user }, 4)).toBe(true);
  expect(host.refreshToken).toBeNull();
  expect(record(storage)).toEqual({ access_token: 'cookie-access', refresh_token: null });

  expect(setSession(host, { access_token: 'blank-refresh', refresh_token: '', user }, 5)).toBe(
    true,
  );
  expect(record(storage)).toEqual({ access_token: 'blank-refresh', refresh_token: null });
});

test('refresh adopts only the captured session in memory and preserves its user identity', () => {
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
  // The refresh flow stores rotations itself, only while storage holds the spent token.
  expect(record(storage)).toEqual(oldRecord);
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
  expect(record(storage)).toEqual(oldRecord);
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
  expect(record(storage)).toEqual(oldRecord);

  expect(clearSession(host, context)).toBe(true);
  expect([host.accessToken, host.refreshToken, host.currentUser]).toEqual([null, null, null]);
  expect(host._sessionGeneration).toBe(4);
  expect(host._sessionOperations.locallyCleared).toBe(true);
  expect(host._oauthExchangeError).toBeNull();
  expect(host._pendingUrlAuthNotify).toBe(false);
  expect(storage.size).toBe(0);
  expect(notify).toHaveBeenCalledWith(null);
});

test('clearing removes the stored session only when it holds this server session', () => {
  const otherRecord = JSON.stringify({
    access_token: 'other-access',
    refresh_token: 'other-refresh',
  });

  const kept = fixture();
  expect(clearSession(kept.host, captureAuthContext(kept.host), false)).toBe(true);
  expect(record(kept.storage)).toEqual(oldRecord);

  const otherSignIn = fixture();
  otherSignIn.storage.set('volcano_auth_session', otherRecord);
  expect(clearSessionAtGeneration(otherSignIn.host, 3)).toBe(true);
  expect(otherSignIn.storage.get('volcano_auth_session')).toBe(otherRecord);

  const signedOut = fixture();
  signedOut.storage.delete('volcano_auth_session');
  expect(clearSessionAtGeneration(signedOut.host, 3)).toBe(true);
  expect(signedOut.storage.size).toBe(0);
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
