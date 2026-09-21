import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'volcano-sdk-quality-'));
try {
  const { stdout } = await run(
    'npm',
    ['pack', '--json', '--ignore-scripts', '--pack-destination', directory],
    { timeout: 120_000 },
  );
  const [{ filename }] = JSON.parse(stdout);
  const result = await run(
    process.execPath,
    ['scripts/test-package-quickstart.mjs', join(directory, filename)],
    { timeout: 180_000 },
  );
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
} finally {
  await rm(directory, { recursive: true, force: true });
}
