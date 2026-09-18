const { verifyChange } = require('./contract/postgres-changes.js');

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
])('rejects mismatched Postgres notification identity: %j', (event, automatic) => {
  expect(() => verifyChange(event, 'INSERT', 'records', row, automatic)).toThrow();
});

test.each([
  [{ ...base, record: row }, true],
  [{ ...base, id: row.id, mode: 'lightweight' }, false],
])('accepts the matching notification: %j', (event, automatic) => {
  verifyChange(event, 'INSERT', 'records', row, automatic);
});
