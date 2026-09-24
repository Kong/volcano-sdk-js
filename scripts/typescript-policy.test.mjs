import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = join(root, 'node_modules/eslint/bin/eslint.js');
const require = createRequire(import.meta.url);
const coverageConfig = require('../jest.typed.config.cjs');

function trackedFiles() {
  return execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function handwrittenSource(files) {
  return files.filter(
    (path) =>
      path.startsWith('src/') &&
      path.endsWith('.ts') &&
      !path.endsWith('.d.ts') &&
      !path.startsWith('src/generated/') &&
      !path.startsWith('src/generated-runtime/'),
  );
}

test('tracked SDK code remains in native lint, type, test, and coverage gates', async () => {
  const files = trackedFiles();
  const runtime = handwrittenSource(files);
  const tests = files.filter((path) => path.startsWith('__tests__/') && path.endsWith('.ts'));
  assert.ok(runtime.length > 0);
  assert.ok(tests.some((path) => path.endsWith('.test.ts')));
  const tsconfig = JSON.parse(await readFile(join(root, 'tsconfig.json'), 'utf8'));
  assert.deepEqual(tsconfig.include, ['src/**/*.ts', '__tests__/**/*.ts']);
  assert.deepEqual(tsconfig.exclude, ['src/generated', 'src/generated-runtime']);
  assert.deepEqual(coverageConfig.collectCoverageFrom, [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/generated/**',
  ]);
  assert.deepEqual(coverageConfig.coverageThreshold.global, {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  });
  assert.deepEqual(coverageConfig.testMatch, ['**/__tests__/**/*.test.{js,ts}']);
  const checker = new ESLint();
  for (const path of [...runtime, ...tests]) {
    assert.equal(
      await checker.isPathIgnored(join(root, path)),
      false,
      `${path} is ignored by ESLint`,
    );
    const source = await readFile(join(root, path), 'utf8');
    assert.doesNotMatch(
      source,
      /eslint-(?:disable|enable)|@ts-(?:ignore|expect-error|nocheck)|(?:istanbul|c8|nyc) ignore/,
      `${path} suppresses a quality check`,
    );
  }
  assert.deepEqual(
    files.filter((path) =>
      /^(?:src|__tests__)\/(?:.*\/)?(?:eslint\.config\.|\.eslintrc|tsconfig\.|jest\.)/.test(path),
    ),
    [],
  );
});

async function lintFixture(source, parent) {
  const directory = await mkdtemp(join(root, parent, 'quality-fixture-'));
  try {
    const path = join(directory, parent === 'src' ? 'fixture.ts' : 'fixture.test.ts');
    await writeFile(path, source);
    const result = spawnSync(
      process.execPath,
      [eslint, '--format=json', '--max-warnings=0', path],
      {
        encoding: 'utf8',
        timeout: 30_000,
      },
    );
    assert.equal(result.error, undefined);
    assert.ok(result.status === 0 || result.status === 1, result.stderr);
    return JSON.parse(result.stdout);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const violations = [
  [
    'disabled rule comment',
    '/* eslint-disable @typescript-eslint/no-explicit-any */\nexport function value(input: any): unknown { return input; }',
    '@typescript-eslint/no-explicit-any',
  ],
  [
    'inline rule override',
    '/* eslint @typescript-eslint/no-explicit-any: "off" */\nexport function value(input: any): unknown { return input; }',
    '@typescript-eslint/no-explicit-any',
  ],
  [
    'explicit any',
    'export function value(input: any): unknown { return input; }',
    '@typescript-eslint/no-explicit-any',
  ],
  [
    'unsafe assertion',
    'export function value(input: unknown): string { return input as unknown as string; }',
    '@typescript-eslint/no-unsafe-type-assertion',
  ],
  [
    'non-null assertion',
    'export function value(input: string | undefined): string { return input!; }',
    '@typescript-eslint/no-non-null-assertion',
  ],
  [
    'unawaited operation',
    'export function value(): void { Promise.resolve(); }',
    '@typescript-eslint/no-floating-promises',
  ],
  [
    'unsafe boolean',
    'export function value(input: unknown): boolean { return input ? true : false; }',
    '@typescript-eslint/strict-boolean-expressions',
  ],
  [
    'excessive complexity',
    'export function value(input: number): boolean { return input === 1 || input === 2 || input === 3 || input === 4 || input === 5 || input === 6; }',
    'complexity',
  ],
];

const contexts = [
  ['src', ''],
  [
    '__tests__',
    "import { expect, test } from '@jest/globals';\ntest('works', () => { expect(true).toBe(true); });\n",
  ],
];

for (const [parent, setup] of contexts) {
  test(`typed lint accepts safe code in ${parent}`, async () => {
    const results = await lintFixture(`${setup}export const enabled = true;`, parent);
    assert.deepEqual(
      results.flatMap((result) => result.messages),
      [],
    );
  });

  for (const [name, source, rule] of violations) {
    test(`typed lint rejects ${name} in ${parent}`, async () => {
      const results = await lintFixture(`${setup}${source}`, parent);
      const rules = results.flatMap((result) => result.messages.map((message) => message.ruleId));
      assert.ok(rules.includes(rule), `Missing ${rule}: ${JSON.stringify(results)}`);
    });
  }
}
