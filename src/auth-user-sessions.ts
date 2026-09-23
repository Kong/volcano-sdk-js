import { sessionIdsEqual } from './auth-continuity.ts';
import type { ContextRequest, RequestResult } from './auth-request.ts';
import { requiredField } from './auth-response.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import { AuthSessionChangedError } from './errors.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

const defaultLimit = 20;

export interface AuthUserSessionsHost {
  _authFetchWithContext(
    path: string | (() => string),
    options?: RequestInit,
  ): Promise<ContextRequest>;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _clearSessionAtGeneration(generation: number): boolean;
}

interface SessionsResult {
  sessions: unknown;
  total: unknown;
  page: unknown;
  limit: unknown;
  total_pages: unknown;
  error: Error | null;
}

function failedSessions(error: Error): SessionsResult {
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
): Promise<SessionsResult> {
  const { result, context } = await host._authFetchWithContext(() => sessionsPath(options));
  if (!host._isAuthContextCurrent(context)) {
    return failedSessions(new AuthSessionChangedError());
  }
  if (result.ok !== true) {
    return failedSessions(result.error);
  }
  return {
    sessions: requiredField(result.data, 'sessions'),
    total: requiredField(result.data, 'total'),
    page: requiredField(result.data, 'page'),
    limit: requiredField(result.data, 'limit'),
    total_pages: requiredField(result.data, 'total_pages'),
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
