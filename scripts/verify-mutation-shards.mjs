import { execFileSync, spawnSync } from 'node:child_process';
import { mutationPatterns, mutationShardCount, shardMutationPatterns } from './mutation-scope.mjs';

function git(...args) {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' });
}

function mutantCount(patterns) {
  const run = spawnSync(
    './node_modules/.bin/stryker',
    ['run', '--dryRunOnly', '--mutate', patterns.join(',')],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  if (run.status !== 0) {
    process.stderr.write(run.stdout || '');
    process.stderr.write(run.stderr || '');
    throw new Error('Stryker mutation inventory failed');
  }
  const count = /Instrumented \d+ source file\(s\) with (\d+) mutant\(s\)/.exec(run.stdout);
  if (!count) {
    throw new Error('Stryker did not report an instrumented mutant count');
  }
  return Number(count[1]);
}

const base = process.env.MUTATION_BASE_REF ?? 'origin/main';
git('rev-parse', '--verify', base);
const committedDiff = git(
  'diff',
  '--no-ext-diff',
  '--no-renames',
  '--unified=0',
  `${base}...HEAD`,
  '--',
  'src',
);
const workingDiff = git(
  'diff',
  '--no-ext-diff',
  '--no-renames',
  '--unified=0',
  'HEAD',
  '--',
  'src',
);
const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'src')
  .split('\n')
  .filter(Boolean);
const patterns = mutationPatterns(committedDiff, workingDiff, untracked);
const expected = mutantCount(patterns);
const counts = Array.from({ length: mutationShardCount }, (_, index) =>
  mutantCount(shardMutationPatterns(patterns, index, mutationShardCount)),
);
let actual = 0;
for (const count of counts) {
  actual += count;
}
process.stdout.write(`Stryker mutant inventory: full=${expected}; shards=${counts.join(',')}\n`);
if (expected === 0 || counts.includes(0) || actual !== expected) {
  throw new Error(`Mutation shards cover ${actual} of ${expected} Stryker mutants`);
}
