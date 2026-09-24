import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ESLint } from 'eslint';

const rule = '@typescript-eslint/no-unnecessary-type-parameters';
const expected = [
  'src/sdk-public-types.ts:Functions.invoke<TPayload>',
  'src/sdk-public-types.ts:Durable.start<TInput>',
];

test('legacy public generic exceptions are exact and remain in use', async () => {
  const exceptions = JSON.parse(await readFile('quality-exceptions.json', 'utf8'));
  assert.deepEqual(
    exceptions.map((item) => item.scope),
    expected,
  );
  for (const item of exceptions) {
    assert.equal(item.rule, rule);
    assert.ok(item.rationale.length > 30);
    assert.ok(item.evidence.length > 30);
  }

  const eslint = new ESLint({
    overrideConfig: {
      files: ['src/sdk-public-types.ts'],
      rules: { [rule]: 'error' },
    },
  });
  const results = await eslint.lintFiles(['src/sdk-public-types.ts']);
  const found = [];
  for (const result of results) {
    const path = 'src/sdk-public-types.ts';
    const source = await readFile(result.filePath, 'utf8');
    const lines = source.split('\n');
    for (const message of result.messages.filter((item) => item.ruleId === rule)) {
      const declaration = lines[message.line - 1]?.trim() ?? '';
      const scope = scopeForDiagnostic(path, declaration);
      assert.ok(scope, `Unexpected ${rule} at ${path}:${message.line}: ${declaration}`);
      found.push(scope);
    }
  }
  assert.deepEqual(found.sort(), expected.toSorted());
});

function scopeForDiagnostic(path, declaration) {
  if (path === 'src/sdk-public-types.ts' && declaration.startsWith('invoke<TPayload')) {
    return expected[0];
  }
  if (path === 'src/sdk-public-types.ts' && declaration.startsWith('start<TInput')) {
    return expected[1];
  }
  return null;
}
