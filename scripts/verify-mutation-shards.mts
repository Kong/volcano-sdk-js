import { execFileSync } from 'node:child_process';
import { mutantCount } from './mutant-inventory.mts';
import { mutationPatterns, mutationShardCount, shardMutationPatterns } from './mutation-scope.mts';

function git(...args: readonly string[]): string {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' });
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
process.stdout.write(`Stryker mutant inventory: full=${String(expected)}; shards=${counts.join(',')}\n`);
if (expected === 0 || counts.includes(0) || actual !== expected) {
  throw new Error(`Mutation shards cover ${String(actual)} of ${String(expected)} Stryker mutants`);
}
