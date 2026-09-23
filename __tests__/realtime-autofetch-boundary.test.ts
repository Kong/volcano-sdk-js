import { describe, expect, test } from '@jest/globals';
import {
  deletePayload,
  recordsFromQuery,
  rejectBatch,
  runBatchQuery,
  settleBatch,
} from '../src/realtime-autofetch.ts';
import type { PendingRow } from '../src/realtime-internal-types.ts';

function fetchFrom(client: unknown, name: string | null = null, schema = 'public'): unknown {
  return runBatchQuery(client, name, schema, 'tasks', ['1', '2']);
}

describe('auto-fetch database boundary', () => {
  test('uses the configured database and schema-qualified table', () => {
    const requests: unknown[] = [];
    const query = {
      select(columns: string) {
        requests.push(columns);
        return {
          in(column: string, ids: string[]) {
            requests.push([column, ids]);
            return { data: [{ id: 1 }] };
          },
        };
      },
    };
    const db = {
      from(table: string) {
        requests.push(table);
        return query;
      },
    };
    const client = {
      from: (table: string) => db.from(table),
      database(name: string) {
        requests.push(name);
        return db;
      },
    };
    expect(fetchFrom(client, 'primary', 'tenant')).toEqual({ data: [{ id: 1 }] });
    expect(requests).toEqual(['primary', 'tenant.tasks', '*', ['id', ['1', '2']]]);
  });

  test('uses a selected database only when no explicit name is given', () => {
    const db = {
      from() {
        return { select: () => ({ in: () => ({ data: [] }) }) };
      },
    };
    expect(() => fetchFrom({ ...db, _currentDatabaseName: '', database: () => db })).toThrow(
      'Database name not set',
    );
  });

  test('leaves the client selection untouched when a legacy query lacks a selector', () => {
    const writes: string[] = [];
    const client = {
      get _currentDatabaseName() {
        return 'previous';
      },
      set _currentDatabaseName(name: string) {
        writes.push(name);
      },
      from: () => ({}),
      database: () => ({}),
    };
    expect(() => fetchFrom(client)).toThrow('Database name not set');
    expect(writes).toEqual([]);
  });

  test('does not change a client when its database selector API is unavailable', () => {
    const writes: string[] = [];
    const client = {
      get _currentDatabaseName() {
        return 'previous';
      },
      set _currentDatabaseName(name: string) {
        writes.push(name);
      },
      from: () => ({}),
    };
    expect(() => fetchFrom(client, 'db')).toThrow('volcanoClient.database not available');
    expect(writes).toEqual([]);
  });

  test('queries clients that directly expose from without a database selector', () => {
    const tables: string[] = [];
    const client = {
      from(table: string) {
        tables.push(table);
        return { select: () => ({ in: () => ({ data: [] }) }) };
      },
    };
    expect(fetchFrom(client)).toEqual({ data: [] });
    expect(tables).toEqual(['tasks']);
    expect(
      fetchFrom({ ...client, _currentDatabaseName: 'chosen', database: () => client }, 'chosen'),
    ).toEqual({ data: [] });
  });

  test('uses an unqualified table when the schema is empty', () => {
    const tables: string[] = [];
    const client = {
      from(table: string) {
        tables.push(table);
        return { select: () => ({ in: () => ({ data: [] }) }) };
      },
    };
    expect(fetchFrom(client, null, '')).toEqual({ data: [] });
    expect(tables).toEqual(['tasks']);
  });

  test('rejects a callable value that happens to expose query methods', () => {
    const client = Object.assign(() => {}, {
      from: () => ({ select: () => ({ in: () => ({ data: [] }) }) }),
    });
    expect(() => fetchFrom(client)).toThrow('volcanoClient.from not available');
  });

  test('rejects clients with incomplete query capabilities', () => {
    expect(() => fetchFrom(null)).toThrow('volcanoClient.from not available');
    expect(() => fetchFrom({ from: () => null }, 'db')).toThrow(
      'volcanoClient.database not available',
    );
    expect(() => fetchFrom({ from: () => null, database: () => ({}) }, 'db')).toThrow(
      'volcanoClient.from not available',
    );
    expect(() => fetchFrom({ from: () => ({}) })).toThrow('Database query does not support select');
    expect(() => fetchFrom({ from: () => ({ select: () => ({}) }) })).toThrow(
      'Database query does not support in',
    );
  });

  test('validates query rows and returns clear database errors', () => {
    expect([...recordsFromQuery({ data: [null, [], { id: 1 }, { id: '2' }] })]).toEqual([
      ['1', { id: 1 }],
      ['2', { id: '2' }],
    ]);
    expect(recordsFromQuery({ data: null }).size).toBe(0);
    expect(() => recordsFromQuery({ error: { message: 'denied' } })).toThrow('denied');
    expect(() => recordsFromQuery({ error: { message: '' } })).toThrow('Database fetch failed');
    expect(() => recordsFromQuery({ error: { message: 42 } })).toThrow('Database fetch failed');
  });

  test('retains old row data for deletes and resolves each batch ID independently', () => {
    const deletion = {
      mode: 'lightweight' as const,
      type: 'DELETE' as const,
      schema: 'public',
      table: 'tasks',
      id: '1',
      timestamp: 'now',
    };
    expect(deletePayload(deletion)['old_record']).toEqual({ id: '1' });
    expect(deletePayload({ ...deletion, old_record: { id: 'old' } })['old_record']).toEqual({
      id: 'old',
    });
    expect(deletePayload({ ...deletion, id: undefined })['old_record']).toBeUndefined();

    const resolved: unknown[] = [];
    const rejected: unknown[] = [];
    const pending = new Map<string, PendingRow>([
      [
        '1',
        {
          resolve(value) {
            resolved.push(value);
          },
          reject(error) {
            rejected.push(error);
          },
        },
      ],
      [
        '2',
        {
          resolve(value) {
            resolved.push(value);
          },
          reject(error) {
            rejected.push(error);
          },
        },
      ],
    ]);
    settleBatch(pending, new Map([['1', { id: '1' }]]), 'tasks');
    expect(resolved).toEqual([{ id: '1' }]);
    expect(rejected).toEqual([new Error('Record not found or access denied: tasks:2')]);
    rejectBatch(pending, new Error('offline'));
    expect(rejected).toEqual([
      new Error('Record not found or access denied: tasks:2'),
      new Error('offline'),
      new Error('offline'),
    ]);
  });
});
