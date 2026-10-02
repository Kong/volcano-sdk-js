import { validateRefreshSource, validateSessionContinuation } from './auth-continuity.ts';
import type { RequestFailure, RequestResult } from './auth-request.ts';
import { AuthSessionOperations } from './auth-session.ts';
import {
  assertAuthTokenResponse,
  type AuthTokenFields,
  type CompleteSessionFields,
} from './auth-validation.ts';
import { AuthRefreshDiscardedError, AuthSessionChangedError } from './errors.ts';
import type { Session, User } from './sdk-public-types.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

interface RequestBase {
  status: number | null;
  data: unknown;
}

interface SuccessfulRequest extends RequestBase {
  ok: true;
  error: null;
}

export interface SuccessfulRefresh extends SuccessfulRequest {
  data: CompleteSessionFields & AuthTokenFields;
}

export type FailedRefresh = RequestFailure;

export type RefreshResult = SuccessfulRefresh | FailedRefresh;
export interface SignOutResult {
  error: Error | null;
}

export interface AuthContext {
  readonly generation: number;
  readonly operations: AuthSessionOperations<RefreshResult, SignOutResult>;
  readonly userId: string | null;
  readonly accessToken: string | null;
  readonly refreshToken: string | null;
}

export interface AuthLifecycleHost {
  readonly refreshToken: string | null;
  readonly currentUser: User | null;
  _oauthExchangeError: Error | null;
  _oauthExchangePromise: Promise<boolean> | null;
  _completeOAuthExchange(): Promise<void>;
  _captureAuthContext(): AuthContext;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _anonFetch(path: string, options: RequestInit): Promise<RequestResult>;
  _fetchSessionRefresh(context: AuthContext): Promise<RefreshResult>;
  _setRefreshedSession(data: CompleteSessionFields, context: AuthContext): boolean;
  _clearSession(context: AuthContext): boolean;
  _clearSessionAtGeneration(generation: number): boolean;
}

function normalizedError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback);
}

function hasToken(token: string | null): token is string {
  return token !== null && token !== '';
}

export async function signOut(host: AuthLifecycleHost): Promise<SignOutResult> {
  if (host._oauthExchangePromise !== null) {
    await host._completeOAuthExchange();
  }
  const context = host._captureAuthContext();
  if (!hasToken(context.accessToken) && !hasToken(context.refreshToken)) {
    return (await context.operations.pendingSignOut()) ?? { error: null };
  }
  return context.operations.signOut((refreshing) => signOutCaptured(host, context, refreshing));
}

type PrecedingRefresh = RefreshResult | { ok: false; error: unknown } | null;

async function precedingRefresh(
  refreshing: Promise<RefreshResult> | null,
): Promise<PrecedingRefresh> {
  return refreshing === null
    ? null
    : refreshing.catch((error: unknown): { ok: false; error: unknown } => ({ ok: false, error }));
}

function credentialsForSignOut(
  context: AuthContext,
  preceding: PrecedingRefresh,
): { accessToken: string | null; refreshToken: string | null } {
  return {
    accessToken: preceding?.ok === true ? preceding.data.access_token : context.accessToken,
    refreshToken: preceding?.ok === true ? preceding.data.refresh_token : context.refreshToken,
  };
}

