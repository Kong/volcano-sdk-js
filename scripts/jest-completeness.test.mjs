import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const jest = fileURLToPath(new URL('../node_modules/jest/bin/jest.js', import.meta.url));
const reporter = fileURLToPath(new URL('jest-completeness.cjs', import.meta.url));
const passing = "test('passes', () => expect(1).toBe(1));";

async function runFixture(source, extraArguments = []) {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-jest-policy-'));
  try {
    if (source !== undefined) {
      await writeFile(join(directory, 'fixture.test.js'), source);
    }
    return spawnSync(
      process.execPath,
      [
        jest,
        '--config',
        JSON.stringify({
          rootDir: directory,
          testEnvironment: 'node',
          reporters: [reporter],
          testMatch: ['<rootDir>/*.test.js'],
        }),
        '--runInBand',
        '--no-cache',
        ...extraArguments,
      ],
      { encoding: 'utf8', timeout: 15_000 },
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('accepts a complete passing Jest run', async () => {
  const result = await runFixture(passing);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

const incompleteRuns = [
  ['a skipped test', `${passing} test.skip('skipped', () => {});`],
  ['a skipped suite', `${passing} describe.skip('skipped', () => { ${passing} });`],
  ['a todo test', `${passing} test.todo('todo');`],
  ['a fully skipped run', "test.skip('skipped', () => {});"],
  [
    'a test that passes only after a retry',
    "jest.retryTimes(1); let calls = 0; test('retry', () => expect(++calls).toBe(2));",
  ],
];

for (const [name, source] of incompleteRuns) {
  test(`rejects ${name}`, async () => {
    const result = await runFixture(source);
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Incomplete test run:/);
  });
}

test('rejects empty discovery even with passWithNoTests', async () => {
  const result = await runFixture(undefined, ['--passWithNoTests']);
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /Incomplete test run:/);
});

test('preserves a real assertion failure', async () => {
  const result = await runFixture("test('fails', () => expect(1).toBe(2));");
  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /Incomplete test run:/);
});

const forbiddenSources = [
  ["test.only('focused', () => expect(1).toBe(1));", 'jest/no-focused-tests'],
  [
    "describe.only('focused', () => { test('works', () => expect(1).toBe(1)); });",
    'jest/no-focused-tests',
  ],
  ["test.skip('skipped', () => expect(1).toBe(1));", 'jest/no-disabled-tests'],
  ["test.todo('pending');", 'no-restricted-properties'],
  ['jest.retryTimes(1);', 'no-restricted-properties'],
];

for (const [source, rule] of forbiddenSources) {
  test(`lint rejects ${source}`, async () => {
    const eslint = new ESLint();
    const results = await eslint.lintText(source, {
      filePath: '__tests__/quality-negative.test.js',
    });
    assert.ok(results.some((result) => result.messages.some((message) => message.ruleId === rule)));
  });
}

test('the integration entrypoint discovers server-backed suites', () => {
  const packageManager = process.env.npm_execpath;
  assert.ok(packageManager, 'Run tooling tests through pnpm test:tooling.');
  const result = spawnSync(
    process.execPath,
    [packageManager, 'test:integration', '--listTests', '--json', '--runInBand'],
    { encoding: 'utf8', timeout: 15_000 },
  );
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const discovery = result.stdout.trim().split('\n').at(-1);
  assert.ok(discovery);
  const paths = JSON.parse(discovery);
  assert.equal(paths.length, 6);
  assert.ok(paths.every((path) => path.includes('/__tests__/integration/')));
});
