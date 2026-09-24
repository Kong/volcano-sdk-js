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
import { array, record, stringValue } from './values.mts';

interface LintChecker {
  isPathIgnored(path: string): Promise<boolean>;
  calculateConfigForFile(path: string): Promise<unknown>;
}

const root = fileURLToPath(new URL('..', import.meta.url));
const eslint = join(root, 'node_modules/eslint/bin/eslint.js');
const jest = join(root, 'node_modules/jest/bin/jest.js');
const require = createRequire(import.meta.url);
const coverageConfig = record(require('../jest.typed.config.cjs'));
const manifest = record(require('../package.json'));
const nextPlugin = record(require('@next/eslint-plugin-next'));
const nextFlatConfig = record(nextPlugin['flatConfig']);
const nextCoreConfig = record(nextFlatConfig['coreWebVitals']);
const nextRules = record(nextCoreConfig['rules']);
const approvedComments = new Map([
  [
    'src/sdk-public-types.ts',
    new Set([
      '// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Preserve published caller-specified payload and result types.',
      '// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters -- Preserve the published caller-specified input type.',
    ]),
  ],
  [
    'src/volcano-fetch.ts',
    new Set([
      '// eslint-disable-next-line @typescript-eslint/consistent-type-assertions, @typescript-eslint/no-unsafe-type-assertion -- Orval supplies T; preserve its generated response contract.',
    ]),
  ],
]);

