import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { MutationCosts } from './mutation-costs.mts';
import { isRecord } from './values.mts';

// One line of a worker's timing file: a mutant, the wall time its test run
// took inside that worker, and the outcome.
export interface MutantTiming {
  file: string;
  line: number;
  mutator: string;
  ms: number;
  tests: number;
  status: string;
}

export const mutationTimingDirectory = 'reports/mutation-timing';

// Set by scripts/run-mutation.mts. Workers run inside Stryker's sandbox, which
// is deleted afterwards, so they write timings under this absolute project root.
export const projectRootVariable = 'MUTATION_TIMING_ROOT';

// Mutants at least this slow are logged while the shard runs, so a shard that
// times out still shows what it was spending time on.
export const slowMutantMs = 30_000;

function parseTiming(line: string, source: string): MutantTiming {
  const value: unknown = JSON.parse(line);
  if (!isRecord(value)) {
    throw new Error(`${source}: expected a mutant timing object`);
  }
  const { file, line: lineNumber, mutator, ms, tests, status } = value;
  if (typeof file !== 'string' || typeof mutator !== 'string' || typeof status !== 'string') {
    throw new TypeError(`${source}: mutant timing needs file, mutator, and status`);
  }
  if (
    typeof lineNumber !== 'number' ||
    !Number.isInteger(lineNumber) ||
    typeof ms !== 'number' ||
    !Number.isFinite(ms) ||
    typeof tests !== 'number' ||
    !Number.isInteger(tests)
  ) {
    throw new TypeError(`${source}: mutant timing needs a line, a duration, and a test count`);
  }
  return { file, line: lineNumber, mutator, ms, tests, status };
}

export function parseMutantTimings(text: string, source: string): MutantTiming[] {
  return text
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line, index) => parseTiming(line, `${source}:${String(index + 1)}`));
}

export function timingCosts(timings: readonly MutantTiming[]): MutationCosts {
  const costs = new Map<string, Map<number, number>>();
  for (const timing of timings) {
    const lines = costs.get(timing.file) ?? new Map<number, number>();
    lines.set(timing.line, (lines.get(timing.line) ?? 0) + timing.ms);
    costs.set(timing.file, lines);
  }
  return costs;
}

export function formatMutantTiming(timing: MutantTiming): string {
  return `${timing.file}:${String(timing.line)} ${timing.mutator} ${(timing.ms / 1000).toFixed(1)}s, ${String(timing.tests)} tests, ${timing.status}`;
}

export function mutationTimingSummary(timings: readonly MutantTiming[], limit = 10): string {
  if (timings.length === 0) {
    return 'Mutation timing: no mutants ran.\n';
  }
  const files = new Map<string, { ms: number; mutants: number }>();
  for (const timing of timings) {
    const file = files.get(timing.file) ?? { ms: 0, mutants: 0 };
    files.set(timing.file, { ms: file.ms + timing.ms, mutants: file.mutants + 1 });
  }
  const total = timings.reduce((sum, timing) => sum + timing.ms, 0);
  const slowest = timings.toSorted((left, right) => right.ms - left.ms).slice(0, limit);
  const costliest = [...files.entries()].toSorted(([, left], [, right]) => right.ms - left.ms).slice(0, limit);
  return [
    `Mutation timing: ${String(timings.length)} mutants, ${(total / 60_000).toFixed(1)} worker-minutes.`,
    'Slowest mutants:',
    ...slowest.map((timing) => `  ${formatMutantTiming(timing)}`),
    'Costliest files:',
    ...costliest.map(
      ([file, { ms, mutants }]) => `  ${file} ${(ms / 60_000).toFixed(1)} worker-minutes, ${String(mutants)} mutants`,
    ),
    '',
  ].join('\n');
}

export function readMutantTimings(directory: string): MutantTiming[] {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((name) => name.endsWith('.jsonl'))
    .toSorted((left, right) => left.localeCompare(right))
    .flatMap((name) => parseMutantTimings(readFileSync(join(directory, name), 'utf8'), name));
}
