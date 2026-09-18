const { verifyChange, ChangeObserver } = require('./contract/postgres-changes.js');
const { EventEmitter } = require('node:events');

const row = { id: 'row', value: 'inserted', owner_id: 'user' };
const base = {
  type: 'INSERT',
  schema: 'public',
  table: 'records',
  timestamp: '2026-09-18T12:00:00Z',
};

test.each([
  [{ ...base, record: { ...row, id: 'wrong-row' } }, true],
  [{ ...base, id: 'wrong-row', mode: 'lightweight' }, false],
  [{ ...base, table: 'wrong-table', record: row }, true],
  [{ ...base, record: row, id: row.id }, true],
  [{ ...base, record: row, mode: 'lightweight' }, true],
])('rejects mismatched Postgres notification identity: %j', (event, automatic) => {
  expect(() => verifyChange(event, 'INSERT', 'records', row, automatic)).toThrow();
});

test.each([
  [{ ...base, record: row }, true],
  [{ ...base, id: row.id, mode: 'lightweight' }, false],
])('accepts the matching notification: %j', (event, automatic) => {
  verifyChange(event, 'INSERT', 'records', row, automatic);
});

test.each([true, false])(
  'ignores other rows in observer callbacks (automatic=%s)',
  async (automatic) => {
    const callbacks = [];
    const channel = {
      onPostgresChanges: (_kind, _schema, _table, callback) => {
        callbacks.push(callback);
        return () => {};
      },
    };
    const observer = new ChangeObserver(channel, 'records', row.id);
    const event = (id) =>
      automatic ? { ...base, record: { ...row, id } } : { ...base, id, mode: 'lightweight' };
    callbacks.forEach((callback) => callback(event('other')));
    expect(observer.events).toEqual([]);
    expect(observer.inserts).toBe(0);
    expect(observer.wrongTable).toBe(0);
    callbacks[0](event(row.id));
    callbacks[1](event(row.id));
    expect(await observer.next(0)).toEqual(event(row.id));
    expect(observer.inserts).toBe(1);
    observer.close();
  },
);

test('timeout identifies delivery stage without exposing publication data or errors', async () => {
  jest.useFakeTimers();
  const callbacks = [];
  const channel = {
    onPostgresChanges: (_kind, _schema, _table, callback) => {
      callbacks.push(callback);
      return () => {};
    },
  };
  const client = new EventEmitter();
  const secret = 'private-row-and-credential-canary';
  const observer = new ChangeObserver(channel, 'records', row.id, { client, automatic: true });
  try {
    client.emit('publication', {
      channel: 'project:postgres:public:records:user',
      data: { ...base, id: row.id, private: secret },
    });
    client.emit('publication', { channel: 'project:broadcast:other', data: { private: secret } });
    client.emit('error', new Error(secret));
    client.emit('disconnected', { reason: secret });
    callbacks[0]({ ...base, id: secret });
    const result = observer.next(0).catch((error) => error.message);
    jest.advanceTimersByTime(10000);
    expect(await result).toBe(
      'Postgres INSERT notification did not arrive within 10 seconds (automatic client; {"publications":1,"matchingPublications":1,"callbacks":1,"errors":1,"disconnects":1}; matched=0)',
    );
    expect(await result).not.toContain(secret);
  } finally {
    observer.close();
    jest.useRealTimers();
  }
  expect(
    ['publication', 'error', 'disconnected'].map((event) => client.listenerCount(event)),
  ).toEqual([0, 0, 0]);
});

test('timeout identifies a missing update for the lightweight client', async () => {
  jest.useFakeTimers();
  const observer = new ChangeObserver({ onPostgresChanges: () => () => {} }, 'records', row.id);
  try {
    const result = observer.next(1).catch((error) => error.message);
    jest.advanceTimersByTime(10000);
    expect(await result).toContain(
      'Postgres UPDATE notification did not arrive within 10 seconds (lightweight client;',
    );
  } finally {
    observer.close();
    jest.useRealTimers();
  }
});
