import type { EventData } from 'node:test';
import type { TestEvent } from 'node:test/reporters';

interface Report {
  cases: number;
  problems: string[];
}

function incompleteCase(result: EventData.TestPass | EventData.TestFail): boolean {
  return [
    result.skip !== undefined && result.skip !== false,
    result.todo !== undefined && result.todo !== false,
    // Node reports a file without registered cases as a passing test named after that file.
    result.name === result.file,
  ].includes(true);
}

function acceptEvent(report: Report, event: TestEvent): void {
  if (event.type !== 'test:pass' && event.type !== 'test:fail') {
    return;
  }
  report.cases += Number(event.data.details.type !== 'suite');
  if (incompleteCase(event.data)) {
    report.problems.push(event.data.name);
  }
}

function filteredRun(): boolean {
  const flags = ['--test-only', '--test-name-pattern', '--test-skip-pattern'];
  return process.execArgv.some((argument) =>
    flags.some((flag) => argument === flag || argument.startsWith(`${flag}=`)),
  );
}

export default async function* completeness(
  events: AsyncIterable<TestEvent>,
): AsyncGenerator<string, void> {
  const report: Report = { cases: 0, problems: [] };
  for await (const event of events) {
    acceptEvent(report, event);
  }
  if (report.cases === 0 || filteredRun()) {
    report.problems.push('missing or filtered test cases');
  }
  if (report.problems.length > 0) {
    process.exitCode = 1;
    process.stderr.write(`Incomplete native test run: ${report.problems.join(', ')}\n`);
  }
  yield '';
}
