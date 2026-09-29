import { sessionIdsEqual } from './auth-continuity.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

// One key, so a reader never pairs tokens from different writes.
const SESSION_KEY = 'volcano_auth_session';
// Earlier releases stored these separately; applications may still write them directly.
const LEGACY_ACCESS_TOKEN_KEY = 'volcano_access_token';
const LEGACY_REFRESH_TOKEN_KEY = 'volcano_refresh_token';

export interface StoredSession {
  readonly access_token: string;
  readonly refresh_token: string | null;
}

export interface SessionStorageHost {
  _getStorageItem(key: string): string | null;
  _setStorageItem(key: string, value: string): void;
  _removeStorageItem(key: string): void;
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

function isStoredRefreshToken(value: unknown): value is string | null {
  return value === null || nonempty(value);
}

function parseJson(value: string | null): unknown {
  let data: unknown = null;
  try {
    // A missing item parses as null.
    data = JSON.parse(String(value));
  } catch {
    // An unreadable record is not a session.
  }
  return data;
}

function parseStoredSession(value: string | null): StoredSession | null {
  const data = parseJson(value);
  if (!isRecord(data)) {
    return null;
  }
  const accessToken: unknown = Reflect.get(data, 'access_token');
  const refreshToken: unknown = Reflect.get(data, 'refresh_token');
  if (!nonempty(accessToken) || !isStoredRefreshToken(refreshToken)) {
    return null;
  }
  return { access_token: accessToken, refresh_token: refreshToken };
}

function importLegacySession(host: SessionStorageHost): void {
  const accessToken = host._getStorageItem(LEGACY_ACCESS_TOKEN_KEY);
  const refreshToken = host._getStorageItem(LEGACY_REFRESH_TOKEN_KEY);
  if (accessToken === null && refreshToken === null) {
    return;
  }
  // A refresh token without its access token is not a usable session.
  if (nonempty(accessToken)) {
    writeStoredSession(host, { access_token: accessToken, refresh_token: refreshToken });
  }
  host._removeStorageItem(LEGACY_ACCESS_TOKEN_KEY);
  host._removeStorageItem(LEGACY_REFRESH_TOKEN_KEY);
}

/**
 * Reads the session shared by tabs and clients on this origin. Only older
 * writers set the legacy keys, so when present they hold the newest session.
 */
export function readStoredSession(host: SessionStorageHost): StoredSession | null {
  importLegacySession(host);
  return parseStoredSession(host._getStorageItem(SESSION_KEY));
}

export function writeStoredSession(
  host: Pick<SessionStorageHost, '_setStorageItem'>,
  session: StoredSession,
): void {
  host._setStorageItem(
    SESSION_KEY,
    JSON.stringify({
      access_token: session.access_token,
      refresh_token: nonempty(session.refresh_token) ? session.refresh_token : null,
    }),
  );
}

export function removeStoredSession(host: Pick<SessionStorageHost, '_removeStorageItem'>): void {
  host._removeStorageItem(SESSION_KEY);
}

export function sameServerSession(left: string | null, right: string | null): boolean {
  return sessionIdsEqual(extractSessionIdFromToken(left), extractSessionIdFromToken(right));
}

/** True when `stored` holds these credentials or a later rotation of their server session. */
export function isSameSession(
  stored: StoredSession,
  accessToken: string | null,
  refreshToken: string | null,
): boolean {
  return (
    stored.access_token === accessToken ||
    (stored.refresh_token !== null && stored.refresh_token === refreshToken) ||
    sameServerSession(stored.access_token, accessToken)
  );
}
