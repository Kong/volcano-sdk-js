import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  formatMutationCosts,
  mergeMutationCosts,
  mutationCostsPath,
  parseMutationCosts,
  readMutationCosts,
} from './mutation-costs.mts';
import { MutationTimingReporter } from './mutation-timing-reporter.mts';
import { record } from './values.mts';

function withDirectory(run: (directory: string) => void): void {
  const directory = mkdtempSync(join(tmpdir(), 'volcano-mutation-costs-'));
  try {
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

await test('the cost table parses per-line costs and rejects malformed entries', () => {
  const costs = parseMutationCosts('{"files":{"src/a.ts":{"3":1200,"10":0}}}');
  assert.deepEqual(
    [...costs.entries()].map(([path, lines]) => [path, [...lines.entries()]]),
    [
      [
        'src/a.ts',
        [
          [3, 1200],
          [10, 0],
        ],
      ],
    ],
  );
  for (const text of [
    '{}',
    '{"files":[]}',
    '{"files":{"src/a.ts":[]}}',
    '{"files":{"src/a.ts":{"0":1}}}',
    '{"files":{"src/a.ts":{"x":1}}}',
    '{"files":{"src/a.ts":{"1":-1}}}',
    '{"files":{"src/a.ts":{"1":"1"}}}',
  ]) {
    assert.throws(() => parseMutationCosts(text), /Mutation costs|expected/u);
  }
});

await test('a missing cost table weighs nothing', () => {
  withDirectory((directory) => {
    assert.equal(readMutationCosts(join(directory, 'missing.json')).size, 0);
  });
});

await test('the committed cost table parses', () => {
  assert.ok(readMutationCosts(mutationCostsPath).size > 0);
});

await test('new timings replace a file and join the shards that split it', () => {
  const existing = parseMutationCosts('{"files":{"src/a.ts":{"1":5},"src/b.ts":{"2":7}}}');
  const merged = mergeMutationCosts(existing, [
    parseMutationCosts('{"files":{"src/a.ts":{"3":10}}}'),
    parseMutationCosts('{"files":{"src/a.ts":{"9":4,"3":1}}}'),
  ]);
  assert.equal(
    formatMutationCosts(merged),
    `${JSON.stringify({ files: { 'src/a.ts': { 3: 11, 9: 4 }, 'src/b.ts': { 2: 7 } } }, undefined, 2)}\n`,
  );
});

await test('the formatted table sorts files and lines and round-trips', () => {
  const costs = parseMutationCosts('{"files":{"src/z.ts":{"20":1,"3":2},"src/a.ts":{"1":3}}}');
  const text = formatMutationCosts(costs);
  assert.equal(
    text,
    `${JSON.stringify({ files: { 'src/a.ts': { 1: 3 }, 'src/z.ts': { 3: 2, 20: 1 } } }, undefined, 2)}\n`,
  );
  assert.ok(text.indexOf('"3"') < text.indexOf('"20"'));
  assert.equal(formatMutationCosts(parseMutationCosts(text)), text);
});

await test('the timing reporter charges each mutant the wall time since the previous result', () => {
  withDirectory((directory) => {
    const output = join(directory, 'reports', 'mutation-timing.json');
    const clock = [0, 1000, 1500, 4000, 4250];
    let tick = 0;
    const reporter = new MutationTimingReporter(() => Number(clock[tick++]), output);
    reporter.onMutationTestingPlanReady();
    reporter.onMutantTested({ fileName: join(process.cwd(), 'src', 'a.ts'), location: { start: { line: 3 } } });
    reporter.onMutantTested({ fileName: 'src/a.ts', location: { start: { line: 3 } } });
    reporter.onMutantTested({ fileName: 'src/b.ts', location: { start: { line: 8 } } });
    assert.deepEqual(JSON.parse(readFileSync(output, 'utf8')), {
      files: { 'src/a.ts': { 3: 3000 }, 'src/b.ts': { 8: 250 } },
    });
  });
});

await test('Stryker loads the timing reporter on every mutation run', () => {
  const config = record(JSON.parse(readFileSync('stryker.config.json', 'utf8')));
  assert.deepEqual(config['plugins'], [
    '@stryker-mutator/jest-runner',
    './.quality-tools/mutation-timing-reporter.mjs',
  ]);
  assert.deepEqual(config['reporters'], ['clear-text', 'json', 'mutation-timing']);
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.match(
    workflow,
    /- name: Preserve mutation timings\n {8}if: \$\{\{ always\(\) \}\}\n(?:.*\n){2} {10}name: mutation-timing-node-22-shard-\$\{\{ matrix\.mutation-shard \}\}\n {10}path: reports\/mutation-timing\.json\n/u,
  );
});

await test('the update script merges timing files into the cost table', () => {
  withDirectory((directory) => {
    writeFileSync(join(directory, mutationCostsPath), '{"files":{"src/b.ts":{"2":7}}}');
    writeFileSync(join(directory, 'shard-0.json'), '{"files":{"src/a.ts":{"1":5}}}');
    writeFileSync(join(directory, 'shard-1.json'), '{"files":{"src/a.ts":{"4":6}}}');
    const script = join(process.cwd(), '.quality-tools', 'update-mutation-costs.mjs');
    const run = spawnSync(process.execPath, [script, 'shard-0.json', 'shard-1.json'], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(run.status, 0, run.stderr);
    assert.equal(
      readFileSync(join(directory, mutationCostsPath), 'utf8'),
      `${JSON.stringify({ files: { 'src/a.ts': { 1: 5, 4: 6 }, 'src/b.ts': { 2: 7 } } }, undefined, 2)}\n`,
    );
    const empty = spawnSync(process.execPath, [script], { cwd: directory, encoding: 'utf8' });
    assert.notEqual(empty.status, 0);
    assert.match(empty.stderr, /Pass the mutation-timing\.json files/u);
  });
});
