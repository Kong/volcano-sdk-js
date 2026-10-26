import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mutantCount } from './mutant-inventory.mts';
import { selectMutationPatterns } from './mutation-scope.mts';

function git(...args: readonly string[]): string {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' });
}

const shardIndex = process.env['MUTATION_SHARD_INDEX'];
const shardCount = process.env['MUTATION_SHARD_COUNT'];
// Pull requests and merge groups mutate only the runtime files they change.
const base = process.env['MUTATION_BASE'] === '' ? undefined : process.env['MUTATION_BASE'];
if ((shardIndex === undefined) !== (shardCount === undefined)) {
  throw new Error('Set both MUTATION_SHARD_INDEX and MUTATION_SHARD_COUNT');
}
if (
  (shardIndex !== undefined && !/^\d+$/.test(shardIndex)) ||
  (shardCount !== undefined && !/^\d+$/.test(shardCount))
) {
  throw new Error('Mutation shard index and count must be non-negative integers');
}

const patterns = selectMutationPatterns(
  base,
  git,
  shardIndex === undefined ? undefined : { index: Number(shardIndex), count: Number(shardCount) },
);

// A changed file can hold only types, which give Stryker no mutants; it then
// exits with "No tests were executed".
if (patterns.length === 0 || (base !== undefined && mutantCount(patterns) === 0)) {
  process.stdout.write(`No mutable runtime code changed since ${String(base)} in this shard; skipping Stryker.\n`);
} else {
  rmSync('reports/mutation.json', { force: true });
  const stryker = spawnSync('./node_modules/.bin/stryker', ['run', '--mutate', patterns.join(',')], {
    stdio: 'inherit',
  });
  const report = spawnSync(process.execPath, ['.quality-tools/check-mutation-report.mjs'], {
    stdio: 'inherit',
  });
  process.exitCode = stryker.status === 0 && report.status === 0 ? 0 : 1;
}
