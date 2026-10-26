import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint, requireLinted } from './oxlint-report.mts';
import { record } from './values.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = record(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')));

// oxlint's correctness and pedantic categories at their defaults: no rule, plugin, or override changes.
const defaultConfig = {
  $schema: './node_modules/oxlint/configuration_schema.json',
  categories: { correctness: 'error', pedantic: 'error' },
  ignorePatterns: ['src/generated/**', 'src/generated-runtime/**'],
};

const contexts: [string, string][] = [
  ['src', 'fixture.ts'],
  ['scripts', 'fixture.test.mts'],
  ['__tests__', 'fixture.test.ts'],
  ['test/types', 'fixture.ts'],
  ['examples/nextjs-notes-app/src', 'fixture.js'],
];

const violations: [string, string, string][] = [
  ['a debugger statement', 'export function pause() {\n  debugger;\n}\n', 'eslint(no-debugger)'],
  ['loose equality', 'export function same(left, right) {\n  return left == right;\n}\n', 'eslint(eqeqeq)'],
  ['an async function without await', 'export async function value() {\n  return 1;\n}\n', 'eslint(require-await)'],
];

async function lintFixture(parent: string, filename: string, source: string): Promise<string[]> {
  const directory = await mkdtemp(join(root, parent, 'quality-fixture-'));
  try {
    const path = join(directory, filename);
    await writeFile(path, source);
    const report = lint([path]);
    assert.equal(report.files, 1, `${parent} fixtures are ignored by oxlint`);
    return report.findings.map(({ code }) => code);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await test('oxlint runs the default correctness and pedantic categories', async () => {
  assert.deepEqual(JSON.parse(await readFile(join(root, '.oxlintrc.json'), 'utf8')), defaultConfig);
  assert.equal(record(manifest['scripts'])['lint'], 'oxlint && pnpm format:check');
});

await test('generated code is outside lint scope and fails the coverage check', () => {
  assert.throws(() => {
    requireLinted('src/generated/client.ts');
  }, /ignored by oxlint/u);
});

for (const [parent, filename] of contexts) {
  await test(`oxlint accepts clean code in ${parent}`, async () => {
    assert.deepEqual(await lintFixture(parent, filename, 'export const enabled = true;\n'), []);
  });

  for (const [name, source, code] of violations) {
    await test(`oxlint rejects ${name} in ${parent}`, async () => {
      assert.ok((await lintFixture(parent, filename, source)).includes(code), `Missing ${code}`);
    });
  }
}
