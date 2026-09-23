import { randomUUID } from 'node:crypto';
import type { VolcanoClient } from '../../src/index.js';
import type { PostgresChange } from '../../src/realtime.ts';

interface ObserverChannel {
  onPostgresChanges(
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    schema: string,
    table: string,
    callback: (event: PostgresChange) => void,
  ): () => void;
}

interface PostgresChannel extends ObserverChannel {
  subscribe(): Promise<void>;
  unsubscribe(): Promise<void>;
}

interface ObserverClient {
  on(event: string, callback: (...args: unknown[]) => void): unknown;
  off(event: string, callback: (...args: unknown[]) => void): unknown;
}

interface PostgresWorld {
  fixture: { realtime_table_name: string; database_name: string; user_id: string };
  client: VolcanoClient;
  cleanupCallbacks: (() => Promise<unknown>)[];
  realtimeClients: {
    setVolcanoClient(client: VolcanoClient): void;
    setDatabaseName(name: string): void;
    channel(name: string, options: { type: 'postgres'; autoFetch: boolean }): PostgresChannel;
    getClient?(): ObserverClient | null;
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function eventId(event: unknown): unknown {
  if (!isRecord(event)) {
    return undefined;
  }
  const record = event['record'];
  return (isRecord(record) ? record['id'] : undefined) ?? event['id'];
}

function postgresPublication(value: unknown): value is { channel: string; data?: unknown } {
  return (
    isRecord(value) &&
    typeof value['channel'] === 'string' &&
    value['channel'].includes(':postgres:')
  );
}

function createObservers(
  channels: readonly PostgresChannel[],
  clients: PostgresWorld['realtimeClients'],
  table: string,
  rowId: string,
): ChangeObserver[] {
  return channels.map((channel, index) => {
    const client = clients[index];
    if (client === undefined) {
      throw new Error('Postgres client was missing');
    }
    return new ChangeObserver(channel, table, rowId, {
      client: client.getClient?.(),
      automatic: index === 0,
    });
  });
}

class ChangeObserver {
  readonly events: PostgresChange[] = [];
  changed: (() => void) | null = null;
  inserts = 0;
  wrongTable = 0;
  readonly automatic: boolean;
  readonly diagnostics = {
    publications: 0,
    matchingPublications: 0,
    callbacks: 0,
    errors: 0,
    disconnects: 0,
  };
  readonly stops: (() => void)[];

  constructor(
    channel: ObserverChannel,
    table: string,
    rowId: string,
    {
      client,
      automatic = false,
    }: { client?: ObserverClient | null | undefined; automatic?: boolean } = {},
  ) {
    this.automatic = automatic;
    const owns = (event: unknown): boolean => eventId(event) === rowId;
    this.stops = [
      channel.onPostgresChanges('*', 'public', table, (event) => {
        this.diagnostics.callbacks++;
        if (!owns(event)) {
          return;
        }
        this.events.push(event);
        this.changed?.();
      }),
      channel.onPostgresChanges('INSERT', 'public', table, (event) => {
        if (owns(event)) {
          this.inserts++;
        }
      }),
      channel.onPostgresChanges('*', 'public', `${table}_other`, (event) => {
        if (owns(event)) {
          this.wrongTable++;
        }
      }),
    ];
    this.observeTransport(client, owns);
  }

  observeTransport(
    client: ObserverClient | null | undefined,
    owns: (event: unknown) => boolean,
  ): void {
    if (client === null || client === undefined) {
      return;
    }
    const publication = (context: unknown): void => {
      if (!postgresPublication(context)) {
        return;
      }
      this.diagnostics.publications++;
      if (owns(context.data)) {
        this.diagnostics.matchingPublications++;
      }
    };
    const error = (): void => {
      this.diagnostics.errors++;
    };
    const disconnected = (): void => {
      this.diagnostics.disconnects++;
    };
    for (const [event, handler] of [
      ['publication', publication],
      ['error', error],
      ['disconnected', disconnected],
    ] as const) {
      client.on(event, handler);
      this.stops.push(() => client.off(event, handler));
    }
  }

  async next(index: number): Promise<PostgresChange> {
    if (this.events.length <= index) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.changed = null;
          const operation = index === 0 ? 'INSERT' : 'UPDATE';
          const mode = this.automatic ? 'automatic' : 'lightweight';
          reject(
            new Error(
              `Postgres ${operation} notification did not arrive within 10 seconds (${mode} client; ${JSON.stringify(this.diagnostics)}; matched=${String(this.events.length)})`,
            ),
          );
        }, 10000);
        this.changed = () => {
          if (this.events.length > index) {
            clearTimeout(timer);
            this.changed = null;
            resolve();
          }
        };
        this.changed();
      });
    }
    const event = this.events[index];
    if (event === undefined) {
      throw new Error('Postgres notification was missing');
    }
    return event;
  }

  close(): void {
    for (const stop of this.stops) {
      stop();
    }
  }
}

