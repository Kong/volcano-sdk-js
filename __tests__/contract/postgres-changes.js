const { randomUUID } = require('node:crypto');

class ChangeObserver {
  constructor(channel, table) {
    this.events = [];
    this.changed = null;
    this.inserts = 0;
    this.wrongTable = 0;
    this.stops = [
      channel.onPostgresChanges('*', 'public', table, (event) => {
        this.events.push(event);
        this.changed?.();
      }),
      channel.onPostgresChanges('INSERT', 'public', table, () => this.inserts++),
      channel.onPostgresChanges('*', 'public', `${table}_other`, () => this.wrongTable++),
    ];
  }

  async next(index) {
    if (this.events.length <= index) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          this.changed = null;
          reject(new Error('Postgres notification did not arrive within 10 seconds'));
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
  } else {
    expect(event).toMatchObject({ id: row.id, mode: 'lightweight' });
    expect(event.record ?? null).toBeNull();
  }
}

async function verifyPostgresChanges(world) {
  const tableName = world.fixture.realtime_table_name;
  const row = { id: randomUUID(), value: 'inserted', owner_id: world.fixture.user_id };
  const table = () => world.client.database(world.fixture.database_name).from(tableName);
  world.cleanupCallbacks.push(async () => {
    const result = await table().delete().eq('id', row.id);
    if (result.error) throw result.error;
  });
  const channels = world.realtimeClients.map((client, index) => {
    client.setVolcanoClient(world.client);
    client.setDatabaseName(world.fixture.database_name);
    return client.channel(`public:${tableName}`, { type: 'postgres', autoFetch: index === 0 });
  });
  const observers = channels.map((channel) => new ChangeObserver(channel, tableName));
  try {
    await Promise.all(channels.map((channel) => channel.subscribe()));
    for (const [index, type] of ['INSERT', 'UPDATE'].entries()) {
      const expected = { ...row, value: index === 0 ? 'inserted' : 'updated' };
      const result =
        index === 0
          ? await table().insert(expected)
          : await table().update({ value: expected.value }).eq('id', row.id);
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

module.exports = { verifyPostgresChanges, verifyChange };
