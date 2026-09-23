import { sessionIdsEqual } from './auth-continuity.ts';
import type { ContextRequest, RequestResult } from './auth-request.ts';
import { requiredField } from './auth-response.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import { AuthSessionChangedError } from './errors.ts';
import type { AuthSession, SessionsResponse } from './sdk-public-types.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

const defaultLimit = 20;
const sessionProviders = new Set<unknown>([
  'email',
  'google',
  'github',
  'microsoft',
  'apple',
  'anonymous',
]);

export interface AuthUserSessionsHost {
  _authFetchWithContext(
    path: string | (() => string),
    options?: RequestInit,
  ): Promise<ContextRequest>;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _clearSessionAtGeneration(generation: number): boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSessionProvider(value: unknown): value is AuthSession['provider'] {
  return sessionProviders.has(value);
}

function hasSessionIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value['id'] === 'string' &&
    typeof value['user_id'] === 'string' &&
    isSessionProvider(value['provider']) &&
    typeof value['expires_at'] === 'string'
  );
}

function hasSessionState(value: Record<string, unknown>): boolean {
  return typeof value['is_active'] === 'boolean' && typeof value['is_current'] === 'boolean';
}

function hasOptionalSessionFields(value: Record<string, unknown>): boolean {
  for (const name of [
    'user_agent',
    'ip_address',
    'last_ip_address',
    'last_activity_at',
    'session_started_at',
    'created_at',
    'updated_at',
  ]) {
    if (Object.hasOwn(value, name) && typeof value[name] !== 'string') {
      return false;
    }
  }
  return true;
}

function isAuthSession(value: unknown): value is AuthSession {
  return (
    isRecord(value) &&
    hasSessionIdentity(value) &&
    hasSessionState(value) &&
    hasOptionalSessionFields(value)
  );
}

function sessionsField(value: unknown): AuthSession[] {
  const sessions = requiredField(value, 'sessions');
  if (!Array.isArray(sessions) || !sessions.every(isAuthSession)) {
    throw new TypeError('Auth sessions response must contain valid sessions');
  }
  return sessions;
}

function integerField(value: unknown, name: string, minimum: number): number {
  const field = requiredField(value, name);
  if (!Number.isInteger(field) || Number(field) < minimum) {
    throw new TypeError(`Auth sessions ${name} must be an integer of at least ${String(minimum)}`);
  }
  return Number(field);
}

function failedSessions(error: Error): SessionsResponse {
  return { sessions: null, total: 0, page: 1, limit: defaultLimit, total_pages: 0, error };
}

function sessionsPath(options: { page?: number; limit?: number }): string {
  const { page = 1, limit = defaultLimit } = options;
  const params = new URLSearchParams();
  if (page > 1) {
    params.set('page', page.toString());
  }
  if (limit !== defaultLimit) {
    params.set('limit', limit.toString());
  }
  return sessionsPathWithQuery(params.toString());
}

function sessionsPathWithQuery(queryString: string): string {
  return `/auth/user/sessions${queryString === '' ? '' : `?${queryString}`}`;
}

export async function getSessions(
  host: AuthUserSessionsHost,
  options: { page?: number; limit?: number },
): Promise<SessionsResponse> {
  const { result, context } = await host._authFetchWithContext(() => sessionsPath(options));
  if (!host._isAuthContextCurrent(context)) {
    return failedSessions(new AuthSessionChangedError());
  }
  if (result.ok !== true) {
    return failedSessions(result.error);
  }
  return {
    sessions: sessionsField(result.data),
    total: integerField(result.data, 'total', 0),
    page: integerField(result.data, 'page', 1),
    limit: integerField(result.data, 'limit', 1),
    total_pages: integerField(result.data, 'total_pages', 0),
    error: null,
  };
}

function isCurrentSession(context: AuthContext, sessionId: string): boolean {
  return sessionIdsEqual(extractSessionIdFromToken(context.accessToken), sessionId);
}

function shouldClearCurrent(
  context: AuthContext,
  sessionId: string,
  result: RequestResult,
): boolean {
  return isCurrentSession(context, sessionId) && (result.ok === true || result.status === null);
}

function deletedCurrentSession(
  host: AuthUserSessionsHost,
  context: AuthContext,
  result: RequestResult,
): { error: Error | null } {
  if (host._clearSessionAtGeneration(context.generation)) {
    return { error: result.error };
  }
  const changed = new AuthSessionChangedError();
  if (result.error !== null) {
    Object.defineProperty(changed, 'cause', {
      configurable: true,
      value: result.error,
      writable: true,
    });
  }
  return { error: changed };
}

export async function deleteSession(
  host: AuthUserSessionsHost,
  sessionId: string,
): Promise<{ error: Error | null }> {
  const { result, context } = await host._authFetchWithContext(
    `/auth/user/sessions/${encodeURIComponent(sessionId)}`,
    { method: 'DELETE' },
  );
  if (shouldClearCurrent(context, sessionId, result)) {
    return deletedCurrentSession(host, context, result);
  }
  if (result.ok !== true) {
    return { error: result.error };
  }
  return { error: host._isAuthContextCurrent(context) ? null : new AuthSessionChangedError() };
}

export async function deleteAllOtherSessions(
  host: AuthUserSessionsHost,
): Promise<{ error: Error | null }> {
  const { result, context } = await host._authFetchWithContext('/auth/user/sessions', {
    method: 'DELETE',
  });
  if (result.ok !== true) {
    return { error: result.error };
  }
  return { error: host._isAuthContextCurrent(context) ? null : new AuthSessionChangedError() };
}
