import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { requireLinted } from './oxlint-report.mts';
import { requireUnsuppressed } from './suppression-policy.mts';
// oxlint-disable-next-line import/max-dependencies -- This test checks every tracked file against each native tool.
import { array, record, stringValue } from './values.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const jest = join(root, 'node_modules/jest/bin/jest.js');
const oxfmt = join(root, 'node_modules/oxfmt/bin/oxfmt');
const require = createRequire(import.meta.url);
const coverageConfig = record(require('../jest.typed.config.cjs'));
const manifest = record(require('../package.json'));
const nextExample = 'examples/nextjs-notes-app';
const durableExample = 'examples/durable-order-pipeline';
// Each example's own compiler project: Next.js reads only the app's tsconfig.json, and the durable functions'
// directories deploy as they are.
const exampleProjects = new Set([`${nextExample}/tsconfig.json`, `${durableExample}/jsconfig.json`]);
function trackedFiles(): string[] {
  return execFileSync('/usr/bin/git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
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

function handwrittenTests(files: readonly string[]): string[] {
  return files.filter((path) => path.startsWith('__tests__/') && path.endsWith('.ts'));
}

// Every tracked file one of the compiler projects must check.
function typedFiles(files: readonly string[]): string[] {
  return [
    ...handwrittenSource(files),
    ...handwrittenTests(files),
    ...files.filter((path) => path.startsWith('test/') && path.endsWith('.ts')),
    ...files.filter((path) => path.startsWith('scripts/') && /\.[cm]ts$/u.test(path)),
    ...files.filter((path) => path.startsWith(`${nextExample}/`) && /\.tsx?$/u.test(path)),
    ...files.filter((path) => path.startsWith(`${durableExample}/volcano/functions/`) && path.endsWith('.js')),
  ];
}

function maintainedCode(files: readonly string[]): string[] {
  return files.filter(
    (path) =>
      /\.(?:[cm]?[jt]s|[jt]sx)$/u.test(path) &&
      !path.startsWith('src/generated/') &&
      !path.startsWith('src/generated-runtime/'),
  );
}

function untypedHandwrittenFile(path: string): boolean {
  if (!/\.[cm]?js$/u.test(path) || path.startsWith('src/generated-runtime/')) {
    return false;
  }
  const nativeLoaders = ['__tests__/node-environment.cjs', '__tests__/browser-environment.cjs'];
  if (nativeLoaders.includes(path)) {
    return false;
  }
  return ['src/', 'scripts/', '__tests__/', `${nextExample}/src/`].some((prefix) => path.startsWith(prefix));
}

function typecheckedFiles(configPath: string, relaxed: readonly string[] = []): Set<string> {
  const path = join(root, configPath);
  const config = ts.readConfigFile(path, (filename) => ts.sys.readFile(filename));
  assert.equal(config.error, undefined, `${configPath} is invalid`);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(path), undefined, path);
  assert.deepEqual(parsed.errors, [], `${configPath} has configuration errors`);
  requireCompilerOptions(parsed.options, relaxed);
  return new Set(parsed.fileNames);
}

function requireCompilerOptions(options: ts.CompilerOptions, relaxed: readonly string[] = []): void {
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
  for (const [name, value] of Object.entries(required).filter(([option]) => !relaxed.includes(option))) {
    assert.equal(options[name], value, `${name} weakens TypeScript checking`);
  }
}

function discoveredTests(configPath: string): string[] {
  return array(
    JSON.parse(
      execFileSync(process.execPath, [jest, '--listTests', '--json', '--runInBand', '--config', configPath], {
        cwd: root,
        encoding: 'utf8',
      }),
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
  assert.deepEqual(record(config)['collectCoverageFrom'], ['src/**/*.ts', '!src/**/*.d.ts', '!src/generated/**']);
}

function requireNoNestedConfigs(files: readonly string[]): void {
  const names = [
    '.eslintrc',
    '.eslintignore',
    'eslint.config.',
    '.oxlintrc',
    'oxlint.config.',
    '.oxfmtrc',
    'oxfmt.config.',
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
    'jsconfig.',
  ];
  assert.deepEqual(
    files.filter(
      (path) =>
        path.includes('/') &&
        !exampleProjects.has(path) &&
        names.some((name) => path.split('/').at(-1)?.startsWith(name) === true),
    ),
    [],
  );
}

function requireRootFormatting(path: string): void {
  const absolute = isAbsolute(path) ? path : join(root, path);
  // oxfmt exits 2 when ignore rules or a missing parser leave it nothing to check.
  const result = spawnSync(process.execPath, [oxfmt, '--check', absolute], { cwd: root, encoding: 'utf8' });
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 2, `${path} is ignored by oxfmt`);
}

async function requireNoManifestOverrides(files: readonly string[]): Promise<void> {
  const qualityKeys = ['eslintConfig', 'jest', 'nyc', 'c8'];
  const nestedManifests = files.filter((item) => item.includes('/') && item.endsWith('/package.json'));
  await Promise.all(
    nestedManifests.map(async (path) => {
      const absolute = isAbsolute(path) ? path : join(root, path);
      const nested = record(JSON.parse(await readFile(absolute, 'utf8')));
      for (const key of qualityKeys) {
        assert.equal(nested[key], undefined, `${path} overrides ${key}`);
      }
    }),
  );
}

await test('tracked SDK code remains in native lint, format, type, test, and coverage gates', async () => {
  const files = trackedFiles();
  assert.ok(handwrittenSource(files).length > 0);
  assert.ok(handwrittenTests(files).some((path) => path.endsWith('.test.ts')));
  const typechecked = new Set([
    ...typecheckedFiles('tsconfig.json'),
    ...typecheckedFiles('tsconfig.tooling.json'),
    // Next.js generates route declarations under both .next/types and .next/dev/types; after `next dev`
    // they declare the same globals, and checking them fails the build.
    ...typecheckedFiles(`${nextExample}/tsconfig.json`, ['skipLibCheck']),
    // JavaScript cannot omit an optional SDK option it holds as possibly undefined without a conditional spread.
    ...typecheckedFiles(`${durableExample}/jsconfig.json`, ['exactOptionalPropertyTypes']),
  ]);
  for (const path of typedFiles(files)) {
    assert.ok(typechecked.has(join(root, path)), `${path} is outside the TypeScript project`);
  }
  requireFullCoverage(coverageConfig);
  assert.equal(record(manifest['scripts'])['format:check'], 'oxfmt --check');
  const discovered = new Set(['jest.config.js', 'jest.typed.config.cjs'].flatMap((config) => discoveredTests(config)));
  for (const path of files.filter((item) => /^__tests__\/.*\.(?:test|spec)\.(?:[cm]?[jt]s|[jt]sx)$/u.test(item))) {
    assert.ok(discovered.has(join(root, path)), `${path} is not discovered by Jest`);
  }
  await Promise.all(
    maintainedCode(files).map(async (path) => {
      requireLinted(path);
      requireRootFormatting(path);
      requireUnsuppressed(path, await readFile(join(root, path), 'utf8'));
    }),
  );
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
    requireUnsuppressed('src/new.ts', '// oxlint-disable-next-line max-lines');
  });
  assert.throws(() => {
    requireUnsuppressed('src/index.ts', '// oxlint-disable-next-line eslint/no-redeclare');
  });
  assert.throws(() => {
    requireUnsuppressed('src/new.ts', 'const marker = true; // @ts-expect-error\nmarker;');
  });
  assert.doesNotThrow(() => {
    requireUnsuppressed('test/types/invalid.ts', '// @ts-expect-error invalid public call\ninvalid();');
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
    requireNoNestedConfigs(['examples/nextjs-notes-app/.oxlintrc.json']);
  });
  assert.throws(() => {
    requireNoNestedConfigs(['examples/nextjs-notes-app/.babelrc']);
  });
});

await test('nested formatter configuration and ignored paths fail policy validation', async () => {
  assert.throws(() => {
    requireNoNestedConfigs(['examples/nextjs-notes-app/.oxfmtrc.json']);
  });
  await mkdir(join(root, 'openapi'), { recursive: true });
  const directory = await mkdtemp(join(root, 'openapi', 'quality-fixture-'));
  try {
    const source = join(directory, 'fixture.ts');
    await writeFile(source, 'export const value = true;\n');
    assert.throws(() => {
      requireRootFormatting(source);
    }, /ignored by oxfmt/u);
    await writeFile(join(directory, 'package.json'), JSON.stringify({ jest: { testMatch: [] } }));
    await assert.rejects(requireNoManifestOverrides([join(directory, 'package.json')]), /overrides jest/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

await test('mutation, coverage, and formatting suppression comments fail policy validation', () => {
  for (const comment of [
    '// Stryker disable all',
    '// Stryker disable next-line EqualityOperator',
    '/* v8 ignore next */',
    '// prettier-ignore',
    '// oxfmt-ignore',
  ]) {
    assert.throws(() => {
      requireUnsuppressed('src/new.ts', comment);
    });
  }
});
