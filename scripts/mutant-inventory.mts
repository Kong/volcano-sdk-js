import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { record } from './values.mts';

// Stryker prints the mutant count while instrumenting, before its dry run. A
// no-op command runner skips the test suite, which would otherwise run for
// every count.
function writeInventoryConfig(directory: string): string {
  const path = join(directory, 'stryker.config.json');
  writeFileSync(
    path,
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
  return path;
}

function reportDryRunFailure(run: SpawnSyncReturns<string | null | undefined>): never {
  process.stderr.write(run.stdout ?? '');
  process.stderr.write(run.stderr ?? '');
  throw new Error('Stryker mutation inventory failed');
}

export function mutantCount(patterns: readonly string[]): number {
  const directory = mkdtempSync(join(tmpdir(), 'volcano-mutation-inventory-'));
  try {
    const scope = patterns.length > 0 ? ['--mutate', patterns.join(',')] : [];
    const run = spawnSync(
      './node_modules/.bin/stryker',
      ['run', writeInventoryConfig(directory), '--dryRunOnly', ...scope],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    );
    if (run.status !== 0) {
      reportDryRunFailure(run);
    }
    const count = /Instrumented \d+ source file\(s\) with (\d+) mutant\(s\)/u.exec(run.stdout);
    if (count === null) {
      throw new Error('Stryker did not report an instrumented mutant count');
    }
    return Number(count[1]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
