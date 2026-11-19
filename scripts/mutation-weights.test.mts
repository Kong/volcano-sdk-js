import assert from 'node:assert/strict';
import { unlinkSync, writeFileSync } from 'node:fs';
import { test } from 'node:test';
import { changedShardPatterns, shardMutationPatterns } from './mutation-scope.mts';
import { declaresTypesOnly, itemWeight, unmeasuredLineCost } from './mutation-weights.mts';
import { stringValue } from './values.mts';

function indexes(length: number): number[] {
  return Array.from({ length }, (_, index) => index);
}

function constants(count: number): string {
  return `${indexes(count)
    .map((line) => `export const v${String(line)} = ${String(line)};`)
    .join('\n')}\n`;
}

function functions(count: number): string {
  const body = indexes(38)
    .map((line) => `  const v${String(line)} = ${String(line)};`)
    .join('\n');
  return `${indexes(count)
    .map((index) => `export function f${String(index)}() {\n${body}\n  return v0;\n}`)
    .join('\n')}\n`;
}

function fixture(name: string): string {
  return `src/mutation-${name}-fixture-${String(process.pid)}.ts`;
}

function withFixtures(sources: Readonly<Record<string, string>>, run: (paths: string[]) => void): void {
  const paths = Object.keys(sources).map((name) => fixture(name));
  for (const [name, source] of Object.entries(sources)) {
    writeFileSync(fixture(name), source);
  }
  try {
    run(paths);
  } finally {
    for (const path of paths) {
      unlinkSync(path);
    }
  }
}

await test('a file of type declarations is recognized as having no runtime code', () => {
  assert.equal(
    declaresTypesOnly(
      'types.ts',
      [
        "import type { Readable } from 'node:stream';",
        'export interface Shape { size: number }',
        'export type Alias = Readable;',
        "export type { Other } from './other.ts';",
        'declare const injected: string;',
      ].join('\n'),
    ),
    true,
  );
  for (const source of [
    "import { Readable } from 'node:stream';",
    'export const value = 1;',
    "export { value } from './value.ts';",
    'export function run() {}',
    'export enum Kind { A }',
  ]) {
    assert.equal(declaresTypesOnly('runtime.ts', source), false, source);
  }
});

await test('item weights come from measured lines, the unmeasured average, or nothing', () => {
  const costs = new Map([['src/a.ts', new Map([[2, 300]])]]);
  const unmeasured = unmeasuredLineCost(
    [
      { path: 'src/a.ts', lineCount: 10 },
      { path: 'src/new.ts', lineCount: 90 },
    ],
    costs,
  );
  assert.equal(unmeasured, 30);
  assert.equal(unmeasuredLineCost([{ path: 'src/new.ts', lineCount: 9 }], costs), 1);
  const item = { path: 'src/a.ts', patterns: ['src/a.ts'], lines: [1, 2, 3], typesOnly: false };
  assert.equal(itemWeight(item, costs, unmeasured), 300);
  assert.equal(itemWeight({ ...item, lines: [5, 6] }, costs, unmeasured), 60);
  assert.equal(itemWeight({ ...item, path: 'src/new.ts' }, costs, unmeasured), 90);
  assert.equal(itemWeight({ ...item, typesOnly: true }, costs, unmeasured), 0);
});

await test('measured costs, not line counts, balance the shards', () => {
  const types = `import type { Readable } from 'node:stream';\n${indexes(9)
    .map((line) => `export type T${String(line)} = Readable;`)
    .join('\n')}\n`;
  withFixtures({ heavy: constants(10), light: constants(10), new: constants(10), types }, (paths) => {
    const heavy = stringValue(paths[0]);
    const light = stringValue(paths[1]);
    const newFile = stringValue(paths[2]);
    const typesOnly = stringValue(paths[3]);
    // By line count the files would pair up; the measured heavy file needs a
    // shard to itself. The unmeasured file costs the measured average per line,
    // (900 + 30) / 20 lines = 46.5, so 465 in all. Charged that average too, the
    // types-only file would split the second shard: [[heavy, light], [new, types]].
    const costs = new Map([
      [heavy, new Map([[1, 900]])],
      [light, new Map([[2, 30]])],
    ]);
    assert.deepEqual(
      indexes(2).map((shard) => shardMutationPatterns(paths, shard, 2, costs)),
      [[heavy], [newFile, light, typesOnly]],
    );
    assert.deepEqual(changedShardPatterns(paths, 1, 2, costs), [newFile, light, typesOnly]);
    assert.deepEqual(
      indexes(2).map((shard) => shardMutationPatterns(paths, shard, 2, new Map())),
      [
        [heavy, newFile],
        [light, typesOnly],
      ],
    );
  });
});

await test('a chunk added to a measured file costs the unmeasured average, not nothing', () => {
  withFixtures({ grown: functions(4), other: functions(2) }, (paths) => {
    const grown = stringValue(paths[0]);
    const other = stringValue(paths[1]);
    // Only the grown file's first function was measured. Its other chunks cost
    // the average per line instead of 0, so they spread across the shards
    // rather than all landing on the lightest one.
    const costs = new Map([
      [grown, new Map([[2, 4000]])],
      [other, new Map([[2, 1000]])],
    ]);
    const shards = indexes(3).map((shard) => shardMutationPatterns(paths, shard, 3, costs));
    assert.deepEqual(shards[0], [`${grown}:1-41`]);
    assert.deepEqual(
      shards.map((selected) => selected.length > 0),
      [true, true, true],
    );
  });
});
