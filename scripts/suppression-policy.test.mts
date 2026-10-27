import assert from 'node:assert/strict';
import test from 'node:test';
import { requireUnsuppressed } from './suppression-policy.mts';

await test('an approved directive sits alone on its line, once per approval', () => {
  const directive =
    '// oxlint-disable-next-line eslint/no-redeclare -- The published runtime value and public type share this name.';
  const approved = `${directive}\nexport const QueryBuilder = 1;\n${directive}\nexport const StorageFileApi = 1;\n`;
  assert.doesNotThrow(() => {
    requireUnsuppressed('src/index.ts', approved);
  });
  assert.throws(() => {
    requireUnsuppressed(
      'src/index.ts',
      `export const QueryBuilder = 1; ${directive}\n${directive}\nexport const StorageFileApi = 1;\n`,
    );
  }, /shares a line/u);
  assert.throws(() => {
    requireUnsuppressed('src/index.ts', `${approved}export const extra = 1; ${directive}\n`);
  }, /shares a line/u);
  assert.throws(() => {
    requireUnsuppressed('src/index.ts', `${approved}${directive}\nexport const extra = 1;\n`);
  }, /once per approval/u);
});
