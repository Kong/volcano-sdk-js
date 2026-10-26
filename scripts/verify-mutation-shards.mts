import { execFileSync, spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mutationPatterns, mutationShardCount, shardMutationPatterns } from './mutation-scope.mts';
import { record } from './values.mts';

function git(...args: readonly string[]): string {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' });
}

// Stryker prints the mutant count while instrumenting, before its dry run. A
// no-op command runner skips the test suite, which would otherwise run once per
// shard and push this job past its timeout.
const inventoryDirectory = mkdtempSync(join(tmpdir(), 'volcano-mutation-inventory-'));
const inventoryConfig = join(inventoryDirectory, 'stryker.config.json');
writeFileSync(
  inventoryConfig,
  JSON.stringify({
    ...record(JSON.parse(readFileSync('stryker.config.json', 'utf8'))),
    $schema: undefined,
    jest: undefined,
    plugins: [],
    testRunner: 'command',
    commandRunner: { command: 'node -e 0' },
    coverageAnalysis: 'off',
    concurrency: 1,
    reporters: [],
    fileLogLevel: 'off',
  }),
);

function dryRunArguments(patterns: readonly string[]): string[] {
  const run = ['run', inventoryConfig, '--dryRunOnly'];
  return patterns.length > 0 ? [...run, '--mutate', patterns.join(',')] : run;
}

function reportDryRunFailure(run: SpawnSyncReturns<string | null | undefined>): never {
  process.stderr.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  throw new Error('Stryker mutation inventory failed');
}

function mutantCount(patterns: readonly string[]): number {
  const run = spawnSync('./node_modules/.bin/stryker', dryRunArguments(patterns), {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  if (run.status !== 0) {
    reportDryRunFailure(run);
  }
  const count = /Instrumented \d+ source file\(s\) with (\d+) mutant\(s\)/.exec(run.stdout);
  if (count === null) {
    throw new Error('Stryker did not report an instrumented mutant count');
  }
  return Number(count[1]);
}

const paths = git('ls-files', '--cached', '--others', '--exclude-standard', '--', 'src').split('\n').filter(Boolean);
const patterns = mutationPatterns(paths);
const expected = mutantCount([]);
const counts = Array.from({ length: mutationShardCount }, (_, index) =>
  mutantCount(shardMutationPatterns(patterns, index, mutationShardCount)),
);
let actual = 0;
for (const count of counts) {
  actual += count;
}
rmSync(inventoryDirectory, { recursive: true, force: true });
process.stdout.write(`Stryker mutant inventory: full=${String(expected)}; shards=${counts.join(',')}\n`);
if (expected === 0 || counts.includes(0) || actual !== expected) {
  throw new Error(`Mutation shards cover ${String(actual)} of ${String(expected)} Stryker mutants`);
}
