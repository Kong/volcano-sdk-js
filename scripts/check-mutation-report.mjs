import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function mutationReportFindings(report) {
  const files = report?.files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) {
    return { integrity: ['Missing mutation report files'], outcomes: [] };
  }
  const entries = Object.entries(files);
  if (entries.length === 0) {
    return { integrity: ['Mutation report contains no source files'], outcomes: [] };
  }

  const integrity = [];
  const outcomes = [];
  let mutants = 0;
  for (const [filename, file] of entries) {
    if (!Array.isArray(file?.mutants)) {
      integrity.push(`${filename}: missing mutant results`);
      continue;
    }
    for (const mutant of file.mutants) {
      mutants += 1;
      if (mutant.status !== 'Killed' && mutant.status !== 'CompileError') {
        outcomes.push(`${filename}:${String(mutant.id)} ${String(mutant.status)}`);
      }
    }
  }
  if (mutants === 0) {
    integrity.push('Mutation report contains no mutants');
  }
  return { integrity, outcomes };
}

export function mutationReportProblems(report) {
  const findings = mutationReportFindings(report);
  return [...findings.integrity, ...findings.outcomes];
}

export function mutationGateFailed(report) {
  const findings = mutationReportFindings(report);
  return findings.integrity.length > 0 || findings.outcomes.length > 0;
}

function mutationStatusCounts(report) {
  const counts = new Map();
  for (const file of Object.values(report?.files ?? {})) {
    if (!Array.isArray(file?.mutants)) {
      continue;
    }
    for (const mutant of file.mutants) {
      counts.set(mutant.status, (counts.get(mutant.status) ?? 0) + 1);
    }
  }
  return counts;
}

async function main() {
  const path = 'reports/mutation.json';
  let report;
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
    `Mutation results: ${[...counts].map(([status, count]) => `${status}=${count}`).join(', ')}\n`,
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

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
