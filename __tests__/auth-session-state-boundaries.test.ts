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

const user = { id: 'user-1', email: 'user@example.com' };
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
    setRefreshedSession(host, { ...nextSession, user: { id: 'user-2' } }, context);
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
