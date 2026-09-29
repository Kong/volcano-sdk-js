import { sessionIdsEqual } from './auth-continuity.ts';
import { extractSessionIdFromToken } from './token-claims.ts';

// One record, so a reader never pairs tokens from different writes. It keeps the key
// earlier releases stored the access token under, because applications still write
// and remove that key directly, and removing it must still end the stored session.
const SESSION_KEY = 'volcano_access_token';
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

interface StoredValue {
  readonly session: StoredSession;
  // Imported from the earlier format, whose writer stores its refresh token after the access token.
  readonly imported: boolean;
}

function parseStoredRecord(value: string | null): StoredValue | null {
  const data = parseJson(value);
  // Only a missing or unreadable record parses to something other than an object.
  if (!(data instanceof Object)) {
    return null;
  }
  const accessToken: unknown = Reflect.get(data, 'access_token');
  const refreshToken: unknown = Reflect.get(data, 'refresh_token');
  if (!nonempty(accessToken) || !isStoredRefreshToken(refreshToken)) {
    return null;
  }
  return {
    session: { access_token: accessToken, refresh_token: refreshToken },
    imported: Reflect.get(data, 'imported') === true,
  };
}

// Earlier releases and applications store a bare access token, never a JSON object.
function isRecordValue(value: string | null): boolean {
  return value === null || value.startsWith('{');
}

function parseStoredValue(value: string | null): StoredValue | null {
  if (isRecordValue(value)) {
    return parseStoredRecord(value);
  }
  return nonempty(value)
    ? { session: { access_token: value, refresh_token: null }, imported: true }
    : null;
}

function sessionOf(stored: StoredValue | null): StoredSession | null {
  return stored === null ? null : stored.session;
}

function recordText(session: StoredSession, imported: boolean): string {
  const record = {
    access_token: session.access_token,
    refresh_token: nonempty(session.refresh_token) ? session.refresh_token : null,
  };
  return JSON.stringify(imported ? { ...record, imported } : record);
}

function storeImportedSession(host: SessionStorageHost, session: StoredSession): boolean {
  const text = recordText(session, true);
  host._setStorageItem(SESSION_KEY, text);
  return host._getStorageItem(SESSION_KEY) === text;
}

function importLegacySession(
  host: SessionStorageHost,
  stored: StoredValue | null,
  refreshToken: string | null,
): StoredSession | null {
  // A refresh token without its access token, or stored after a newer session, belongs to neither.
  if (stored?.imported !== true) {
    host._removeStorageItem(LEGACY_REFRESH_TOKEN_KEY);
    return sessionOf(stored);
  }
  const { session } = stored;
  const legacySession = nonempty(refreshToken)
    ? { access_token: session.access_token, refresh_token: refreshToken }
    : session;
  // Keep the refresh token until the record holding it is stored, so a failed write loses nothing.
  if (storeImportedSession(host, legacySession)) {
    host._removeStorageItem(LEGACY_REFRESH_TOKEN_KEY);
  }
  return legacySession;
}

/**
 * Reads the session shared by tabs and clients on this origin. Only older writers
 * set the separate refresh token key, and they write it after the access token, so
 * it completes a session imported from them.
 */
export function readStoredSession(host: SessionStorageHost): StoredSession | null {
  const value = host._getStorageItem(SESSION_KEY);
  const refreshToken = host._getStorageItem(LEGACY_REFRESH_TOKEN_KEY);
  const stored = parseStoredValue(value);
  if (refreshToken === null && isRecordValue(value)) {
    return sessionOf(stored);
  }
  return importLegacySession(host, stored, refreshToken);
}

export function writeStoredSession(
  host: Pick<SessionStorageHost, '_setStorageItem'>,
  session: StoredSession,
): void {
  host._setStorageItem(SESSION_KEY, recordText(session, false));
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