function verifyChange(
  event: PostgresChange,
  type: string,
  table: string,
  row: { id: string; value: string; owner_id: string },
  automatic: boolean,
): void {
  expect(event).toMatchObject({ type, schema: 'public', table });
  expect(Number.isFinite(Date.parse(event.timestamp))).toBe(true);
  if (automatic) {
    expect(event.record).toEqual(row);
    expect(event.id ?? null).toBeNull();
    expect(event.mode ?? null).toBeNull();
  } else {
    expect(event).toMatchObject({ id: row.id, mode: 'lightweight' });
    expect(event.record ?? null).toBeNull();
  }
}

async function mutateRow(
  world: PostgresWorld,
  table: string,
  expected: { id: string; value: string; owner_id: string },
  index: number,
): Promise<void> {
  const database = world.client.database(world.fixture.database_name);
  const result =
    index === 0
      ? await database.insert(table, expected)
      : await database.update(table, { value: expected.value }).eq('id', expected.id);
  if (result.error !== null) {
    throw result.error;
  }
  expect(result.data).toEqual([expected]);
}

async function verifyPostgresChanges(world: PostgresWorld): Promise<string[]> {
  const tableName = world.fixture.realtime_table_name;
  const row = { id: randomUUID(), value: 'inserted', owner_id: world.fixture.user_id };
  const database = () => world.client.database(world.fixture.database_name);
  world.cleanupCallbacks.push(async () => {
    const result = await database().delete(tableName).eq('id', row.id);
    if (result.error !== null) {
      throw result.error;
    }
  });
  const channels = world.realtimeClients.map((client, index) => {
    client.setVolcanoClient(world.client);
    client.setDatabaseName(world.fixture.database_name);
    return client.channel(`public:${tableName}`, { type: 'postgres', autoFetch: index === 0 });
  });
  const observers = createObservers(channels, world.realtimeClients, tableName, row.id);
  try {
    await Promise.all(channels.map((channel) => channel.subscribe()));
    for (const [index, type] of ['INSERT', 'UPDATE'].entries()) {
      const expected = { ...row, value: index === 0 ? 'inserted' : 'updated' };
      await mutateRow(world, tableName, expected, index);
      const events = await Promise.all(observers.map((observer) => observer.next(index)));
      events.forEach((event, client) => {
        verifyChange(event, type, tableName, expected, client === 0);
      });
    }
    for (const observer of observers) {
      expect(observer.events.map((event) => event.type)).toEqual(['INSERT', 'UPDATE']);
      expect(observer.inserts).toBe(1);
      expect(observer.wrongTable).toBe(0);
    }
    return ['INSERT', 'UPDATE'];
  } finally {
    observers.forEach((observer) => {
      observer.close();
    });
    await Promise.all(channels.map((channel) => channel.unsubscribe()));
  }
}

export { ChangeObserver, verifyChange, verifyPostgresChanges };
