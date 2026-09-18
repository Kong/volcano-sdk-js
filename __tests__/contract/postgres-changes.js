const { randomUUID } = require('node:crypto');

class ChangeObserver {
  constructor(channel, table, rowId, { client, automatic = false } = {}) {
    this.events = [];
    this.changed = null;
    this.inserts = 0;
    this.wrongTable = 0;
    this.automatic = automatic;
    this.diagnostics = {
      publications: 0,
      matchingPublications: 0,
      callbacks: 0,
      errors: 0,
      disconnects: 0,
    };
    const owns = (event) => (event?.record?.id ?? event?.id) === rowId;
    this.stops = [
      channel.onPostgresChanges('*', 'public', table, (event) => {
        this.diagnostics.callbacks++;
        if (!owns(event)) return;
        this.events.push(event);
        this.changed?.();
      }),
      channel.onPostgresChanges('INSERT', 'public', table, (event) => {
        if (owns(event)) this.inserts++;
      }),
      channel.onPostgresChanges('*', 'public', `${table}_other`, (event) => {
        if (owns(event)) this.wrongTable++;
      }),
    ];
    this.observeTransport(client, owns);
  }

  observeTransport(client, owns) {
    if (!client) return;
    const handlers = {
      publication: ({ channel, data }) => {
        if (!channel?.includes(':postgres:')) return;
        this.diagnostics.publications++;
        if (owns(data)) this.diagnostics.matchingPublications++;
      },
      error: () => {
        this.diagnostics.errors++;
      },
      disconnected: () => {
        this.diagnostics.disconnects++;
      },
    };
    for (const [event, handler] of Object.entries(handlers)) {
      client.on(event, handler);
      this.stops.push(() => client.off(event, handler));
    }
  }

  async next(index) {
    if (this.events.length <= index) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.changed = null;
          const operation = index === 0 ? 'INSERT' : 'UPDATE';
          const mode = this.automatic ? 'automatic' : 'lightweight';
          reject(
            new Error(
              `Postgres ${operation} notification did not arrive within 10 seconds (${mode} client; ${JSON.stringify(this.diagnostics)}; matched=${this.events.length})`,
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
    return this.events[index];
  }

  close() {
    for (const stop of this.stops) stop();
  }
}

function verifyChange(event, type, table, row, automatic) {
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

async function verifyPostgresChanges(world) {
  const tableName = world.fixture.realtime_table_name;
  const row = { id: randomUUID(), value: 'inserted', owner_id: world.fixture.user_id };
  const database = () => world.client.database(world.fixture.database_name);
  world.cleanupCallbacks.push(async () => {
    const result = await database().delete(tableName).eq('id', row.id);
    if (result.error) throw result.error;
  });
  const channels = world.realtimeClients.map((client, index) => {
    client.setVolcanoClient(world.client);
    client.setDatabaseName(world.fixture.database_name);
    return client.channel(`public:${tableName}`, { type: 'postgres', autoFetch: index === 0 });
  });
  const observers = channels.map(
    (channel, index) =>
      new ChangeObserver(channel, tableName, row.id, {
        client: world.realtimeClients[index].getClient?.(),
        automatic: index === 0,
      }),
  );
  try {
    await Promise.all(channels.map((channel) => channel.subscribe()));
    for (const [index, type] of ['INSERT', 'UPDATE'].entries()) {
      const expected = { ...row, value: index === 0 ? 'inserted' : 'updated' };
      const result =
        index === 0
          ? await database().insert(tableName, expected)
          : await database().update(tableName, { value: expected.value }).eq('id', row.id);
      if (result.error) throw result.error;
      expect(result.data).toEqual([expected]);
      const events = await Promise.all(observers.map((observer) => observer.next(index)));
      events.forEach((event, client) =>
        verifyChange(event, type, tableName, expected, client === 0),
      );
    }
    for (const observer of observers) {
      expect(observer.events.map((event) => event.type)).toEqual(['INSERT', 'UPDATE']);
      expect(observer.inserts).toBe(1);
      expect(observer.wrongTable).toBe(0);
    }
    return ['INSERT', 'UPDATE'];
  } finally {
    observers.forEach((observer) => observer.close());
    await Promise.all(channels.map((channel) => channel.unsubscribe()));
  }
}

module.exports = { verifyPostgresChanges, verifyChange, ChangeObserver };
