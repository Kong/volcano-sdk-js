const { VolcanoClient } = require('../src/index.js');
const { verifyPostgresChanges } = require('./contract/postgres-changes.js');
const { verifyPresenceMembership } = require('./contract/presence-membership.js');

function observerChannel(automatic) {
  const callbacks = [];
  return {
    subscribe: async () => {},
    unsubscribe: async () => {},
    onPostgresChanges: (type, _schema, table, callback) => {
      callbacks.push({ type, table, callback });
      return () => {};
    },
    emit(type, row) {
      const event = {
        type,
        schema: 'public',
        table: 'records',
        timestamp: new Date().toISOString(),
      };
      Object.assign(event, automatic ? { record: row } : { id: row.id, mode: 'lightweight' });
      for (const listener of callbacks) {
        if (listener.table === 'records' && ['*', type].includes(listener.type))
          listener.callback(event);
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
  const requests = [];
  let row;
  global.fetch.mockImplementation(async (url, options) => {
    const body = JSON.parse(options.body);
    requests.push({ url, body });
    if (url.endsWith('/insert')) row = body.values;
    else if (url.endsWith('/update')) row = { ...row, ...body.values };
    if (!url.endsWith('/delete'))
      channels.forEach((channel) =>
        channel.emit(url.endsWith('/insert') ? 'INSERT' : 'UPDATE', row),
      );
    return { ok: true, status: 200, json: async () => ({ data: [row] }) };
  });
  const world = {
    fixture: { realtime_table_name: 'records', database_name: 'db', user_id: 'user' },
    client,
    cleanupCallbacks: [],
    realtimeClients: channels.map((channel) => ({
      setVolcanoClient() {},
      setDatabaseName() {},
      channel: () => channel,
    })),
  };
  expect(await verifyPostgresChanges(world)).toEqual(['INSERT', 'UPDATE']);
  await world.cleanupCallbacks[0]();
  expect(requests.map(({ url }) => url)).toEqual(
    ['insert', 'update', 'delete'].map(
      (operation) => `https://api.test/databases/db/query/${operation}`,
    ),
  );
  expect(requests.map(({ body }) => body.table)).toEqual(['records', 'records', 'records']);
  expect(requests[2].body.filters).toEqual([{ column: 'id', operator: 'eq', value: row.id }]);
});

test('presence retains a channel name at the platform length boundary', async () => {
  const stop = new Error('valid channel');
  const world = {
    realtimeChannel: 'x'.repeat(64),
    fixture: { user_id: 'user' },
    realtimeClients: Array.from({ length: 2 }, () => ({
      channel(name, options) {
        expect(name.length).toBeLessThanOrEqual(64);
        expect(options).toEqual({ type: 'presence' });
        return {
          onPresenceSync: () => () => {},
          subscribe: async () => {
            throw stop;
          },
          unsubscribe: async () => {},
        };
      },
    })),
  };
  await expect(verifyPresenceMembership(world)).rejects.toBe(stop);
});
