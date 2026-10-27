import assert from 'node:assert/strict';
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  changedShardPatterns,
  mutationPatterns,
  mutationShardCount,
  selectMutationPatterns,
  shardMutationPatterns,
} from './mutation-scope.mts';
import { record, stringValue } from './values.mts';

await test('CI runs the quality gate as one check job and every required mutation shard', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const scripts = record(record(JSON.parse(readFileSync('package.json', 'utf8')))['scripts']);
  const matrix = /mutation-shard:\s*\[([\d,\s]+)\]/u.exec(workflow);
  const environment = /MUTATION_SHARD_COUNT: '(\d+)'/u.exec(workflow);
  assert.ok(matrix !== null);
  assert.ok(environment !== null);
  assert.equal(Number(environment[1]), mutationShardCount);
  assert.match(workflow, /name: SDK Node 22 mutation shard/u);
  assert.equal(readFileSync('.node-version', 'utf8').trim(), '22.23.3');
  assert.match(workflow, /node-version-file: '\.node-version'/u);
  assert.doesNotMatch(workflow, /node-version: '/u);
  assert.equal(scripts['quality'], 'pnpm quality:policy && pnpm quality:checks && pnpm mutation:full');
  assert.match(workflow, /run: pnpm quality:policy && pnpm quality:checks\n/u);
  assert.match(workflow, /run: pnpm mutation:full\n/u);
  assert.match(
    workflow,
    /MUTATION_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.merge_group\.base_sha \}\}\n/u,
  );
  assert.match(workflow, /needs: \[checks, mutation\]\n/u);
  assert.doesNotMatch(workflow, /node-version: \['20', '22'\]/u);
  assert.deepEqual(
    [...stringValue(matrix[1]).matchAll(/\d+/gu)].map((match) => Number(match[0])),
    Array.from({ length: mutationShardCount }, (_, index) => index),
  );
});

await test('Stryker targets every handwritten runtime file', () => {
  const config = record(JSON.parse(readFileSync('stryker.config.json', 'utf8')));
  assert.deepEqual(config['mutate'], [
    'src/**/*.{js,ts}',
    '!src/**/*.d.ts',
    '!src/generated/**',
    '!src/generated-runtime/**',
  ]);
});

