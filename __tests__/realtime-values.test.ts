import { describe, expect, test } from '@jest/globals';
import {
  connectContext,
  disconnectContext,
  errorContext,
  hasChangeLocation,
  isChangeType,
  isLightweightNotification,
  isPostgresChange,
  isPresenceInfo,
  isPresenceState,
  isPublicationContext,
  matchesPostgresChange,
  optionalDatabaseName,
  optionalRecord,
  optionalString,
  payloadEvent,
  property,
  record,
  requiredAnonKey,
  requiredApiUrl,
  validPresenceExtras,
  validTags,
} from '../src/realtime-values.ts';

const location = { schema: 'public', table: 'tasks', timestamp: '2025-01-01T00:00:00Z' };
const absent = undefined;

describe('untrusted realtime payloads', () => {
  test('reads fields only from objects', () => {
    expect(property(null, 'data')).toBeUndefined();
    expect(property('text', 'data')).toBeUndefined();
    expect(property({ data: 7 }, 'data')).toBe(7);
    expect(record(null)).toBe(false);
    expect(record([])).toBe(false);
    expect(record({})).toBe(true);
  });

  test.each(['INSERT', 'UPDATE', 'DELETE'] as const)('accepts %s changes', (type) => {
    expect(isChangeType(type)).toBe(true);
    expect(isLightweightNotification({ ...location, mode: 'lightweight', type })).toBe(true);
    expect(isPostgresChange({ ...location, type })).toBe(true);
  });

  test('rejects malformed change locations and types', () => {
    expect(isChangeType('UPSERT')).toBe(false);
    expect(hasChangeLocation(location)).toBe(true);
    expect(hasChangeLocation({ ...location, schema: 1 })).toBe(false);
    expect(hasChangeLocation({ ...location, table: 1 })).toBe(false);
    expect(hasChangeLocation({ ...location, timestamp: 1 })).toBe(false);
    expect(isLightweightNotification({ ...location, type: 'INSERT' })).toBe(false);
    expect(isLightweightNotification({ ...location, mode: 'lightweight', type: 'UPSERT' })).toBe(
      false,
    );
    expect(
      isLightweightNotification({
        ...location,
        mode: 'lightweight',
        type: 'INSERT',
        old_record: [],
      }),
    ).toBe(false);
    expect(
      isLightweightNotification({
        ...location,
        mode: 'lightweight',
        type: 'INSERT',
        old_record: {},
      }),
    ).toBe(true);
    expect(isPostgresChange(null)).toBe(false);
    expect(isPostgresChange({ ...location, type: 'UPSERT' })).toBe(false);
    expect(isPostgresChange({ ...location, type: 'INSERT', schema: 1 })).toBe(false);
  });

  test('validates publication offsets and tags', () => {
    expect(validTags(absent)).toBe(true);
    expect(validTags(null)).toBe(false);
    expect(validTags({ a: 'b' })).toBe(true);
    expect(validTags({ a: 1 })).toBe(false);
    expect(isPublicationContext(null)).toBe(false);
    expect(isPublicationContext({ offset: 1 })).toBe(false);
    expect(isPublicationContext({ data: 'hello', offset: 'one' })).toBe(false);
    expect(isPublicationContext({ data: 'hello', tags: { project: 2 } })).toBe(false);
    expect(isPublicationContext({ data: 'hello', offset: 0, tags: { project: 'p' } })).toBe(true);
  });

  test('normalizes connection event contexts without forwarding malformed fields', () => {
    expect(connectContext(null)).toEqual({});
    expect(connectContext({ client: 'c', latency: 1 })).toEqual({ client: 'c', latency: 1 });
    expect(connectContext({ client: 1, latency: 'slow' })).toEqual({});
    expect(disconnectContext(null)).toEqual({});
    expect(disconnectContext({ code: 4, reason: 'closed', reconnect: false })).toEqual({
      code: 4,
      reason: 'closed',
      reconnect: false,
    });
    expect(disconnectContext({ code: '4', reason: 3, reconnect: 'false' })).toEqual({});
    const failure = new Error('lost');
    expect(errorContext({ error: failure, message: 'lost', code: 4 })).toEqual({
      error: failure,
      message: 'lost',
      code: 4,
    });
    expect(errorContext({ error: 'lost', message: 3, code: '4' })).toEqual({});
    const transportFailure = { code: 7, message: 'connection refused' };
    expect(errorContext({ type: 'connect', error: transportFailure })).toEqual({
      error: transportFailure,
      message: 'connection refused',
      code: 7,
    });
    expect(
      errorContext({ error: { code: 7, message: 'nested' }, message: 'outer', code: 8 }),
    ).toEqual({
      error: { code: 7, message: 'nested' },
      message: 'outer',
      code: 8,
    });
    expect(errorContext({ error: { code: 'bad', message: 'nested' } })).toEqual({
      message: 'nested',
    });
    expect(errorContext({ error: { code: 3, message: false } })).toEqual({ code: 3 });
  });

  test('validates presence state and optional fields', () => {
    expect(optionalRecord(absent)).toBe(true);
    expect(optionalRecord({})).toBe(true);
    expect(optionalRecord([])).toBe(false);
    expect(optionalString(absent)).toBe(true);
    expect(optionalString('name')).toBe(true);
    expect(optionalString(3)).toBe(false);
    expect(validPresenceExtras({})).toBe(true);
    for (const invalid of [{ user: 3 }, { connInfo: [] }, { chanInfo: 1 }, { data: null }]) {
      expect(validPresenceExtras(invalid)).toBe(false);
    }
    expect(isPresenceInfo(null)).toBe(false);
    expect(isPresenceInfo({ client: 3 })).toBe(false);
    expect(isPresenceInfo({ client: 'c', user: 'u', data: {} })).toBe(true);
    expect(isPresenceState(null)).toBe(false);
    expect(isPresenceState({ alice: { client: 'a' } })).toBe(true);
    expect(isPresenceState({ alice: { client: 3 } })).toBe(false);
  });

  test('rejects invalid configuration and chooses payload event precedence', () => {
    expect(() => requiredApiUrl(absent)).toThrow('apiUrl is required');
    expect(() => requiredApiUrl('')).toThrow('apiUrl is required');
    expect(requiredApiUrl('https://api.example.com/')).toBe('https://api.example.com');
    expect(() => requiredAnonKey(null)).toThrow('anonKey is required');
    expect(requiredAnonKey('')).toBe('');
    expect(optionalDatabaseName(absent)).toBeNull();
    expect(optionalDatabaseName('')).toBeNull();
    expect(optionalDatabaseName('db')).toBe('db');
    expect(payloadEvent({ event: 'custom', type: 'INSERT' })).toBe('custom');
    expect(payloadEvent({ event: '', type: 'INSERT' })).toBe('INSERT');
    expect(payloadEvent({ type: '' })).toBe('message');
    expect(payloadEvent(null)).toBe('message');
  });

  test('matches only requested table and event', () => {
    const change = { ...location, type: 'UPDATE' };
    expect(matchesPostgresChange(null, '*', 'public', 'tasks')).toBe(false);
    expect(matchesPostgresChange(change, '*', 'other', 'tasks')).toBe(false);
    expect(matchesPostgresChange(change, '*', 'public', 'other')).toBe(false);
    expect(matchesPostgresChange(change, 'INSERT', 'public', 'tasks')).toBe(false);
    expect(matchesPostgresChange(change, 'UPDATE', 'public', 'tasks')).toBe(true);
    expect(matchesPostgresChange(change, '*', 'public', 'tasks')).toBe(true);
  });
});
