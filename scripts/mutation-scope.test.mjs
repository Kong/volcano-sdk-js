import assert from 'node:assert/strict';
import { unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  changedRuntimePatterns,
  criticalRuntime,
  mutationPatterns,
  shardMutationPatterns,
} from './mutation-scope.mjs';

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

test('excludes the declaration-only public type module from runtime mutation shards', () => {
  const diff = '+++ b/src/sdk-public-types.ts\n@@ -1,0 +1,1 @@';
  assert.deepEqual(changedRuntimePatterns(diff), []);
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

test('mutation shards keep every file and its overlapping ranges together', () => {
  const paths = Array.from(
    { length: 4 },
    (_, index) => `src/mutation-shard-fixture-${String(process.pid)}-${String(index)}.ts`,
  );
  for (const [index, path] of paths.entries()) {
    writeFileSync(
      path,
      `${Array.from({ length: 20 + index * 10 }, (_, line) => `export const v${String(line)} = ${String(line)};`).join('\n')}\n`,
    );
  }
  try {
    const patterns = [paths[0], `${paths[0]}:15-19`, ...paths.slice(1)];
    const owner = new Map();
    const seen = [];
    for (let shard = 0; shard < 4; shard += 1) {
      for (const pattern of shardMutationPatterns(patterns, shard, 4)) {
        const path = pattern.split(':')[0];
        assert.ok(!owner.has(path) || owner.get(path) === shard);
        owner.set(path, shard);
        seen.push(pattern);
      }
    }
    assert.deepEqual(seen.sort(), patterns.sort());
    assert.equal(owner.size, paths.length);
    assert.throws(() => shardMutationPatterns(patterns, 4, 4), /Invalid mutation shard/);
    assert.throws(() => shardMutationPatterns([paths[0]], 3, 4), /selected no source/);
  } finally {
    for (const path of paths) {
      unlinkSync(path);
    }
  }
});