await test('selects all handwritten runtime files and rejects generated or declaration files', () => {
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

await test('a new handwritten runtime file cannot fall outside the full mutation scope', () => {
  const path = `src/mutation-scope-fixture-${String(process.pid)}.ts`;
  writeFileSync(path, 'export const newSource = true;\n');
  try {
    assert.ok(mutationPatterns([path]).includes(path));
  } finally {
    unlinkSync(path);
  }
});

function fakeGit(outputs: Readonly<Record<string, string>>): (...args: string[]) => string {
  return (...args) => outputs[args.join(' ')] ?? assert.fail(`unexpected git ${args.join(' ')}`);
}

await test('a base commit limits mutation to changed and untracked runtime files', () => {
  const git = fakeGit({
    'ls-files --cached -- src': 'src/auth-validation.ts\nsrc/lock-clock.ts\nsrc/generated/client.ts\n',
    'diff --name-only base-sha -- src': 'src/lock-clock.ts\nsrc/removed-runtime.ts\nsrc/durable-runtime-peer.d.ts\n',
    'ls-files --others --exclude-standard -- src': 'src/json-clone.ts\n',
  });
  assert.deepEqual(selectMutationPatterns(undefined, git), [
    'src/auth-validation.ts',
    'src/json-clone.ts',
    'src/lock-clock.ts',
  ]);
  assert.deepEqual(selectMutationPatterns('base-sha', git), ['src/json-clone.ts', 'src/lock-clock.ts']);
  const shards = Array.from({ length: 4 }, (_, index) => selectMutationPatterns('base-sha', git, { index, count: 4 }));
  assert.deepEqual(
    shards.flat().toSorted((left, right) => left.localeCompare(right)),
    ['src/json-clone.ts', 'src/lock-clock.ts'],
  );
  assert.deepEqual(shards.slice(2), [[], []]);
});

await test('only the complete scope rejects an empty shard', () => {
  const git = fakeGit({
    'ls-files --cached -- src': 'src/lock-clock.ts\n',
    'diff --name-only base-sha -- src': '',
    'ls-files --others --exclude-standard -- src': '',
  });
  assert.throws(() => selectMutationPatterns(undefined, git, { index: 3, count: 4 }), /selected no source/u);
  assert.deepEqual(selectMutationPatterns('base-sha', git), []);
  assert.deepEqual(selectMutationPatterns('base-sha', git, { index: 0, count: 4 }), []);
});

function assertShardOwnership(patterns: readonly string[], expectedFiles: number): void {
  const owner = new Map<string, number>();
  const seen: string[] = [];
  for (let shard = 0; shard < 4; shard += 1) {
    for (const pattern of shardMutationPatterns(patterns, shard, 4)) {
      const path = stringValue(pattern.split(':')[0]);
      assert.ok(!owner.has(path) || owner.get(path) === shard);
      owner.set(path, shard);
      seen.push(pattern);
    }
  }
  assert.deepEqual(
    seen.toSorted((left, right) => left.localeCompare(right)),
    patterns.toSorted((left, right) => left.localeCompare(right)),
  );
  assert.equal(owner.size, expectedFiles);
}

await test('mutation shards keep every file and its overlapping ranges together', () => {
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
    const firstPath = stringValue(paths[0]);
    const patterns = [firstPath, `${firstPath}:15-19`, ...paths.slice(1)];
    assertShardOwnership(patterns, paths.length);
    assert.throws(() => shardMutationPatterns(patterns, 4, 4), /Invalid mutation shard/u);
    assert.throws(() => shardMutationPatterns([firstPath], 3, 4), /selected no source/u);
    assert.deepEqual(changedShardPatterns([firstPath], 0, 4), [firstPath]);
    assert.deepEqual(changedShardPatterns([firstPath], 3, 4), []);
    assert.deepEqual(changedShardPatterns([], 0, 4), []);
    assert.deepEqual(changedShardPatterns(patterns, 1, 4), shardMutationPatterns(patterns, 1, 4));
    assert.throws(() => changedShardPatterns(patterns, 4, 4), /Invalid mutation shard/u);
  } finally {
    for (const path of paths) {
      unlinkSync(path);
    }
  }
});

function indexes(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

interface ShardRange {
  shard: number;
  first: number;
  last: number;
}

// The line ranges each of `count` shards selects from `patterns`.
function shardRanges(patterns: readonly string[], count: number): ShardRange[] {
  return indexes(count).flatMap((shard) =>
    shardMutationPatterns(patterns, shard, count).map((pattern) => {
      const match = /:(\d+)-(\d+)$/u.exec(pattern);
      assert.ok(match !== null);
      return { shard, first: Number(match[1]), last: Number(match[2]) };
    }),
  );
}

// Maps each selected line to its shard and fails when two ranges share a line.
function lineOwners(ranges: readonly ShardRange[]): Map<number, number> {
  const owners = new Map<number, number>();
  for (const { shard, first, last } of ranges) {
    for (let line = first; line <= last; line += 1) {
      assert.equal(owners.has(line), false);
      owners.set(line, shard);
    }
  }
  return owners;
}

function fixtureMethod(index: number): string[] {
  const body = indexes(40).map((line) => `    const value${String(line)} = ${String(line)};`);
  return [`  method${String(index)}() {`, ...body, `    return ${String(index)};`, '  }'];
}

await test('large class shards keep each method intact and every selected line unique', () => {
  const path = `src/mutation-class-fixture-${String(process.pid)}.ts`;
  const members = indexes(12).flatMap((index) => fixtureMethod(index));
  const source = ['export class Fixture {', ...members, '}', ''].join('\n');
  writeFileSync(path, source);
  try {
    const lineCount = source.trimEnd().split('\n').length;
    const ranges = shardRanges([path, `${path}:200-220`], 3);
    assert.equal(lineOwners(ranges).size, lineCount);
    // Each range ends on a method's closing brace, or the class's at the end of the file.
    const lines = source.split('\n');
    assert.deepEqual(new Set(ranges.map(({ last }) => lines[last - 1])), new Set(['  }', '}']));
  } finally {
    unlinkSync(path);
  }
});

await test('dense modules shorter than 200 lines split only between complete functions', () => {
  const path = `src/mutation-functions-fixture-${String(process.pid)}.ts`;
  const source = `${indexes(12)
    .map(
      (index) =>
        `export function f${String(index)}() {\n${indexes(12)
          .map((line) => `  const v${String(line)} = ${String(line)};`)
          .join('\n')}\n  return v0;\n}`,
    )
    .join('\n')}\n`;
  writeFileSync(path, source);
  try {
    const lines = source.trimEnd().split('\n');
    const ranges = shardRanges([path], 3);
    const owners = lineOwners(ranges);
    assert.equal(owners.size, lines.length);
    assert.equal(new Set(owners.values()).size, 3);
    assert.deepEqual(new Set(ranges.map(({ last }) => lines[last - 1])), new Set(['}']));
  } finally {
    unlinkSync(path);
  }
});
