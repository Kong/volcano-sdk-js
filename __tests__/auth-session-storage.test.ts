/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, it, jest } from '@jest/globals';
import {
  isSameSession,
  readStoredSession,
  removeStoredSession,
  sameServerSession,
  type SessionStorageHost,
  type StoredSession,
  writeStoredSession,
} from '../src/auth-session-storage.ts';
import { testAccessToken } from './auth-token-fixtures.ts';

const SESSION = '11111111-1111-4111-8111-111111111111';
const OTHER_SESSION = '22222222-2222-4222-8222-222222222222';

function sessionToken(sessionId: string, marker: string): string {
  return testAccessToken(undefined, { session_id: sessionId, jti: marker });
}

function storage(items: Record<string, string> = {}): {
  host: SessionStorageHost;
  items: Map<string, string>;
} {
  const map = new Map(Object.entries(items));
  return {
    items: map,
    host: {
      _getStorageItem: (key) => map.get(key) ?? null,
      _setStorageItem(key, value) {
        map.set(key, value);
      },
      _removeStorageItem(key) {
        map.delete(key);
      },
    },
  };
}

function withRecord(value: unknown): ReturnType<typeof storage> {
  return storage({ volcano_access_token: JSON.stringify(value) });
}

describe('readStoredSession', () => {
  it('returns null without a stored session', () => {
    expect(readStoredSession(storage().host)).toBeNull();
  });

  it('reads a complete record without touching other keys', () => {
    const record = { access_token: 'access', refresh_token: 'refresh' };
    const { host } = withRecord(record);
    const remove = jest.spyOn(host, '_removeStorageItem');
    const write = jest.spyOn(host, '_setStorageItem');

    expect(readStoredSession(host)).toEqual(record);
    expect(remove).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });

  it('keeps only the session fields', () => {
    const { host } = withRecord({
      access_token: 'access',
      refresh_token: null,
      user: { id: 'user-1' },
    });
    expect(readStoredSession(host)).toEqual({ access_token: 'access', refresh_token: null });
  });

  it.each([
    ['unparseable JSON', '{'],
    ['a missing access token', JSON.stringify({ refresh_token: null })],
    ['an empty access token', JSON.stringify({ access_token: '', refresh_token: null })],
    ['a numeric access token', JSON.stringify({ access_token: 7, refresh_token: null })],
    ['a missing refresh token', JSON.stringify({ access_token: 'access' })],
    ['an empty refresh token', JSON.stringify({ access_token: 'a', refresh_token: '' })],
  ])('ignores a record with %s', (_label, value) => {
    const { host, items } = storage({ volcano_access_token: value });

    expect(readStoredSession(host)).toBeNull();
    expect(items.get('volcano_access_token')).toBe(value);
  });

  it('imports a bare access token and its refresh token', () => {
    const { host, items } = storage({
      volcano_access_token: 'legacy-access',
      volcano_refresh_token: 'legacy-refresh',
    });

    const expected = { access_token: 'legacy-access', refresh_token: 'legacy-refresh' };
    expect(readStoredSession(host)).toEqual(expected);
    expect(Object.fromEntries(items)).toEqual({ volcano_access_token: JSON.stringify(expected) });
  });

  it.each([
    ['absent', null],
    ['empty', ''],
  ])('imports a bare access token whose refresh token is %s', (_label, refreshToken) => {
    const { host, items } = storage({ volcano_access_token: 'legacy-access' });
    if (refreshToken !== null) {
      items.set('volcano_refresh_token', refreshToken);
    }

    const expected = { access_token: 'legacy-access', refresh_token: null };
    expect(readStoredSession(host)).toEqual(expected);
    expect(Object.fromEntries(items)).toEqual({ volcano_access_token: JSON.stringify(expected) });
  });

  it('pairs a refresh token written after the stored access token', () => {
    // An older writer stores the access token first, so a reader can import it alone.
    const { host, items } = storage({ volcano_access_token: 'legacy-access' });
    readStoredSession(host);
    items.set('volcano_refresh_token', 'legacy-refresh');

    const expected = { access_token: 'legacy-access', refresh_token: 'legacy-refresh' };
    expect(readStoredSession(host)).toEqual(expected);
    expect(Object.fromEntries(items)).toEqual({ volcano_access_token: JSON.stringify(expected) });
  });

  it('keeps the stored refresh token when an older writer leaves its key empty', () => {
    const record = { access_token: 'access', refresh_token: 'refresh' };
    const { host, items } = withRecord(record);
    items.set('volcano_refresh_token', '');

    expect(readStoredSession(host)).toEqual(record);
    expect(Object.fromEntries(items)).toEqual({ volcano_access_token: JSON.stringify(record) });
  });

  it.each([
    ['absent', null],
    ['empty', ''],
  ])('drops a refresh token whose access token is %s', (_label, accessToken) => {
    const { host, items } = storage({ volcano_refresh_token: 'orphan-refresh' });
    if (accessToken !== null) {
      items.set('volcano_access_token', accessToken);
    }

    expect(readStoredSession(host)).toBeNull();
    expect(items.has('volcano_refresh_token')).toBe(false);
    expect(items.get('volcano_access_token')).toBe(accessToken ?? undefined);
  });

  it('does not store an empty access token', () => {
    const { host, items } = storage({ volcano_access_token: '' });

    expect(readStoredSession(host)).toBeNull();
    expect(Object.fromEntries(items)).toEqual({ volcano_access_token: '' });
  });
});

describe('writeStoredSession and removeStoredSession', () => {
  it('writes one record and stores an empty refresh token as null', () => {
    const { host, items } = storage();

    writeStoredSession(host, { access_token: 'access', refresh_token: '' });
    expect(readStoredSession(host)).toEqual({ access_token: 'access', refresh_token: null });

    removeStoredSession(host);
    expect(items.size).toBe(0);
  });

  it('does not store fields outside the session', () => {
    const { host, items } = storage();
    const session = { access_token: 'access', refresh_token: 'refresh', expires_in: 60 };

    writeStoredSession(host, session);
    expect(items.get('volcano_access_token')).toBe(
      JSON.stringify({ access_token: 'access', refresh_token: 'refresh' }),
    );
  });
});

describe('session identity', () => {
  const access = sessionToken(SESSION, 'first');
  const stored: StoredSession = { access_token: access, refresh_token: 'refresh' };

  it('compares server session claims', () => {
    expect(sameServerSession(access, sessionToken(SESSION.toUpperCase(), 'second'))).toBe(true);
    expect(sameServerSession(access, sessionToken(OTHER_SESSION, 'second'))).toBe(false);
    expect(sameServerSession('opaque', 'opaque')).toBe(false);
    expect(sameServerSession(access, null)).toBe(false);
  });

  it('matches identical credentials or a rotation of the same server session', () => {
    expect(isSameSession(stored, access, 'other-refresh')).toBe(true);
    expect(isSameSession(stored, 'other-access', 'refresh')).toBe(true);
    expect(isSameSession(stored, sessionToken(SESSION, 'rotated'), 'rotated')).toBe(true);
    expect(isSameSession(stored, sessionToken(OTHER_SESSION, 'other'), 'other')).toBe(false);
    expect(isSameSession(stored, null, null)).toBe(false);
  });

  it('does not treat two sessions without refresh tokens as the same', () => {
    const tokenOnly: StoredSession = { access_token: 'stored', refresh_token: null };
    expect(isSameSession(tokenOnly, 'current', null)).toBe(false);
    expect(isSameSession(tokenOnly, 'stored', null)).toBe(true);
  });
});
