import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { isAbsolute, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import * as prettier from 'prettier';
import ts from 'typescript';

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = join(root, 'node_modules/eslint/bin/eslint.js');
const jest = join(root, 'node_modules/jest/bin/jest.js');
const require = createRequire(import.meta.url);
const coverageConfig = require('../jest.typed.config.cjs');
const manifest = require('../package.json');
const nextRules = require('@next/eslint-plugin-next').flatConfig.coreWebVitals.rules;
const requiredQualityCommands = [
  'pnpm run audit',
  'pnpm lint',
  'pnpm check:unused',
  'pnpm check:openapi',
  'pnpm test:types',
  'pnpm test:tooling',
  'node scripts/prepare-test-reports.mjs',
  'pnpm test --ci --json --outputFile=reports/unit.json',
  'pnpm test:typed-runtime',
  'pnpm test:contract --listTests',
  'pnpm test:quickstart',
  'pnpm test:examples',
];

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

function maintainedCode(files) {
  return files.filter(
    (path) =>
      /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) &&
      !path.startsWith('src/generated/') &&
      !path.startsWith('src/generated-runtime/'),
  );
}

function typecheckedFiles(configPath) {
  const path = join(root, configPath);
  const config = ts.readConfigFile(path, ts.sys.readFile);
  assert.equal(config.error, undefined, `${configPath} is invalid`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, path);
  assert.deepEqual(parsed.errors, [], `${configPath} has configuration errors`);
  return new Set(parsed.fileNames);
}

function discoveredTests(configPath) {
  return JSON.parse(
    execFileSync(
      process.execPath,
      [jest, '--listTests', '--json', '--runInBand', '--config', configPath],
      {
        cwd: root,
        encoding: 'utf8',
      },
    ),
  );
}

