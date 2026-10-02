import assert from 'node:assert/strict';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { record } from './values.mts';

const require = createRequire(import.meta.url);
const config = record(require('../jest.typed.config.cjs'));
const jest = require.resolve('jest/bin/jest');
const babel = fileURLToPath(new URL('../babel.config.js', import.meta.url));
const reporter = fileURLToPath(new URL('jest-completeness.cjs', import.meta.url));
const source = 'export function value(flag: boolean): number { return flag ? 1 : 2; }';
const assertions = `
  import { value } from '../src/value';
  test('both branches', () => {
    expect(value(true)).toBe(1);
    expect(value(false)).toBe(2);
  });
`;

async function runCoverage(
  files: Record<string, string> = {},
): Promise<SpawnSyncReturns<string> & { coverage: Record<string, unknown> }> {
  const directory = await mkdtemp(join(tmpdir(), 'volcano-typed-coverage-'));
  try {
    for (const [name, contents] of Object.entries({
      'src/value.ts': source,
      '__tests__/value.test.ts': assertions,
      ...files,
    })) {
      const path = join(directory, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, contents);
    }
    const result = spawnSync(
      process.execPath,
      [
        jest,
        '--config',
        JSON.stringify({
          ...config,
          rootDir: directory,
          testEnvironment: 'node',
          setupFilesAfterEnv: [],
          reporters: [reporter],
          transform: { '^.+\\.[jt]sx?$': [require.resolve('babel-jest'), { configFile: babel }] },
        }),
        '--runInBand',
      ],
      { cwd: directory, encoding: 'utf8', timeout: 30_000 },
    );
    assert.equal(result.error, undefined);
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    const coverage = record(
      JSON.parse(await readFile(join(directory, 'coverage/coverage-final.json'), 'utf8')),
    );
    return { ...result, coverage };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await test('typed coverage accepts a fully exercised runtime module', async () => {
  const result = await runCoverage();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Object.keys(result.coverage).length, 1);
});

await test('typed coverage rejects a new runtime module that no test imports', async () => {
  const result = await runCoverage({
    'src/new-module.ts': 'export function missed(): number { return 1; }',
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /coverage threshold for (lines|statements).*not met/);
  assert.equal(Object.keys(result.coverage).length, 2);
});

await test('typed coverage rejects an unexercised branch', async () => {
  const result = await runCoverage({
    '__tests__/value.test.ts': assertions.replace('expect(value(false)).toBe(2);', ''),
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /coverage threshold for branches.*not met/);
});

await test('typed coverage rejects 99 percent function coverage with every line covered', async () => {
  const functions = Array.from({ length: 100 }, () => '() => {}').join(',');
  const result = await runCoverage({
    'src/functions.ts': `export const operations = [${functions}];`,
    '__tests__/functions.test.ts': `
      import { operations } from '../src/functions';
      test('leaves one function uncalled', () => {
        for (const operation of operations.slice(0, -1)) operation();
        expect(operations).toHaveLength(100);
      });
    `,
  });
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /coverage threshold for functions.*not met/);
  assert.doesNotMatch(result.stderr, /coverage threshold for (lines|statements|branches)/);
});

await test('typed coverage excludes generated output and declarations', async () => {
  const result = await runCoverage({
    'src/generated/client.ts': 'export function generated(): number { return 1; }',
    'src/public.d.ts': 'export declare const publicValue: number;',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(Object.keys(result.coverage).length, 1);
});

await test('typed coverage discovers a newly added test without a task-list edit', async () => {
  const result = await runCoverage({
    '__tests__/new.test.ts': "test('new failure', () => { expect(true).toBe(false); });",
  });
  assert.equal(result.status, 1, result.stderr);
  assert.doesNotMatch(result.stderr, /coverage threshold/);
});
