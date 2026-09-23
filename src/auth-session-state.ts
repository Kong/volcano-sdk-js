import { validateSessionContinuation } from './auth-continuity.ts';
import { optionalField } from './auth-response.ts';
import { AuthSessionOperations } from './auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from './auth-session-lifecycle.ts';
import type { CompleteSessionFields } from './auth-validation.ts';

const ACCESS_TOKEN_KEY = 'volcano_access_token';
const REFRESH_TOKEN_KEY = 'volcano_refresh_token';

interface SessionInput {
  access_token: string;
  refresh_token?: string | null;
  user: unknown;
}

export interface AuthSessionStateHost {
  _sessionGeneration: number;
  _sessionOperations: AuthSessionOperations<RefreshResult, SignOutResult>;
  _oauthExchangeError: unknown;
  _pendingUrlAuthNotify: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: unknown;
  _authCallbacks: ((user: unknown) => void)[];
  _setStorageItem(key: string, value: string): void;
  _removeStorageItem(key: string): void;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _clearSessionAtGeneration(generation: number): boolean;
  _notifyAuthCallbacks(user: unknown): void;
}

export function captureAuthContext(host: AuthSessionStateHost): AuthContext {
  const candidateId = optionalField(host.currentUser, 'id');
  return Object.freeze({
    generation: host._sessionGeneration,
    operations: host._sessionOperations,
    userId: typeof candidateId === 'string' ? candidateId : null,
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
  host._oauthExchangeError = null;
  host.accessToken = data.access_token;
  host.refreshToken = data.refresh_token ?? null;
  host.currentUser = data.user;
  host._sessionGeneration += 1;
  host._sessionOperations = new AuthSessionOperations(data);
  host._pendingUrlAuthNotify = false;
  host._setStorageItem(ACCESS_TOKEN_KEY, host.accessToken);
  if (host.refreshToken !== null && host.refreshToken !== '') {
    host._setStorageItem(REFRESH_TOKEN_KEY, host.refreshToken);
  } else {
    host._removeStorageItem(REFRESH_TOKEN_KEY);
  }
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
  const candidateId = optionalField(host.currentUser, 'id');
  validateSessionContinuation(data, context, candidateId);
  host._oauthExchangeError = null;
  host.accessToken = data.access_token;
  host.refreshToken = data.refresh_token;
  host.currentUser = data.user;
  host._pendingUrlAuthNotify = false;
  host._setStorageItem(ACCESS_TOKEN_KEY, host.accessToken);
  host._setStorageItem(REFRESH_TOKEN_KEY, host.refreshToken);
  host._notifyAuthCallbacks(host.currentUser);
  return true;
}

export function clearSession(host: AuthSessionStateHost, context: AuthContext): boolean {
  if (!host._isAuthContextCurrent(context) || context.refreshToken !== host.refreshToken) {
    return false;
  }
  return host._clearSessionAtGeneration(context.generation);
}

export function clearSessionAtGeneration(host: AuthSessionStateHost, generation: number): boolean {
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
  host._removeStorageItem(ACCESS_TOKEN_KEY);
  host._removeStorageItem(REFRESH_TOKEN_KEY);
  host._notifyAuthCallbacks(null);
  return true;
}

export function notifyAuthCallbacks(host: AuthSessionStateHost, user: unknown): void {
  for (const callback of host._authCallbacks.slice()) {
    try {
      callback(user);
    } catch (error) {
      console.error('[VolcanoAuth] Error in auth state callback:', error);
    }
  }
}
