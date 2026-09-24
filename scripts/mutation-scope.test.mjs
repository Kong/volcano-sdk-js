import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { mutationPatterns, mutationShardCount, shardMutationPatterns } from './mutation-scope.mjs';

test('CI starts every required mutation shard', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const matrix = /mutation-shard: \[([\d, ]+)\]/.exec(workflow);
  const environment = /MUTATION_SHARD_COUNT: '(\d+)'/.exec(workflow);
  assert.ok(matrix);
  assert.ok(environment);
  assert.equal(Number(environment[1]), mutationShardCount);
  assert.deepEqual(
    matrix[1].split(',').map((value) => Number(value.trim())),
    Array.from({ length: mutationShardCount }, (_, index) => index),
  );
});

test('the required quality command uses Stryker over every handwritten runtime file', () => {
  const config = JSON.parse(readFileSync('stryker.config.json', 'utf8'));
  const packageConfig = JSON.parse(readFileSync('package.json', 'utf8'));
  assert.deepEqual(config.mutate, [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/generated/**',
    '!src/generated-runtime/**',
  ]);
  assert.match(packageConfig.scripts.quality, /&& pnpm mutation:full$/);
  assert.equal(packageConfig.scripts['mutation:full'], 'node scripts/run-mutation.mjs');
});

test('selects all handwritten runtime files and rejects generated or declaration files', () => {
  assert.deepEqual(
    mutationPatterns([
      'src/lock-clock.ts',
      'src/auth-validation.ts',
      'src/generated/client.ts',
      'src/generated-runtime/client.js',
      'src/durable-runtime-peer.d.ts',
      'src/lock-clock.ts',
    ]),
    ['src/auth-validation.ts', 'src/lock-clock.ts'],
  );
});

test('a new handwritten runtime file cannot fall outside the full mutation scope', () => {
  const path = `src/mutation-scope-fixture-${String(process.pid)}.ts`;
  writeFileSync(path, 'export const newSource = true;\n');
  try {
    assert.ok(mutationPatterns([path]).includes(path));
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

test('large class shards keep each method intact and every selected line unique', () => {
  const path = `src/mutation-class-fixture-${String(process.pid)}.ts`;
  const members = Array.from({ length: 12 }, (_, index) => [
    `  method${String(index)}() {`,
    ...Array.from({ length: 40 }, (_, line) => `    const value${String(line)} = ${String(line)};`),
    `    return ${String(index)};`,
    '  }',
  ]).flat();
  const source = ['export class Fixture {', ...members, '}', ''].join('\n');
  writeFileSync(path, source);
  try {
    const lineCount = source.trimEnd().split('\n').length;
    const owner = new Map();
    for (let shard = 0; shard < 3; shard += 1) {
      for (const pattern of shardMutationPatterns([path, `${path}:200-220`], shard, 3)) {
        const match = /:(\d+)-(\d+)$/.exec(pattern);
        assert.ok(match);
        const first = Number(match[1]);
        const last = Number(match[2]);
        if (last < lineCount) {
          assert.match(source.split('\n')[last - 1], /^ {2}\}$/);
        }
        for (let line = first; line <= last; line += 1) {
          assert.equal(owner.has(line), false);
          owner.set(line, shard);
        }
      }
    }
    assert.equal(owner.size, lineCount);
  } finally {
    unlinkSync(path);
  }
});

test('dense modules shorter than 200 lines split only between complete functions', () => {
  const path = `src/mutation-functions-fixture-${String(process.pid)}.ts`;
  const source = `${Array.from(
    { length: 12 },
    (_, index) =>
      `export function f${String(index)}() {\n${Array.from({ length: 12 }, (_, line) => `  const v${String(line)} = ${String(line)};`).join('\n')}\n  return v0;\n}`,
  ).join('\n')}\n`;
  writeFileSync(path, source);
  try {
    const lines = source.trimEnd().split('\n');
    const owners = new Map();
    for (let shard = 0; shard < 3; shard += 1) {
      for (const pattern of shardMutationPatterns([path], shard, 3)) {
        const match = /:(\d+)-(\d+)$/.exec(pattern);
        assert.ok(match);
        const first = Number(match[1]);
        const last = Number(match[2]);
        if (last < lines.length) {
          assert.equal(lines[last - 1], '}');
        }
        for (let line = first; line <= last; line += 1) {
          assert.equal(owners.has(line), false);
          owners.set(line, shard);
        }
      }
    }
    assert.equal(owners.size, lines.length);
    assert.equal(new Set(owners.values()).size, 3);
  } finally {
    unlinkSync(path);
  }
});
