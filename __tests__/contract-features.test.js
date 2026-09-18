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