function requireFullCoverage(config) {
  assert.deepEqual(config.coverageThreshold.global, {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  });
  assert.deepEqual(config.collectCoverageFrom, [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/generated/**',
  ]);
}

function requireQualityCommands(commands) {
  assert.deepEqual(commands.split(' && '), requiredQualityCommands);
}

function requireUnsuppressed(path, source) {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }
    requireAllowedComment(path, scanner.getTokenText());
  }
}

function requireAllowedComment(path, comment) {
  const forbidden =
    /eslint-disable|eslint-enable|eslint\s|@ts-ignore|@ts-nocheck|istanbul ignore|c8 ignore|nyc ignore/;
  assert.doesNotMatch(comment, forbidden, `${path} suppresses a quality check`);
  if (path.startsWith('test/types/') && comment.includes('@ts-expect-error')) {
    assert.match(
      comment,
      /^\/\/\s*@ts-expect-error\s+\S/,
      `${path} needs an expected-error rationale`,
    );
    return;
  }
  assert.doesNotMatch(comment, /@ts-expect-error/, `${path} suppresses a quality check`);
}

async function requireLinted(checker, path) {
  const absolute = join(root, path);
  assert.equal(await checker.isPathIgnored(absolute), false, `${path} is ignored by ESLint`);
  const config = await checker.calculateConfigForFile(absolute);
  assert.ok(config, `${path} has no ESLint configuration`);
  if (!path.endsWith('.d.ts')) {
    assert.deepEqual(config.rules.complexity, [2, 5], `${path} weakens complexity`);
  }
  if (path.startsWith('examples/nextjs-notes-app/src/')) {
    requireNextRules(config, path);
  }
}

function requireNextRules(config, path) {
  for (const [rule, severity] of Object.entries(nextRules)) {
    assert.equal(config.rules[rule]?.[0], severity === 'error' ? 2 : 1, `${path} weakens ${rule}`);
  }
}

function requireNoNestedConfigs(files) {
  const names = [
    '.eslintrc',
    'eslint.config.',
    '.prettierrc',
    'prettier.config.',
    '.prettierignore',
    '.editorconfig',
    'jest.',
    'tsconfig.',
  ];
  assert.deepEqual(
    files.filter(
      (path) =>
        path.includes('/') && names.some((name) => path.split('/').at(-1)?.startsWith(name)),
    ),
    [],
  );
}

async function requireRootFormatting(path) {
  const absolute = isAbsolute(path) ? path : join(root, path);
  const activeConfig = await prettier.resolveConfigFile(absolute);
  assert.equal(activeConfig, join(root, 'prettier.config.cjs'), `${path} overrides Prettier`);
  const file = await prettier.getFileInfo(absolute, { ignorePath: join(root, '.prettierignore') });
  assert.equal(file.ignored, false, `${path} is ignored by Prettier`);
  assert.ok(file.inferredParser, `${path} has no Prettier parser`);
}

async function requireNoManifestOverrides(files) {
  const qualityKeys = ['prettier', 'eslintConfig', 'jest', 'nyc', 'c8'];
  for (const path of files.filter((item) => item.includes('/') && item.endsWith('/package.json'))) {
    const absolute = isAbsolute(path) ? path : join(root, path);
    const manifest = JSON.parse(await readFile(absolute, 'utf8'));
    for (const key of qualityKeys) {
      assert.equal(manifest[key], undefined, `${path} overrides ${key}`);
    }
  }
}

test('tracked SDK code remains in native lint, type, test, and coverage gates', async () => {
  const files = trackedFiles();
  const runtime = handwrittenSource(files);
  const tests = files.filter((path) => path.startsWith('__tests__/') && path.endsWith('.ts'));
  assert.ok(runtime.length > 0);
  assert.ok(tests.some((path) => path.endsWith('.test.ts')));
  const typechecked = typecheckedFiles('tsconfig.json');
  for (const path of [
    ...runtime,
    ...tests,
    ...files.filter((item) => item.startsWith('test/types/') && item.endsWith('.ts')),
  ]) {
    assert.ok(typechecked.has(join(root, path)), `${path} is outside the TypeScript project`);
  }
  requireFullCoverage(coverageConfig);
  requireQualityCommands(manifest.scripts['quality:checks']);
  assert.equal(manifest.scripts['format:check'], 'prettier . --config prettier.config.cjs --check');
  const discovered = new Set(
    ['jest.config.js', 'jest.integration.config.cjs', 'jest.contract.config.cjs'].flatMap(
      (config) => discoveredTests(config),
    ),
  );
  for (const path of files.filter((item) =>
    /^__tests__\/.*\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/.test(item),
  )) {
    assert.ok(discovered.has(join(root, path)), `${path} is not discovered by Jest`);
  }
  const checker = new ESLint();
  for (const path of maintainedCode(files)) {
    await requireLinted(checker, path);
    await requireRootFormatting(path);
    requireUnsuppressed(path, await readFile(join(root, path), 'utf8'));
  }
  assert.deepEqual(
    files.filter(
      (path) =>
        path.startsWith('src/') &&
        path.endsWith('.js') &&
        !path.startsWith('src/generated-runtime/'),
    ),
    ['src/index.js'],
  );
  requireNoNestedConfigs(files);
  await requireNoManifestOverrides(files);
});

test('lowered coverage and suppression comments fail policy validation', () => {
  assert.throws(() =>
    requireFullCoverage({ ...coverageConfig, coverageThreshold: { global: { branches: 99 } } }),
  );
  assert.throws(() =>
    requireQualityCommands(
      requiredQualityCommands.filter((item) => item !== 'pnpm test:typed-runtime').join(' && '),
    ),
  );
  assert.throws(() => requireUnsuppressed('src/new.ts', '// eslint-disable-next-line complexity'));
  assert.throws(() =>
    requireUnsuppressed('src/new.ts', 'const marker = true; // @ts-expect-error\nmarker;'),
  );
  assert.doesNotThrow(() =>
    requireUnsuppressed(
      'test/types/invalid.ts',
      '// @ts-expect-error invalid public call\ninvalid();',
    ),
  );
  assert.throws(() => requireUnsuppressed('test/types/invalid.ts', '// @ts-ignore\ninvalid();'));
  assert.throws(() =>
    requireUnsuppressed('test/types/invalid.ts', '// @ts-expect-error\ninvalid();'),
  );
  assert.throws(() => requireNoNestedConfigs(['examples/nextjs-notes-app/.eslintrc.json']));
});

test('a nested manifest cannot replace the root formatter configuration', async () => {
  const directory = await mkdtemp(join(root, 'examples', 'quality-fixture-'));
  try {
    const source = join(directory, 'fixture.ts');
    await writeFile(source, 'export const value = true;\n');
    await writeFile(join(directory, 'package.json'), JSON.stringify({ prettier: { semi: false } }));
    await assert.rejects(requireRootFormatting(source), /overrides Prettier/);
    await assert.rejects(
      requireNoManifestOverrides([join(directory, 'package.json')]),
      /overrides prettier/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('excluded new code and weakened complexity fail policy validation', async () => {
  await assert.rejects(
    requireLinted({ isPathIgnored: async () => true }, 'src/new-module.ts'),
    /ignored by ESLint/,
  );
  await assert.rejects(
    requireLinted(
      {
        isPathIgnored: async () => false,
        calculateConfigForFile: async () => ({ rules: { complexity: [2, 6] } }),
      },
      'src/new-module.ts',
    ),
    /weakens complexity/,
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
