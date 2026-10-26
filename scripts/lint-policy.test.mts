import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint, requireLinted } from './oxlint-report.mts';
import { record } from './values.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = record(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')));

// oxlint's correctness, suspicious, pedantic, and perf categories with the plugins for the SDK's
// languages, test runner, and example frameworks. Only two rules are off; no override changes.
const defaultConfig = {
  $schema: './node_modules/oxlint/configuration_schema.json',
  plugins: [
    'typescript',
    'unicorn',
    'oxc',
    'import',
    'jest',
    'promise',
    'node',
    'react',
    'react-perf',
    'jsx-a11y',
    'nextjs',
  ],
  categories: { correctness: 'error', suspicious: 'error', pedantic: 'error', perf: 'error' },
  rules: {
    // A leading underscore is how JavaScript consumers recognise the SDK's `@internal` members, which the
    // published types strip; renaming them would make internals look public.
    'eslint/no-underscore-dangle': 'off',
    // The rule predates React 17's automatic JSX runtime, which Next.js uses, so it only demands unused imports.
    'react/react-in-jsx-scope': 'off',
  },
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
  [
    'a native prototype extension',
    'export function extend() {\n  Array.prototype.extra = true;\n}\n',
    'eslint(no-extend-native)',
  ],
  [
    'an await inside a loop',
    'export async function each(items, visit) {\n  for (const item of items) {\n    await visit(item);\n  }\n}\n',
    'eslint(no-await-in-loop)',
  ],
];

// Framework plugin rules, checked where that framework's code lives.
const frameworkViolations: [string, string, string, string, string][] = [
  [
    'a conditional Jest assertion',
    '__tests__',
    'fixture.test.ts',
    "test('branches', () => {\n  if (Date.now() > 0) {\n    expect(true).toBe(true);\n  }\n});\n",
    'jest(no-conditional-in-test)',
  ],
  [
    'a JSX list item without a key',
    'examples/nextjs-notes-app/src',
    'fixture.js',
    'export function List({ items }) {\n  return <ul>{items.map((item) => <li>{item}</li>)}</ul>;\n}\n',
    'react(jsx-key)',
  ],
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

await test('oxlint runs the correctness, suspicious, pedantic, and perf categories with framework plugins', async () => {
  assert.deepEqual(JSON.parse(await readFile(join(root, '.oxlintrc.json'), 'utf8')), defaultConfig);
  assert.equal(record(manifest['scripts'])['lint'], 'oxlint && pnpm format:check');
});

await test('generated code is outside lint scope and fails the coverage check', () => {
  assert.throws(() => {
    requireLinted('src/generated/client.ts');
  }, /ignored by oxlint/u);
});

// Each fixture is linted in its own temporary directory.
await Promise.all(
  contexts.map(([parent, filename]) =>
    test(`oxlint accepts clean code in ${parent}`, async () => {
      assert.deepEqual(await lintFixture(parent, filename, 'export const enabled = true;\n'), []);
    }),
  ),
);

await Promise.all(
  contexts.flatMap(([parent, filename]) =>
    violations.map(([name, source, code]) =>
      test(`oxlint rejects ${name} in ${parent}`, async () => {
        assert.ok((await lintFixture(parent, filename, source)).includes(code), `Missing ${code}`);
      }),
    ),
  ),
);

await Promise.all(
  frameworkViolations.map(([name, parent, filename, source, code]) =>
    test(`oxlint rejects ${name} in ${parent}`, async () => {
      assert.ok((await lintFixture(parent, filename, source)).includes(code), `Missing ${code}`);
    }),
  ),
);
