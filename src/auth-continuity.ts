import { assertCompleteSession } from './auth-validation.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

export interface RefreshContext {
  accessToken: string | null;
  refreshToken: string | null;
  operations: {
    hasVerifiedPair(accessToken: string | null, refreshToken: string | null): boolean;
  };
}

export function validateRefreshSource(context: RefreshContext): void {
  if (
    !context.operations.hasVerifiedPair(context.accessToken, context.refreshToken) &&
    extractSessionIdFromToken(context.accessToken) === null
  ) {
    throw new Error('Cannot refresh supplied credentials without a session identifier');
  }
}

export function validateSessionContinuation(
  data: unknown,
  context: Pick<RefreshContext, 'accessToken'>,
  userId: unknown,
): void {
  assertCompleteSession(data);
  const expected = extractSessionIdFromToken(context.accessToken);
  if (
    expected !== null &&
    !sessionIdsEqual(expected, extractSessionIdFromToken(data.access_token))
  ) {
    throw new Error('Refreshed credentials belong to a different server session');
  }
  if (Boolean(userId) && data.user.id !== userId) {
    throw new Error('Refreshed session belongs to a different user');
  }
}

export function sessionIdsEqual(left: unknown, right: unknown): boolean {
  return (
    typeof left === 'string' &&
    typeof right === 'string' &&
    left.toLowerCase() === right.toLowerCase()
  );
}
