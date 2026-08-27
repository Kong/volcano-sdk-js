import { execFileSync } from 'node:child_process';

const status = execFileSync(
  '/usr/bin/git',
  [
    'status',
    '--porcelain=v1',
    '--untracked-files=all',
    '--',
    'src/generated',
    'src/generated-runtime',
  ],
  { encoding: 'utf8' },
).trim();

if (status) {
  process.stderr.write(`${status}\n`);
  process.stderr.write('Generated OpenAPI files are not up to date.\n');
  process.exitCode = 1;
}
