const { verifyChange, ChangeObserver } = require('./contract/postgres-changes.js');

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