function trackedFiles(): string[] {
  return execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function handwrittenSource(files: readonly string[]): string[] {
  return files.filter(
    (path) =>
      path.startsWith('src/') &&
      path.endsWith('.ts') &&
      !path.endsWith('.d.ts') &&
      !path.startsWith('src/generated/') &&
      !path.startsWith('src/generated-runtime/'),
  );
}

function maintainedCode(files: readonly string[]): string[] {
  return files.filter(
    (path) =>
      /\.(?:[cm]?[jt]s|[jt]sx)$/.test(path) &&
      !path.startsWith('src/generated/') &&
      !path.startsWith('src/generated-runtime/'),
  );
}

function untypedHandwrittenFile(path: string): boolean {
  if (!/\.[cm]?js$/.test(path) || path.startsWith('src/generated-runtime/')) {
    return false;
  }
  const nativeLoaders = ['__tests__/node-environment.cjs', '__tests__/browser-environment.cjs'];
  if (nativeLoaders.includes(path)) {
    return false;
  }
  return ['src/', 'scripts/', '__tests__/'].some((prefix) => path.startsWith(prefix));
}

function typecheckedFiles(configPath: string): Set<string> {
  const path = join(root, configPath);
  const config = ts.readConfigFile(path, (filename) => ts.sys.readFile(filename));
  assert.equal(config.error, undefined, `${configPath} is invalid`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root, undefined, path);
  assert.deepEqual(parsed.errors, [], `${configPath} has configuration errors`);
  requireCompilerOptions(parsed.options);
  return new Set(parsed.fileNames);
}

function requireCompilerOptions(options: ts.CompilerOptions): void {
  const required = {
    strict: true,
    noUncheckedIndexedAccess: true,
    exactOptionalPropertyTypes: true,
    noImplicitOverride: true,
    noImplicitReturns: true,
    noFallthroughCasesInSwitch: true,
    noPropertyAccessFromIndexSignature: true,
    noUnusedLocals: true,
    noUnusedParameters: true,
    allowUnreachableCode: false,
    allowUnusedLabels: false,
    skipLibCheck: false,
    noEmitOnError: true,
  };
  for (const [name, value] of Object.entries(required)) {
    assert.equal(options[name], value, `${name} weakens TypeScript checking`);
  }
}

function discoveredTests(configPath: string): string[] {
  return array(
    JSON.parse(
      execFileSync(
        process.execPath,
        [jest, '--listTests', '--json', '--runInBand', '--config', configPath],
        {
          cwd: root,
          encoding: 'utf8',
        },
      ),
    ),
  ).map((value) => stringValue(value));
}

function requireFullCoverage(config: unknown): void {
  assert.deepEqual(record(record(config)['coverageThreshold'])['global'], {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  });
  assert.deepEqual(record(config)['collectCoverageFrom'], [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/generated/**',
  ]);
}

function requireUnsuppressed(path: string, source: string): void {
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

function requireAllowedComment(path: string, comment: string): void {
  if (approvedComments.get(path)?.has(comment) === true) {
    return;
  }
  const forbidden =
    /eslint-disable|eslint-enable|eslint\s|@ts-ignore|@ts-nocheck|(?:istanbul|[cv]8|nyc) ignore|Stryker (?:disable|restore)|prettier-ignore/;
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

async function requireLinted(checker: LintChecker, path: string): Promise<void> {
  const absolute = join(root, path);
  assert.equal(await checker.isPathIgnored(absolute), false, `${path} is ignored by ESLint`);
  const active = await checker.calculateConfigForFile(absolute);
  assert.ok(active !== undefined, `${path} has no ESLint configuration`);
  const config = record(active);
  const rules = record(config['rules']);
  if (!path.endsWith('.d.ts')) {
    assert.deepEqual(rules['complexity'], [2, 5], `${path} weakens complexity`);
  }
  if (/\.[cm]?ts$/.test(path) && !path.endsWith('.d.ts')) {
    assert.deepEqual(rules['sonarjs/cognitive-complexity'], [2, 10]);
  }
  if (path.startsWith('examples/nextjs-notes-app/src/')) {
    requireNextRules(config, path);
  }
}

function requireNextRules(config: Record<string, unknown>, path: string): void {
  const rules = record(config['rules']);
  for (const [rule, severity] of Object.entries(nextRules)) {
    assert.equal(array(rules[rule])[0], severity === 'error' ? 2 : 1, `${path} weakens ${rule}`);
  }
}

function requireNoNestedConfigs(files: readonly string[]): void {
  const names = [
    '.eslintrc',
    '.eslintignore',
    'eslint.config.',
    '.prettierrc',
    'prettier.config.',
    '.prettierignore',
    '.editorconfig',
    '.babelrc',
    'babel.config.',
    'knip.',
    'stryker.config.',
    '.nycrc',
    '.c8rc',
    'jest.',
    'tsconfig.',
  ];
  assert.deepEqual(
    files.filter(
      (path) =>
        path.includes('/') &&
        names.some((name) => path.split('/').at(-1)?.startsWith(name) === true),
    ),
    [],
  );
}

async function requireRootFormatting(path: string): Promise<void> {
  const absolute = isAbsolute(path) ? path : join(root, path);
  const activeConfig = await prettier.resolveConfigFile(absolute);
  assert.equal(activeConfig, join(root, 'prettier.config.cjs'), `${path} overrides Prettier`);
  const file = await prettier.getFileInfo(absolute, { ignorePath: join(root, '.prettierignore') });
  assert.equal(file.ignored, false, `${path} is ignored by Prettier`);
  assert.ok(file.inferredParser !== null, `${path} has no Prettier parser`);
}

async function requireNoManifestOverrides(files: readonly string[]): Promise<void> {
  const qualityKeys = ['prettier', 'eslintConfig', 'jest', 'nyc', 'c8'];
  for (const path of files.filter((item) => item.includes('/') && item.endsWith('/package.json'))) {
    const absolute = isAbsolute(path) ? path : join(root, path);
    const manifest = record(JSON.parse(await readFile(absolute, 'utf8')));
    for (const key of qualityKeys) {
      assert.equal(manifest[key], undefined, `${path} overrides ${key}`);
    }
  }
}

await test('tracked SDK code remains in native lint, type, test, and coverage gates', async () => {
  const files = trackedFiles();
  const runtime = handwrittenSource(files);
  const tests = files.filter((path) => path.startsWith('__tests__/') && path.endsWith('.ts'));
  assert.ok(runtime.length > 0);
  assert.ok(tests.some((path) => path.endsWith('.test.ts')));
  const typechecked = new Set([
    ...typecheckedFiles('tsconfig.json'),
    ...typecheckedFiles('tsconfig.tooling.json'),
  ]);
  for (const path of [
    ...runtime,
    ...tests,
    ...files.filter((item) => item.startsWith('test/') && item.endsWith('.ts')),
    ...files.filter((item) => item.startsWith('scripts/') && /\.[cm]ts$/.test(item)),
  ]) {
    assert.ok(typechecked.has(join(root, path)), `${path} is outside the TypeScript project`);
  }
  requireFullCoverage(coverageConfig);
  assert.equal(
    record(manifest['scripts'])['format:check'],
    'prettier . --config prettier.config.cjs --check',
  );
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
    files.filter((path) => untypedHandwrittenFile(path)),
    [],
  );
  requireNoNestedConfigs(files);
  await requireNoManifestOverrides(files);
});

await test('lowered coverage and suppression comments fail policy validation', () => {
  assert.throws(() => {
    requireFullCoverage({ ...coverageConfig, coverageThreshold: { global: { branches: 99 } } });
  });
  assert.throws(() => {
    requireUnsuppressed('src/new.ts', '// eslint-disable-next-line complexity');
  });
  assert.throws(() => {
    requireUnsuppressed('src/new.ts', 'const marker = true; // @ts-expect-error\nmarker;');
  });
  assert.doesNotThrow(() => {
    requireUnsuppressed(
      'test/types/invalid.ts',
      '// @ts-expect-error invalid public call\ninvalid();',
    );
  });
  assert.throws(() => {
    requireUnsuppressed('test/types/invalid.ts', '// @ts-ignore\ninvalid();');
  });
  assert.throws(() => {
    requireUnsuppressed('test/types/invalid.ts', '// @ts-expect-error\ninvalid();');
  });
  assert.throws(() => {
    requireNoNestedConfigs(['examples/nextjs-notes-app/.eslintrc.json']);
  });
  assert.throws(() => {
    requireNoNestedConfigs(['examples/nextjs-notes-app/.babelrc']);
  });
});

await test('a nested manifest cannot replace the root formatter configuration', async () => {
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

await test('excluded new code and weakened complexity fail policy validation', async () => {
  await assert.rejects(
    requireLinted(
      {
        isPathIgnored: () => Promise.resolve(true),
        calculateConfigForFile: () => Promise.resolve({}),
      },
      'src/new-module.ts',
    ),
    /ignored by ESLint/,
  );
  await assert.rejects(
    requireLinted(
      {
        isPathIgnored: () => Promise.resolve(false),
        calculateConfigForFile: () => Promise.resolve({ rules: { complexity: [2, 6] } }),
      },
      'src/new-module.ts',
    ),
    /weakens complexity/,
  );
});

await test('mutation, coverage, and formatting suppression comments fail policy validation', () => {
  for (const comment of [
    '// Stryker disable all',
    '// Stryker disable next-line EqualityOperator',
    '/* v8 ignore next */',
    '// prettier-ignore',
  ]) {
    assert.throws(() => {
      requireUnsuppressed('src/new.ts', comment);
    });
  }
});

