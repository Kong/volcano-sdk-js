import assert from 'node:assert/strict';
import test from 'node:test';
import { ESLint } from 'eslint';

const eslint = new ESLint();
const violations = [
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
  ['src/next/request.ts', ''],
  [
    '__tests__/next-request.test.ts',
    "import { expect, test } from '@jest/globals';\ntest('works', () => { expect(true).toBe(true); });\n",
  ],
];

for (const [filePath, setup] of contexts) {
  test(`typed lint accepts safe code in ${filePath}`, async () => {
    const results = await eslint.lintText(`${setup}export const enabled = true;`, { filePath });
    assert.deepEqual(
      results.flatMap((result) => result.messages),
      [],
    );
  });

  for (const [name, source, rule] of violations) {
    test(`typed lint rejects ${name} in ${filePath}`, async () => {
      const results = await eslint.lintText(`${setup}${source}`, { filePath });
      const rules = results.flatMap((result) => result.messages.map((message) => message.ruleId));
      assert.ok(rules.includes(rule), `Missing ${rule}: ${JSON.stringify(results)}`);
    });
  }
}
