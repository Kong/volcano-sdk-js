import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const reporter = fileURLToPath(new URL('node-completeness.mjs', import.meta.url));
const passing = "await test('passes', () => assert.equal(1, 1));";

async function runFixture(
  source?: string,
  extra: readonly string[] = [],
): Promise<SpawnSyncReturns<string>> {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-native-tests-'));
  try {
    if (source !== undefined) {
      await writeFile(
        join(directory, 'fixture.test.mjs'),
        `import assert from 'node:assert/strict'; import test from 'node:test';\n${source}`,
      );
    }
    // Each fixture starts a new runner, not a worker nested in this runner.
    const env = { ...process.env };
    delete env['NODE_TEST_CONTEXT'];
    return spawnSync(
      process.execPath,
      [
        '--test',
        `--test-reporter=${reporter}`,
        ...extra,
        join(directory, source === undefined ? '*.test.mjs' : 'fixture.test.mjs'),
      ],
      { encoding: 'utf8', timeout: 15_000, env },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await test('native reporter accepts a complete passing suite', async () => {
  const result = await runFixture(passing);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
});

const incomplete: [string, string, string[]][] = [
  ['skipped case', `${passing} await test.skip('skipped', () => {});`, []],
  ['pending case', `${passing} await test.todo('pending');`, []],
  ['empty suite file', '', []],
  [
    'name-filtered case',
    `${passing} await test('filtered', () => {});`,
    ['--test-name-pattern=passes'],
  ],
  ['focused case', `${passing} await test.only('focused', () => {});`, ['--test-only']],
];
for (const [name, source, arguments_] of incomplete) {
  await test(`native reporter rejects ${name}`, async () => {
    const result = await runFixture(source, arguments_);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Incomplete native test run/);
  });
}

await test('native reporter rejects empty file discovery', async () => {
  const result = await runFixture();
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
});

const failed: [string, string][] = [
  ['assertion failure', "await test('fails', () => assert.equal(1, 2));"],
  ['cancelled case', "await test('cancelled', () => new Promise(() => {}));"],
];
for (const [name, source] of failed) {
  await test(`native reporter preserves ${name}`, async () => {
    const result = await runFixture(source);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
  });
}
