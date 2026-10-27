import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint, requireLinted } from './oxlint-report.mts';
import { record } from './values.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = record(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')));

// oxlint's correctness, suspicious, pedantic, and perf categories, type-aware, with the plugins for the
// SDK's languages, test runner, and example frameworks. Each rule entry says why; no override changes.
const defaultConfig = {
  $schema: './node_modules/oxlint/configuration_schema.json',
  options: { typeAware: true },
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
    // typescript/require-await replaces it. The base rule also reports an async function that returns a promise
    // without awaiting it, which return-await requires, so it would force such functions to become synchronous
    // and throw their errors instead of rejecting with them.
    'eslint/require-await': 'off',
    // It requires deeply readonly types on every parameter, DOM and library types included;
    // no recommended or strict type-checked preset enables it.
    'typescript/prefer-readonly-parameter-types': 'off',
    // The ESLint configuration's options: a string, number, or nullable object is not a condition.
    'typescript/strict-boolean-expressions': [
      'error',
      { allowString: false, allowNumber: false, allowNullableObject: false },
    ],
    // Rules the ESLint configuration enforced, with its options, from the restriction and style categories,
    // which stay off as a whole.
    'eslint/complexity': ['error', 5],
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
    'typescript/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
    'typescript/explicit-module-boundary-types': 'error',
    'eslint/no-console': ['error', { allow: ['warn', 'error'] }],
    'eslint/no-var': 'error',
    'eslint/no-use-before-define': ['error', { functions: false, classes: false, variables: true }],
    'node/no-new-require': 'error',
    'node/no-path-concat': 'error',
    'unicorn/prefer-node-protocol': 'error',
    'eslint/curly': ['error', 'all'],
    'eslint/prefer-const': ['error', { destructuring: 'all' }],
    'eslint/prefer-template': 'error',
    'eslint/object-shorthand': ['error', 'always', { avoidExplicitReturnArrows: true }],
    'eslint/no-duplicate-imports': 'error',
    'typescript/dot-notation': 'error',
  },
  ignorePatterns: ['src/generated/**', 'src/generated-runtime/**'],
};

const contexts: [string, string][] = [
  ['src', 'fixture.ts'],
  ['scripts', 'fixture.test.mts'],
  ['__tests__', 'fixture.test.ts'],
  ['test/types', 'fixture.ts'],
  ['examples/nextjs-notes-app/src', 'fixture.tsx'],
];

const violations: [string, string, string][] = [
  ['a debugger statement', 'export function pause() {\n  debugger;\n}\n', 'eslint(no-debugger)'],
  ['loose equality', 'export function same(left, right) {\n  return left == right;\n}\n', 'eslint(eqeqeq)'],
  ['an async function without await', 'export async function value() {\n  return 1;\n}\n', 'typescript(require-await)'],
  [
    'a promise nobody handles',
    "export function start() {\n  Promise.reject(new Error('lost'));\n}\n",
    'typescript(no-floating-promises)',
  ],
  ['an explicit any', 'export const value: any = 1;\n', 'typescript(no-explicit-any)'],
  [
    'a function above complexity 5',
    'export function pick(a, b, c, d, e) {\n  return a || b || c || d || e ? 1 : 0;\n}\n',
    'eslint(complexity)',
  ],
  [
    'a native prototype extension',
    'export function extend() {\n  Array.prototype.extra = true;\n}\n',
    'eslint(no-extend-native)',
  ],
  [
    'a non-null assertion',
    'export function size(input: string | undefined): number {\n  return input!.length;\n}\n',
    'typescript(no-non-null-assertion)',
  ],
  [
    'a string as a condition',
    'export function present(input: string): boolean {\n  return input ? true : false;\n}\n',
    'typescript(strict-boolean-expressions)',
  ],
  [
    'a type assertion',
    'export function named(value: unknown): string {\n  return value as string;\n}\n',
    'typescript(consistent-type-assertions)',
  ],
  [
    'an exported function without a return type',
    'export function enabled() {\n  return true;\n}\n',
    'typescript(explicit-module-boundary-types)',
  ],
  [
    'a console.log call',
    'export function report(message: string): void {\n  console.log(message);\n}\n',
    'eslint(no-console)',
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
    'fixture.tsx',
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
  // Type-aware rules read the built declarations that test/types and the examples import.
  assert.equal(record(manifest['scripts'])['lint'], 'pnpm build && oxlint && pnpm format:check');
});

await test('generated code is outside lint scope and fails the coverage check', () => {
  assert.throws(() => {
    requireLinted(['src/generated/client.ts']);
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
