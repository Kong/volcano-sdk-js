const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('vendors the canonical database query feature', () => {
  const feature = readFileSync(
    path.join(__dirname, '../features/contract/database-queries.feature'),
  );
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '37d7f2e8fd4efb035cbc094c9c91a44a86f15fbcd689627e525e8d04f033a928',
  );
});

test('vendors the canonical storage session feature', () => {
  const feature = readFileSync(
    path.join(__dirname, '../features/contract/storage-sessions.feature'),
  );
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '037c60a8da27ec4cc5777596ba0c669b8309181a54b27aa61882535ed2f6beb1',
  );
});

test('vendors the canonical logs feature', () => {
  const feature = readFileSync(path.join(__dirname, '../features/contract/logs.feature'));
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '5616e288fe1a68e13fa70416fe0323a5ce830c0edaa885a387efbf9e5bb2a269',
  );
});

test('vendors the canonical presence membership feature', () => {
  const feature = readFileSync(
    path.join(__dirname, '../features/contract/realtime-presence.feature'),
  );
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    'b4429f6e3df60a6a98be4daf1d8517e2cd7cee651f9eb6463a1090ab49a102b5',
  );
});

const { observedMembership } = require('./contract/presence-membership.js');

test.each([
  [[['first'], ['first', 'second'], ['first']], true],
  [[['first'], ['first', 'second']], false],
  [[['first', 'second'], ['first']], false],
])('requires the original callback membership sequence: %j', (snapshots, expected) => {
  expect(observedMembership(snapshots, ['first'], ['first', 'second'])).toBe(expected);
});

test('vendors the canonical Postgres change feature', () => {
  const feature = readFileSync(
    path.join(__dirname, '../features/contract/realtime-postgres.feature'),
  );
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '794c2ecbb94fd262a37840f4c3fe3bd9f9ee58c22fda9df2a46de60f93e52c91',
  );
});
