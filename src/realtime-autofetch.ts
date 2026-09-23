import type { PendingRow } from './realtime-internal-types.ts';
import type { LightweightNotification } from './realtime-public-types.ts';
import { property, record } from './realtime-values.ts';

function selectedDatabase(client: unknown, name: string | null): unknown {
  if (typeof property(client, 'from') !== 'function') {
    throw new TypeError('volcanoClient.from not available');
  }
  const database = property(client, 'database');
  if (name !== null) {
    if (typeof database !== 'function') {
      throw new TypeError('volcanoClient.database not available');
    }
    return Reflect.apply(database, client, [name]);
  }
  if (typeof database === 'function') {
    throw new TypeError(
      'Database name not set. Call volcanoClient.database(name) or pass databaseName to VolcanoRealtime.',
    );
  }
  return client;
}

function runRowQuery(client: unknown, table: string, ids: string[]): unknown {
  const from = property(client, 'from');
  if (typeof from !== 'function') {
    throw new TypeError('volcanoClient.from not available');
  }
  const query: unknown = Reflect.apply(from, client, [table]);
  const select = property(query, 'select');
  if (typeof select !== 'function') {
    throw new TypeError('Database query does not support select');
  }
  const selected: unknown = Reflect.apply(select, query, ['*']);
  const inFilter = property(selected, 'in');
  if (typeof inFilter !== 'function') {
    throw new TypeError('Database query does not support in');
  }
  return Reflect.apply(inFilter, selected, ['id', ids]);
}

function recordsById(data: unknown): Map<string, Record<string, unknown>> {
  const records = new Map<string, Record<string, unknown>>();
  if (!Array.isArray(data)) {
    return records;
  }
  const rows: readonly unknown[] = data;
  for (const row of rows) {
    if (record(row)) {
      records.set(String(row['id']), row);
    }
  }
  return records;
}

function deletePayload(data: LightweightNotification): Record<string, unknown> {
  return {
    type: data.type,
    schema: data.schema,
    table: data.table,
    old_record: data.old_record ?? (data.id === undefined ? undefined : { id: data.id }),
    id: data.id,
    timestamp: data.timestamp,
  };
}

function databaseFetchError(value: unknown): Error {
  const message = property(value, 'message');
  return new Error(
    typeof message === 'string' && message !== '' ? message : 'Database fetch failed',
  );
}

function restoreDatabaseSelection(client: unknown, name: string | null, previous: unknown): void {
  if (name === null || !record(client) || typeof property(client, 'database') !== 'function') {
    return;
  }
  Reflect.set(client, '_currentDatabaseName', previous);
}

function runBatchQuery(
  client: unknown,
  databaseName: string | null,
  schema: string,
  table: string,
  ids: string[],
): unknown {
  const tableName = schema !== '' && schema !== 'public' ? `${schema}.${table}` : table;
  const previousDatabase = property(client, '_currentDatabaseName');
  try {
    return runRowQuery(selectedDatabase(client, databaseName), tableName, ids);
  } finally {
    restoreDatabaseSelection(client, databaseName, previousDatabase);
  }
}

function recordsFromQuery(result: unknown): Map<string, Record<string, unknown>> {
  const error = property(result, 'error');
  if (Boolean(error)) {
    throw databaseFetchError(error);
  }
  return recordsById(property(result, 'data'));
}

function settleBatch(
  callbacks: Map<string, PendingRow>,
  records: Map<string, Record<string, unknown>>,
  table: string,
): void {
  for (const [id, callback] of callbacks) {
    const row = records.get(id);
    if (row === undefined) {
      callback.reject(new Error(`Record not found or access denied: ${table}:${id}`));
    } else {
      callback.resolve(row);
    }
  }
}

function rejectBatch(callbacks: Map<string, PendingRow>, reason: unknown): void {
  for (const callback of callbacks.values()) {
    callback.reject(reason);
  }
}

export { deletePayload, recordsFromQuery, rejectBatch, runBatchQuery, settleBatch };
