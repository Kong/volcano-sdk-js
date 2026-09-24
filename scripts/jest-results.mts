import { array, record, stringValue } from './values.mts';

export function assertionResults(report: Record<string, unknown>): Record<string, unknown>[] {
  return array(report['testResults']).flatMap((suite) =>
    array(record(suite)['assertionResults']).map((value) => record(value)),
  );
}

export function failureMessages(assertion: unknown): string {
  return array(record(assertion)['failureMessages'])
    .map((value) => stringValue(value))
    .join('\n');
}
