import { validateSessionContinuation } from './auth-continuity.ts';
import { AuthSessionOperations } from './auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from './auth-session-lifecycle.ts';
import { assertAuthUser, type CompleteSessionFields } from './auth-validation.ts';
import type { User } from './sdk-public-types.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

const ACCESS_TOKEN_KEY = 'volcano_access_token';
const REFRESH_TOKEN_KEY = 'volcano_refresh_token';

interface SessionInput {
  access_token: string;
  refresh_token?: string | null;
  user: unknown;
}

export interface PersistedAuthContext extends AuthContext {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface AuthSessionStateHost {
  _sessionGeneration: number;
  _sessionOperations: AuthSessionOperations<RefreshResult, SignOutResult>;
  _oauthExchangeError: unknown;
  _pendingUrlAuthNotify: boolean;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: User | null;
  _authCallbacks: ((user: User | null) => void)[];
  _getStorageItem(key: string): string | null;
  _setStorageItem(key: string, value: string): void;
  _removeStorageItem(key: string): void;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _clearSessionAtGeneration(generation: number): boolean;
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
  validateSessionContinuation(data, context, host.currentUser?.id);
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

/** Clears a rejected session, keeping storage another tab or instance has since replaced. */
export function clearRejectedSession(
  host: AuthSessionStateHost,
  context: AuthContext,
  rejectedRefreshToken: string | null,
): boolean {
  if (!host._isAuthContextCurrent(context) || context.refreshToken !== host.refreshToken) {
    return false;
  }
  const stored = host._getStorageItem(REFRESH_TOKEN_KEY) === rejectedRefreshToken;
  return clearSessionAtGeneration(host, context.generation, stored);
}

export function clearSessionAtGeneration(
  host: AuthSessionStateHost,
  generation: number,
  removeStored = true,
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
    host._removeStorageItem(ACCESS_TOKEN_KEY);
    host._removeStorageItem(REFRESH_TOKEN_KEY);
  }
  host._notifyAuthCallbacks(null);
  return true;
}

/**
 * Returns the captured session as another tab or instance last persisted it,
 * when that rotation continues the same server session.
 */
export function persistedSessionContext(
  host: AuthSessionStateHost,
  context: AuthContext,
): PersistedAuthContext | null {
  // Writers store the access token first, so an access token read after the refresh
  // token was stored with it or later; a mixed pair cannot pass the session check.
  const refreshToken = host._getStorageItem(REFRESH_TOKEN_KEY);
  const accessToken = host._getStorageItem(ACCESS_TOKEN_KEY);
  if (!isRotatedToken(refreshToken, context.refreshToken)) {
    return null;
  }
  // Storage may instead hold a separate sign-in, which this client must not adopt.
  const sessionId = extractSessionIdFromToken(context.accessToken);
  if (sessionId === null || !continuesSession(accessToken, sessionId)) {
    return null;
  }
  return Object.freeze({ ...context, accessToken, refreshToken });
}

function isRotatedToken(stored: string | null, captured: string | null): stored is string {
  return stored !== null && stored !== '' && stored !== captured;
}

function continuesSession(accessToken: string | null, sessionId: string): accessToken is string {
  return extractSessionIdFromToken(accessToken) === sessionId;
}

/** Adopts credentials from persistedSessionContext() without spending a refresh token. */
export function adoptPersistedSession(
  host: AuthSessionStateHost,
  context: AuthContext,
  persisted: PersistedAuthContext,
): boolean {
  if (
    !host._isAuthContextCurrent(context) ||
    context.refreshToken !== host.refreshToken ||
    context.operations.signingOut !== null
  ) {
    return false;
  }
  host.accessToken = persisted.accessToken;
  host.refreshToken = persisted.refreshToken;
  if (host.currentUser !== null) {
    host._notifyAuthCallbacks(host.currentUser);
  }
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
