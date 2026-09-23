import assert from 'node:assert/strict';
import { unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { changedRuntimePatterns, criticalRuntime, mutationPatterns } from './mutation-scope.mjs';

test('selects changed handwritten runtime lines from a PR diff', () => {
  const diff = [
    'diff --git a/src/auth-validation.ts b/src/auth-validation.ts',
    '--- a/src/auth-validation.ts',
    '+++ b/src/auth-validation.ts',
    '@@ -1,2 +1,3 @@',
    '+new line',
    '@@ -8,1 +9,0 @@',
    'diff --git a/src/generated/client.ts b/src/generated/client.ts',
    '+++ b/src/generated/client.ts',
    '@@ -1,0 +1,1 @@',
    'diff --git a/src/index.d.ts b/src/index.d.ts',
    '+++ b/src/index.d.ts',
    '@@ -1,0 +1,1 @@',
    'diff --git a/src/deleted.ts b/src/deleted.ts',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
  ].join('\n');
  assert.deepEqual(changedRuntimePatterns(diff), [
    'src/auth-validation.ts:1-3',
    'src/auth-validation.ts:8-9',
  ]);
});

test('deletion-only changes at EOF still select surviving source', () => {
  const path = `src/mutation-deletion-fixture-${String(process.pid)}.ts`;
  writeFileSync(path, 'export const one = 1;\nexport const two = 2;\n');
  try {
    const diff = `+++ b/${path}\n@@ -3,1 +3,0 @@`;
    assert.deepEqual(changedRuntimePatterns(diff), [`${path}:1-2`]);
    writeFileSync(path, '');
    assert.throws(() => changedRuntimePatterns(diff), /empty handwritten runtime file/);
  } finally {
    unlinkSync(path);
  }
});

test('includes committed, working, and newly added runtime code alongside critical modules', () => {
  const committed = '+++ b/src/database-query.ts\n@@ -3,1 +3,2 @@';
  const working = '+++ b/src/response-body.ts\n@@ -9,1 +9,1 @@';
  const result = mutationPatterns(committed, working, [
    'src/lock-clock.ts',
    'src/generated/client.ts',
  ]);
  assert.deepEqual(result, [
    ...criticalRuntime,
    'src/database-query.ts:3-4',
    'src/response-body.ts:9-9',
    'src/lock-clock.ts',
  ]);
});

test('a new handwritten runtime file cannot fall outside the PR mutation scope', () => {
  const path = `src/mutation-scope-fixture-${String(process.pid)}.ts`;
  writeFileSync(path, 'export const newSource = true;\n');
  try {
    assert.ok(mutationPatterns('', '', [path]).includes(path));
  } finally {
    unlinkSync(path);
  }
});
