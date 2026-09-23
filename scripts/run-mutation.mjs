import { execFileSync, spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { mutationPatterns } from './mutation-scope.mjs';

function git(...args) {
  return execFileSync('/usr/bin/git', args, { encoding: 'utf8' });
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
const untrackedPaths = git('ls-files', '--others', '--exclude-standard', '--', 'src')
  .split('\n')
  .filter(Boolean);
const patterns = mutationPatterns(committedDiff, workingDiff, untrackedPaths);

rmSync('reports/mutation.json', { force: true });
const stryker = spawnSync('./node_modules/.bin/stryker', ['run', '--mutate', patterns.join(',')], {
  stdio: 'inherit',
});
const report = spawnSync(process.execPath, ['scripts/check-mutation-report.mjs'], {
  stdio: 'inherit',
});
process.exitCode = stryker.status === 0 && report.status === 0 ? 0 : 1;