async function logoutError(
  host: AuthLifecycleHost,
  context: AuthContext,
  refreshing: Promise<RefreshResult> | null,
): Promise<unknown> {
  const preceding = await precedingRefresh(refreshing);
  const { accessToken, refreshToken } = credentialsForSignOut(context, preceding);
  const verified = context.operations.hasVerifiedPair(accessToken, refreshToken);
  const sessionId = extractSessionIdFromToken(context.accessToken);
  if (sessionId !== null && !verified) {
    return revokeAccessSession(host, context, sessionId, preceding);
  }
  if (!hasToken(refreshToken)) {
    return null;
  }
  assertUsablePreceding(preceding, verified);
  const result = await host._anonFetch('/auth/logout', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  return result.error;
}

function assertUsablePreceding(preceding: PrecedingRefresh, verified: boolean): void {
  if (preceding !== null && preceding.ok !== true && !verified) {
    throw preceding.error;
  }
}

function finishSignOut(
  host: AuthLifecycleHost,
  context: AuthContext,
  error: Error | null,
): SignOutResult {
  const hasSessionId = extractSessionIdFromToken(context.accessToken) !== null;
  const cleared = hasSessionId
    ? host._clearSessionAtGeneration(context.generation)
    : host._clearSession(context);
  if (cleared) {
    return { error };
  }
  const changed = new AuthSessionChangedError();
  if (Boolean(error)) {
    Object.defineProperty(changed, 'cause', { configurable: true, value: error, writable: true });
  }
  return { error: changed };
}

export async function signOutCaptured(
  host: AuthLifecycleHost,
  context: AuthContext,
  refreshing: Promise<RefreshResult> | null,
): Promise<SignOutResult> {
  let error: unknown;
  try {
    error = await logoutError(host, context, refreshing);
  } catch (reason) {
    error = normalizedError(reason, 'Session revocation failed');
  }
  return finishSignOut(
    host,
    context,
    error === null ? null : normalizedError(error, 'Sign out failed'),
  );
}

function removeSession(host: AuthLifecycleHost, path: string, credential: string | null) {
  return host._anonFetch(path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${String(credential)}` },
  });
}

export async function revokeAccessSession(
  host: AuthLifecycleHost,
  context: AuthContext,
  sessionId: string,
  preceding: PrecedingRefresh,
): Promise<unknown> {
  // Sign-out blocks new refreshes but still uses a refresh already in flight.
  const { accessToken } = credentialsForSignOut(context, preceding);
  const path = `/auth/user/sessions/${encodeURIComponent(sessionId)}`;
  let result = await removeSession(host, path, accessToken);
  if (!(result.status === 401 && hasToken(context.refreshToken))) {
    return result.error;
  }
  if (preceding !== null) {
    return previousFailure(preceding, result.error);
  }
  const refreshed = await host._fetchSessionRefresh(context);
  if (refreshed.ok !== true) {
    return refreshed.error;
  }
  result = await removeSession(host, path, refreshed.data.access_token);
  return result.error;
}

function previousFailure(preceding: Exclude<PrecedingRefresh, null>, fallback: unknown): unknown {
  return Boolean(preceding.error) ? preceding.error : fallback;
}

export async function refreshSession(host: AuthLifecycleHost): Promise<RefreshResponse> {
  await host._completeOAuthExchange();
  const exchangeError = host._oauthExchangeError;
  host._oauthExchangeError = null;
  if (Boolean(exchangeError) && !hasToken(host.refreshToken)) {
    return { session: null, error: exchangeError };
  }
  return refreshSessionForContext(host, host._captureAuthContext());
}

interface RefreshResponse {
  session: Session | null;
  error: Error | null;
}

export async function refreshSessionForContext(
  host: AuthLifecycleHost,
  context: AuthContext,
): Promise<RefreshResponse> {
  if (!host._isAuthContextCurrent(context)) {
    return { session: null, error: new AuthRefreshDiscardedError() };
  }
  if (context.refreshToken !== host.refreshToken) {
    return { session: null, error: null };
  }
  if (!hasToken(context.refreshToken)) {
    return { session: null, error: new Error('No refresh token') };
  }
  try {
    validateRefreshSource(context);
  } catch (error) {
    return { session: null, error: normalizedError(error, 'Refresh failed') };
  }
  return performSessionRefresh(host, context);
}

export async function fetchSessionRefresh(
  host: AuthLifecycleHost,
  context: AuthContext,
): Promise<RefreshResult> {
  const verified = context.operations.hasVerifiedPair(context.accessToken, context.refreshToken);
  context.operations.verifyPair(null);
  const result = await host._anonFetch('/auth/refresh', {
    method: 'POST',
    body: JSON.stringify({ refresh_token: context.refreshToken }),
  });
  if (result.ok === true) {
    validateSuccessfulRefresh(result, context, expectedUserId(host, context));
    context.operations.verifyPair(result.data);
    return result;
  }
  if (result.status === 429 && verified) {
    // Rate limiting rejects before token rotation, so the original pair remains valid.
    context.operations.verifyPair({
      access_token: context.accessToken,
      refresh_token: context.refreshToken,
    });
  }
  return result;
}

function validateSuccessfulRefresh(
  result: SuccessfulRequest,
  context: AuthContext,
  userId: string | null | undefined,
): asserts result is SuccessfulRefresh {
  assertAuthTokenResponse(result.data);
  validateSessionContinuation(result.data, context, userId);
}

function expectedUserId(host: AuthLifecycleHost, context: AuthContext): string | null {
  if (!host._isAuthContextCurrent(context)) {
    return context.userId;
  }
  return host.currentUser?.id ?? null;
}

async function refreshResult(
  host: AuthLifecycleHost,
  context: AuthContext,
): Promise<RefreshResult> {
  const result = await host._fetchSessionRefresh(context);
  if (context.operations.signingOut === null) {
    if (result.ok === true) {
      host._setRefreshedSession(result.data, context);
    } else if (result.status === 401 || result.status === 403) {
      context.operations.refreshClearedSession = host._clearSession(context);
    }
  }
  return result;
}

function settledRefresh(
  host: AuthLifecycleHost,
  context: AuthContext,
  result: RefreshResult,
): RefreshResponse {
  if (result.ok !== true) {
    return { session: null, error: result.error };
  }
  if (!host._isAuthContextCurrent(context) || context.operations.signingOut !== null) {
    return { session: null, error: new AuthRefreshDiscardedError() };
  }
  return {
    session: {
      access_token: result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_in: result.data.expires_in,
    },
    error: null,
  };
}

export async function performSessionRefresh(
  host: AuthLifecycleHost,
  context: AuthContext,
): Promise<RefreshResponse> {
  try {
    const refreshing = context.operations.refresh(() => refreshResult(host, context));
    if (refreshing === null) {
      return { session: null, error: new AuthRefreshDiscardedError() };
    }
    return settledRefresh(host, context, await refreshing);
  } catch (error) {
    return {
      session: null,
      error: host._isAuthContextCurrent(context)
        ? normalizedError(error, 'Refresh failed')
        : new AuthRefreshDiscardedError(),
    };
  }
}