async function lintFixture(source: string, parent: string): Promise<Record<string, unknown>[]> {
  const directory = await mkdtemp(join(root, parent, 'quality-fixture-'));
  try {
    const filename = parent === 'scripts' ? 'fixture.test.mts' : 'fixture.ts';
    const path = join(directory, parent === '__tests__' ? 'fixture.test.ts' : filename);
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
    return array(JSON.parse(result.stdout)).map((value) => record(value));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
const violations: [string, string, string][] = [
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

const contexts: [string, string][] = [
  ['src', ''],
  [
    'scripts',
    "import assert from 'node:assert/strict';\nimport test from 'node:test';\nawait test('works', () => { assert.equal(1, 1); });\n",
  ],
  [
    '__tests__',
    "import { expect, test } from '@jest/globals';\ntest('works', () => { expect(true).toBe(true); });\n",
  ],
];

for (const [parent, setup] of contexts) {
  await test(`typed lint accepts safe code in ${parent}`, async () => {
    const results = await lintFixture(`${setup}export const enabled = true;`, parent);
    assert.deepEqual(
      results.flatMap((result) => array(result['messages'])),
      [],
    );
  });

  for (const [name, source, rule] of violations) {
    await test(`typed lint rejects ${name} in ${parent}`, async () => {
      const results = await lintFixture(`${setup}${source}`, parent);
      const rules = results.flatMap((result) =>
        array(result['messages']).map((message) => record(message)['ruleId']),
      );
      assert.ok(rules.includes(rule), `Missing ${rule}: ${JSON.stringify(results)}`);
    });
  }
}

for (const source of [
  "import test from 'node:test'; await test.skip('skipped', () => {});",
  "import test from 'node:test'; await test.only('focused', () => {});",
  "import test from 'node:test'; await test('focused', { only: true }, () => {});",
  "import test from 'node:test'; await test('skipped', { skip: true }, () => {});",
  "import test from 'node:test'; await test('pending', (context) => { context.todo(); });",
]) {
  await test(`tooling lint rejects incomplete native tests: ${source}`, async () => {
    const results = await lintFixture(source, 'scripts');
    const rules = results.flatMap((result) =>
      array(result['messages']).map((message) => record(message)['ruleId']),
    );
    assert.ok(rules.includes('no-restricted-syntax'));
  });
}

await test('tooling lint rejects an empty native suite file', async () => {
  const results = await lintFixture('export const unusedSuite = true;', 'scripts');
  const rules = results.flatMap((result) =>
    array(result['messages']).map((message) => record(message)['ruleId']),
  );
  assert.ok(rules.includes('sonarjs/no-empty-test-file'));
});
