import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { ESLint } from 'eslint';

const rule = '@typescript-eslint/no-unnecessary-type-parameters';
const expected = [
  'src/sdk-public-types.ts:Functions.invoke<TPayload>',
  'src/sdk-public-types.ts:Durable.start<TInput>',
];
const boundaryRules = [
  '@typescript-eslint/consistent-type-assertions',
  '@typescript-eslint/no-unsafe-type-assertion',
];

test('legacy public generic exceptions are exact and remain in use', async () => {
  const exceptions = JSON.parse(await readFile('quality-exceptions.json', 'utf8'));
  assert.deepEqual(
    exceptions.filter((item) => item.rule === rule).map((item) => item.scope),
    expected,
  );
  for (const item of exceptions) {
    assert.ok(item.rationale.length > 30);
    assert.ok(item.evidence.length > 30);
  }

  const eslint = new ESLint();
  const results = await eslint.lintFiles(['src/sdk-public-types.ts']);
  const found = await verifiedScopes(results);
  assert.deepEqual(found.sort(), expected.toSorted());
});

test('Orval boundary exceptions apply only to its generic response expression', async () => {
  const exceptions = JSON.parse(await readFile('quality-exceptions.json', 'utf8'));
  assert.deepEqual(
    exceptions.filter((item) => item.rule !== rule).map(({ rule, scope }) => ({ rule, scope })),
    boundaryRules.map((rule) => ({ rule, scope: 'src/volcano-fetch.ts:volcanoFetch:return' })),
  );
  const results = await new ESLint().lintFiles(['src/volcano-fetch.ts']);
  assert.equal(results.length, 1);
  const [result] = results;
  assert.deepEqual(result.messages, []);
  assert.deepEqual(
    result.suppressedMessages.map((message) => message.ruleId).sort(),
    boundaryRules.toSorted(),
  );
  const source = await readFile(result.filePath, 'utf8');
  const lines = source.split('\n');
  for (const diagnostic of result.suppressedMessages) {
    assert.equal(
      lines[diagnostic.line - 1].trim(),
      'return { data, status: response.status, headers: response.headers } as T;',
    );
  }
});

async function verifiedScopes(results) {
  const found = [];
  for (const result of results) {
    assert.deepEqual(result.messages, []);
    const source = await readFile(result.filePath, 'utf8');
    const lines = source.split('\n');
    for (const message of result.suppressedMessages) {
      assert.equal(message.ruleId, rule);
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
