import { validateSessionContinuation } from './auth-continuity.ts';
import { AuthSessionOperations } from './auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from './auth-session-lifecycle.ts';
import {
  isSameSession,
  readStoredSession,
  removeStoredSession,
  type SessionStorageHost,
  type StoredSession,
} from './auth-session-storage.ts';
import { assertAuthUser, type CompleteSessionFields } from './auth-validation.ts';
import type { User } from './sdk-public-types.ts';

interface SessionInput {
  access_token: string;
  refresh_token?: string | null;
  user: unknown;
}

export interface AuthSessionStateHost extends SessionStorageHost {
  _sessionGeneration: number;
  _sessionOperations: AuthSessionOperations<RefreshResult, SignOutResult>;
  _oauthExchangeError: unknown;
  _pendingUrlAuthNotify: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: User | null;
  _authCallbacks: ((user: User | null) => void)[];
  _writeStoredSession(session: StoredSession): void;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _clearSessionAtGeneration(generation: number, removeStored?: boolean): boolean;
  _notifyAuthCallbacks(user: User | null): void;
}

export function captureAuthContext(host: AuthSessionStateHost): AuthContext {
  return Object.freeze({
    generation: host._sessionGeneration,
    operations: host._sessionOperations,
    userId: host.currentUser?.id ?? null,
    accessToken: host.accessToken,
    refreshToken: host.refreshToken,
  });
}

export function adoptSessionInMemory(
  host: AuthSessionStateHost,
  session: CompleteSessionFields,
): void {
  host._sessionGeneration += 1;
  host._sessionOperations = new AuthSessionOperations();
  host._oauthExchangeError = null;
  host._pendingUrlAuthNotify = false;
  host.accessToken = session.access_token;
  host.refreshToken = session.refresh_token;
  host.currentUser = session.user;
}

export function isAuthContextCurrent(host: AuthSessionStateHost, context: AuthContext): boolean {
  return context.generation === host._sessionGeneration;
}

export function setSession(
  host: AuthSessionStateHost,
  data: SessionInput,
  expectedGeneration: number,
): boolean {
  if (expectedGeneration !== host._sessionGeneration) {
    return false;
  }
  assertAuthUser(data.user);
  host._oauthExchangeError = null;
  host.accessToken = data.access_token;
  host.refreshToken = data.refresh_token ?? null;
  host.currentUser = data.user;
  host._sessionGeneration += 1;
  host._sessionOperations = new AuthSessionOperations(data);
  host._pendingUrlAuthNotify = false;
  host._writeStoredSession({ access_token: host.accessToken, refresh_token: host.refreshToken });
  host._notifyAuthCallbacks(host.currentUser);
  return true;
}

export function setRefreshedSession(
  host: AuthSessionStateHost,
  data: CompleteSessionFields,
  context: AuthContext,
): boolean {
  if (!host._isAuthContextCurrent(context) || context.refreshToken !== host.refreshToken) {
    return false;
  }
  validateSessionContinuation(data, context, host.currentUser?.id);
  host._oauthExchangeError = null;
  host.accessToken = data.access_token;
  host.refreshToken = data.refresh_token;
  host.currentUser = data.user;
  host._pendingUrlAuthNotify = false;
  host._notifyAuthCallbacks(host.currentUser);
  return true;
}

export function clearSession(
  host: AuthSessionStateHost,
  context: AuthContext,
  removeStored?: boolean,
): boolean {
  if (!host._isAuthContextCurrent(context) || context.refreshToken !== host.refreshToken) {
    return false;
  }
  return host._clearSessionAtGeneration(context.generation, removeStored);
}

function storesCurrentSession(host: AuthSessionStateHost): boolean {
  const stored = readStoredSession(host);
  return stored !== null && isSameSession(stored, host.accessToken, host.refreshToken);
}

/**
 * By default, removes the stored session only when it holds this client's server
 * session, so another sign-in stored by a different tab or client stays.
 */
export function clearSessionAtGeneration(
  host: AuthSessionStateHost,
  generation: number,
  removeStored = storesCurrentSession(host),
): boolean {
  if (generation !== host._sessionGeneration) {
    return false;
  }
  host._oauthExchangeError = null;
  host._sessionOperations.clearLocalCredentials();
  host.accessToken = null;
  host.refreshToken = null;
  host.currentUser = null;
  host._sessionGeneration += 1;
  host._pendingUrlAuthNotify = false;
  if (removeStored) {
    removeStoredSession(host);
  }
  host._notifyAuthCallbacks(null);
  return true;
}

export function notifyAuthCallbacks(host: AuthSessionStateHost, user: User | null): void {
  for (const callback of host._authCallbacks.slice()) {
    try {
      callback(user);
    } catch (error) {
      console.error('[VolcanoAuth] Error in auth state callback:', error);
    }
  }
}
