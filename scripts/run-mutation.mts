import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { changedShardPatterns, mutationPatterns, shardMutationPatterns } from './mutation-scope.mts';

function git(...args: readonly string[]): string {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' });
}

function lines(output: string): string[] {
  return output.split('\n').filter(Boolean);
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

const untracked = lines(git('ls-files', '--others', '--exclude-standard', '--', 'src'));
const scope =
  base === undefined
    ? mutationPatterns([...lines(git('ls-files', '--cached', '--', 'src')), ...untracked])
    : mutationPatterns([...lines(git('diff', '--name-only', base, '--', 'src')), ...untracked]);
const selectShard = base === undefined ? shardMutationPatterns : changedShardPatterns;
const patterns = shardIndex === undefined ? scope : selectShard(scope, Number(shardIndex), Number(shardCount));

if (patterns.length === 0) {
  process.stdout.write(`No handwritten runtime changed since ${String(base)} in this shard; skipping Stryker.\n`);
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
