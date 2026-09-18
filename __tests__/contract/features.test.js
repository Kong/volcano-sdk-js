const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

test('stages the canonical database query feature', () => {
  const feature = readFileSync(
    path.join(__dirname, '../../features/staged/database-queries.feature'),
  );
  expect(createHash('sha256').update(feature).digest('hex')).toBe(
    '37d7f2e8fd4efb035cbc094c9c91a44a86f15fbcd689627e525e8d04f033a928',
  );
});
