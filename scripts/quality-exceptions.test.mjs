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
  const found = await verifiedScopes(results);
  assert.deepEqual(found.sort(), expected.toSorted());
});

async function verifiedScopes(results) {
  const found = [];
  for (const result of results) {
    const source = await readFile(result.filePath, 'utf8');
    const lines = source.split('\n');
    for (const message of result.messages.filter((item) => item.ruleId === rule)) {
      const declaration = lines[message.line - 1]?.trim() ?? '';
      const scope = scopeForDiagnostic(declaration);
      assert.ok(scope, `Unexpected ${rule} at ${result.filePath}:${message.line}: ${declaration}`);
      found.push(scope);
    }
  }
  return found;
}

function scopeForDiagnostic(declaration) {
  if (declaration.startsWith('invoke<TPayload')) {
    return expected[0];
  }
  if (declaration.startsWith('start<TInput')) {
    return expected[1];
  }
  return null;
}
