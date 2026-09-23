import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export function mutationReportProblems(report) {
  const files = report?.files;
  if (files === null || typeof files !== 'object' || Array.isArray(files)) {
    return ['Missing mutation report files'];
  }
  const entries = Object.entries(files);
  if (entries.length === 0) {
    return ['Mutation report contains no source files'];
  }

  const problems = [];
  let mutants = 0;
  for (const [filename, file] of entries) {
    if (!Array.isArray(file?.mutants)) {
      problems.push(`${filename}: missing mutant results`);
      continue;
    }
    for (const mutant of file.mutants) {
      mutants += 1;
      if (mutant.status !== 'Killed' && mutant.status !== 'CompileError') {
        problems.push(`${filename}:${String(mutant.id)} ${String(mutant.status)}`);
      }
    }
  }
  if (mutants === 0) {
    problems.push('Mutation report contains no mutants');
  }
  return problems;
}

export function mutationStatusCounts(report) {
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
    if (process.argv[2] !== '--audit') {
      process.exitCode = 1;
    }
    return;
  }
  process.stdout.write('Mutation gate passed.\n');
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
