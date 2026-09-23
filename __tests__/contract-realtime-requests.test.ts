/** @jest-environment ./__tests__/node-environment.cjs */
import { VolcanoClient } from '../src/index.js';
import type { PostgresChange } from '../src/realtime.ts';
import { verifyPostgresChanges } from './contract/postgres-changes.ts';
import { verifyPresenceMembership } from './contract/presence-membership.ts';

interface ContractRow {
  [key: string]: unknown;
  id: string;
  value: string;
  owner_id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isRow(value: unknown): value is ContractRow {
  return (
    isRecord(value) &&
    typeof value['id'] === 'string' &&
    typeof value['value'] === 'string' &&
    typeof value['owner_id'] === 'string'
  );
}

type ObserverChannel = ReturnType<typeof observerChannel>;

interface MutationState {
  channels: ObserverChannel[];
  requests: { url: string; body: Record<string, unknown> }[];
  row: ContractRow | null;
}

function insertedRow(values: unknown): ContractRow {
  if (!isRow(values)) {
    throw new Error('Expected inserted row');
  }
  return values;
}

function updatedRow(current: ContractRow | null, values: unknown): ContractRow {
  if (current === null || !isRecord(values) || typeof values['value'] !== 'string') {
    throw new Error('Expected updated row');
  }
  return { ...current, value: values['value'] };
}

function mutationRow(url: string, values: unknown, current: ContractRow | null): ContractRow {
  if (url.endsWith('/insert')) {
    return insertedRow(values);
  }
  if (url.endsWith('/update')) {
    return updatedRow(current, values);
  }
  if (current === null) {
    throw new Error('Expected a row before mutation');
  }
  return current;
}

function publishMutation(state: MutationState, url: string, row: ContractRow): void {
  if (url.endsWith('/delete')) {
    return;
  }
  const type = url.endsWith('/insert') ? 'INSERT' : 'UPDATE';
  for (const channel of state.channels) {
    channel.emit(type, row);
  }
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
}

function requestBody(options?: RequestInit): Record<string, unknown> {
  if (typeof options?.body !== 'string') {
    throw new TypeError('Expected JSON request body');
  }
  const body: unknown = JSON.parse(options.body);
  if (!isRecord(body)) {
    throw new Error('Expected JSON object');
  }
  return body;
}

function handleMutationRequest(
  state: MutationState,
  input: RequestInfo | URL,
  options?: RequestInit,
): Response {
  const url = requestUrl(input);
  const body = requestBody(options);
  state.requests.push({ url, body });
  const row = mutationRow(url, body['values'], state.row);
  state.row = row;
  publishMutation(state, url, row);
  return Response.json(
    { data: [row] },
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function postgresEvent(
  type: 'INSERT' | 'UPDATE',
  row: ContractRow,
  automatic: boolean,
): PostgresChange {
  const base: PostgresChange = {
    type,
    schema: 'public',
    table: 'records',
    timestamp: new Date().toISOString(),
  };
  return automatic ? { ...base, record: row } : { ...base, id: row.id, mode: 'lightweight' };
}

function observerChannel(automatic: boolean) {
  const callbacks: {
    type: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
    table: string;
    callback: (event: PostgresChange) => void;
  }[] = [];
  return {
    subscribe() {
      return Promise.resolve();
    },
    unsubscribe() {
      return Promise.resolve();
    },
    onPostgresChanges(
      type: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
      _schema: string,
      table: string,
      callback: (event: PostgresChange) => void,
    ) {
      callbacks.push({ type, table, callback });
      return jest.fn();
    },
    emit(type: 'INSERT' | 'UPDATE', row: ContractRow) {
      const event = postgresEvent(type, row, automatic);
      for (const listener of callbacks) {
        if (listener.table === 'records' && (listener.type === '*' || listener.type === type)) {
          listener.callback(event);
        }
      }
    },
  };
}

test('the Postgres contract uses native mutation builders and removes its row', async () => {
  const channels = [observerChannel(true), observerChannel(false)];
  const client = new VolcanoClient({
    apiUrl: 'https://api.test',
    anonKey: 'anon',
    accessToken: 'user-token',
  });
  const state: MutationState = { channels, requests: [], row: null };
  jest
    .mocked(globalThis.fetch)
    .mockImplementation((input, options) =>
      Promise.resolve(handleMutationRequest(state, input, options)),
    );
  const cleanupCallbacks: (() => Promise<unknown>)[] = [];
  const world = {
    fixture: { realtime_table_name: 'records', database_name: 'db', user_id: 'user' },
    client,
    cleanupCallbacks,
    realtimeClients: channels.map((channel) => ({
      setVolcanoClient(attached: VolcanoClient) {
        expect(attached).toBe(client);
      },
      setDatabaseName(name: string) {
        expect(name).toBe('db');
      },
      channel: () => channel,
    })),
  };
  expect(await verifyPostgresChanges(world)).toEqual(['INSERT', 'UPDATE']);
  const [cleanup] = world.cleanupCallbacks;
  if (cleanup === undefined) {
    throw new Error('Expected database cleanup');
  }
  await cleanup();
  expect(state.requests.map(({ url }) => url)).toEqual(
    ['insert', 'update', 'delete'].map(
      (operation) => `https://api.test/databases/db/query/${operation}`,
    ),
  );
  expect(state.requests.map(({ body }) => body['table'])).toEqual([
    'records',
    'records',
    'records',
  ]);
  const deleted = state.requests[2];
  const inserted = state.requests[0]?.body['values'];
  if (deleted === undefined || !isRow(inserted)) {
    throw new Error('Expected delete request');
  }
  expect(deleted.body['filters']).toEqual([{ column: 'id', operator: 'eq', value: inserted.id }]);
});

test('presence retains a channel name at the platform length boundary', async () => {
  const stop = new Error('valid channel');
  const world = {
    realtimeChannel: 'x'.repeat(64),
    fixture: { user_id: 'user' },
    realtimeClients: Array.from({ length: 2 }, () => ({
      channel(name: string, options: { type: 'presence' }) {
        expect(name.length).toBeLessThanOrEqual(64);
        expect(options).toEqual({ type: 'presence' });
        return {
          onPresenceSync: () => jest.fn(),
          getPresenceState: () => ({}),
          subscribe() {
            return Promise.reject(stop);
          },
          unsubscribe() {
            return Promise.resolve();
          },
        };
      },
    })),
  };
  await expect(verifyPresenceMembership(world)).rejects.toBe(stop);
});
