import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

function isFileMap(files) {
  return files !== null && typeof files === 'object' && !Array.isArray(files);
}

function reportEntries(report) {
  const files = report?.files;
  if (!isFileMap(files)) {
    return { error: 'Missing mutation report files' };
  }
  const entries = Object.entries(files);
  if (entries.length === 0) {
    return { error: 'Mutation report contains no source files' };
  }
  return { entries };
}

function fileFindings(filename, file) {
  if (!Array.isArray(file?.mutants)) {
    return { integrity: [`${filename}: missing mutant results`], outcomes: [], count: 0 };
  }
  return {
    integrity: [],
    outcomes: file.mutants
      .filter((mutant) => mutant.status !== 'Killed' && mutant.status !== 'CompileError')
      .map((mutant) => `${filename}:${String(mutant.id)} ${String(mutant.status)}`),
    count: file.mutants.length,
  };
}

function mutationReportFindings(report) {
  const { entries, error } = reportEntries(report);
  if (error !== undefined) {
    return { integrity: [error], outcomes: [] };
  }

  const findings = entries.map(([filename, file]) => fileFindings(filename, file));
  const integrity = findings.flatMap((item) => item.integrity);
  if (findings.reduce((total, item) => total + item.count, 0) === 0) {
    integrity.push('Mutation report contains no mutants');
  }
  return { integrity, outcomes: findings.flatMap((item) => item.outcomes) };
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
  const mutants = Object.values(report?.files ?? {}).flatMap((file) =>
    Array.isArray(file?.mutants) ? file.mutants : [],
  );
  for (const mutant of mutants) {
    counts.set(mutant.status, (counts.get(mutant.status) ?? 0) + 1);
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
