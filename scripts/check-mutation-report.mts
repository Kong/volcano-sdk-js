import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { array, isRecord } from './values.mts';

interface Findings {
  integrity: string[];
  outcomes: string[];
}

interface FileFindings extends Findings {
  count: number;
}

type ReportEntries = { entries: [string, unknown][] } | { error: string };

function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function reportEntries(report: unknown): ReportEntries {
  const files = field(report, 'files');
  if (!isRecord(files)) {
    return { error: 'Missing mutation report files' };
  }
  const entries = Object.entries(files);
  if (entries.length === 0) {
    return { error: 'Mutation report contains no source files' };
  }
  return { entries };
}

function fileMutants(file: unknown): readonly unknown[] | undefined {
  const mutants = field(file, 'mutants');
  return Array.isArray(mutants) ? array(mutants) : undefined;
}

function fileFindings(filename: string, file: unknown): FileFindings {
  const mutants = fileMutants(file);
  if (mutants === undefined) {
    return { integrity: [`${filename}: missing mutant results`], outcomes: [], count: 0 };
  }
  return {
    integrity: [],
    outcomes: mutants
      .filter(
        (mutant) =>
          field(mutant, 'status') !== 'Killed' && field(mutant, 'status') !== 'CompileError',
      )
      .map(
        (mutant) => `${filename}:${String(field(mutant, 'id'))} ${String(field(mutant, 'status'))}`,
      ),
    count: mutants.length,
  };
}

function mutationReportFindings(report: unknown): Findings {
  const result = reportEntries(report);
  if ('error' in result) {
    return { integrity: [result.error], outcomes: [] };
  }

  const findings = result.entries.map(([filename, file]) => fileFindings(filename, file));
  const integrity = findings.flatMap((item) => item.integrity);
  if (findings.reduce((total, item) => total + item.count, 0) === 0) {
    integrity.push('Mutation report contains no mutants');
  }
  return { integrity, outcomes: findings.flatMap((item) => item.outcomes) };
}

export function mutationReportProblems(report: unknown): string[] {
  const findings = mutationReportFindings(report);
  return [...findings.integrity, ...findings.outcomes];
}

export function mutationGateFailed(report: unknown): boolean {
  const findings = mutationReportFindings(report);
  return findings.integrity.length > 0 || findings.outcomes.length > 0;
}

function mutationStatusCounts(report: unknown): Map<unknown, number> {
  const counts = new Map<unknown, number>();
  const result = reportEntries(report);
  if ('error' in result) {
    return counts;
  }
  const mutants = result.entries.flatMap(([, file]) => fileMutants(file) ?? []);
  for (const mutant of mutants) {
    const status = field(mutant, 'status');
    counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  return counts;
}

async function main(): Promise<void> {
  const path = 'reports/mutation.json';
  let report: unknown;
  try {
    report = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    console.error(`Cannot read mutation report ${path}:`, error);
    process.exitCode = 1;
    return;
  }
  const problems = mutationReportProblems(report);
  const counts = mutationStatusCounts(report);
  process.stdout.write(
    `Mutation results: ${[...counts].map(([status, count]) => `${String(status)}=${String(count)}`).join(', ')}\n`,
  );
  if (problems.length > 0) {
    console.error('Mutation findings:', ...problems.slice(0, 25));
    if (problems.length > 25) {
      console.error(`... and ${String(problems.length - 25)} more; inspect ${path}`);
    }
    if (mutationGateFailed(report)) {
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write('Mutation gate passed.\n');
}

const entrypoint = process.argv[1];
if (entrypoint !== undefined && pathToFileURL(entrypoint).href === import.meta.url) {
  await main();
}
