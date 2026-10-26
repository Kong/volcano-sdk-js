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
  const matrix = /mutation-shard:\s*\[([\d,\s]+)\]/.exec(workflow);
  const environment = /MUTATION_SHARD_COUNT: '(\d+)'/.exec(workflow);
  assert.ok(matrix !== null);
  assert.ok(environment !== null);
  assert.equal(Number(environment[1]), mutationShardCount);
  assert.match(workflow, /name: SDK Node 22 mutation shard/);
  assert.equal(readFileSync('.node-version', 'utf8').trim(), '22.23.3');
  assert.match(workflow, /node-version-file: '\.node-version'/);
  assert.doesNotMatch(workflow, /node-version: '/);
  assert.equal(scripts['quality'], 'pnpm quality:policy && pnpm quality:checks && pnpm mutation:full');
  assert.match(workflow, /run: pnpm quality:policy && pnpm quality:checks\n/);
  assert.match(workflow, /run: pnpm mutation:full\n/);
  assert.match(
    workflow,
    /MUTATION_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \|\| github\.event\.merge_group\.base_sha \}\}\n/,
  );
  assert.match(workflow, /needs: \[checks, mutation\]\n/);
  assert.doesNotMatch(workflow, /node-version: \['20', '22'\]/);
  assert.deepEqual(
    [...stringValue(matrix[1]).matchAll(/\d+/g)].map((match) => Number(match[0])),
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
  assert.throws(() => selectMutationPatterns(undefined, git, { index: 3, count: 4 }), /selected no source/);
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
    assert.throws(() => shardMutationPatterns(patterns, 4, 4), /Invalid mutation shard/);
    assert.throws(() => shardMutationPatterns([firstPath], 3, 4), /selected no source/);
    assert.deepEqual(changedShardPatterns([firstPath], 0, 4), [firstPath]);
    assert.deepEqual(changedShardPatterns([firstPath], 3, 4), []);
    assert.deepEqual(changedShardPatterns([], 0, 4), []);
    assert.deepEqual(changedShardPatterns(patterns, 1, 4), shardMutationPatterns(patterns, 1, 4));
    assert.throws(() => changedShardPatterns(patterns, 4, 4), /Invalid mutation shard/);
  } finally {
    for (const path of paths) {
      unlinkSync(path);
    }
  }
});

await test('large class shards keep each method intact and every selected line unique', () => {
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
    const owner = new Map<number, number>();
    for (let shard = 0; shard < 3; shard += 1) {
      for (const pattern of shardMutationPatterns([path, `${path}:200-220`], shard, 3)) {
        const match = /:(\d+)-(\d+)$/.exec(pattern);
        assert.ok(match !== null);
        const first = Number(match[1]);
        const last = Number(match[2]);
        if (last < lineCount) {
          assert.match(stringValue(source.split('\n')[last - 1]), /^ {2}\}$/);
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

await test('dense modules shorter than 200 lines split only between complete functions', () => {
  const path = `src/mutation-functions-fixture-${String(process.pid)}.ts`;
  const source = `${Array.from(
    { length: 12 },
    (_, index) =>
      `export function f${String(index)}() {\n${Array.from({ length: 12 }, (_, line) => `  const v${String(line)} = ${String(line)};`).join('\n')}\n  return v0;\n}`,
  ).join('\n')}\n`;
  writeFileSync(path, source);
  try {
    const lines = source.trimEnd().split('\n');
    const owners = new Map<number, number>();
    for (let shard = 0; shard < 3; shard += 1) {
      for (const pattern of shardMutationPatterns([path], shard, 3)) {
        const match = /:(\d+)-(\d+)$/.exec(pattern);
        assert.ok(match !== null);
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
