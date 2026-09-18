const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('stages the canonical database query feature', () => {
  const feature = readFileSync(path.join(__dirname, '../features/staged/database-queries.feature'));
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '37d7f2e8fd4efb035cbc094c9c91a44a86f15fbcd689627e525e8d04f033a928',
  );
});

test('stages the canonical storage session feature', () => {
  const feature = readFileSync(path.join(__dirname, '../features/staged/storage-sessions.feature'));
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '037c60a8da27ec4cc5777596ba0c669b8309181a54b27aa61882535ed2f6beb1',
  );
});

test('stages the canonical logs feature', () => {
  const feature = readFileSync(path.join(__dirname, '../features/staged/logs.feature'));
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '5616e288fe1a68e13fa70416fe0323a5ce830c0edaa885a387efbf9e5bb2a269',
  );
});

test('stages the canonical presence membership feature', () => {
  const feature = readFileSync(
    path.join(__dirname, '../features/staged/realtime-presence.feature'),
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
