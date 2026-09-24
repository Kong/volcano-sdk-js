import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { mutationGateFailed, mutationReportProblems } from './check-mutation-report.mts';
import { record } from './values.mts';

interface FixtureReport {
  files: { 'src/example.ts': { mutants: { id: string; status: string }[] } };
}

function reportWith(status: string): FixtureReport {
  return { files: { 'src/example.ts': { mutants: [{ id: '7', status }] } } };
}

await test('accepts killed mutants and invalid compile errors', () => {
  const report = reportWith('Killed');
  report.files['src/example.ts'].mutants.push({ id: '8', status: 'CompileError' });
  assert.deepEqual(mutationReportProblems(report), []);
});

for (const status of ['Survived', 'NoCoverage', 'Timeout', 'RuntimeError', 'Ignored', 'Pending']) {
  await test(`rejects ${status} separately`, () => {
    assert.deepEqual(mutationReportProblems(reportWith(status)), [`src/example.ts:7 ${status}`]);
  });
}

await test('rejects missing or empty reports', () => {
  assert.deepEqual(mutationReportProblems({}), ['Missing mutation report files']);
  assert.deepEqual(mutationReportProblems({ files: {} }), [
    'Mutation report contains no source files',
  ]);
  assert.deepEqual(mutationReportProblems({ files: { 'src/example.ts': { mutants: [] } } }), [
    'Mutation report contains no mutants',
  ]);
});

await test('rejects incomplete file results', () => {
  assert.deepEqual(mutationReportProblems({ files: { 'src/example.ts': {} } }), [
    'src/example.ts: missing mutant results',
    'Mutation report contains no mutants',
  ]);
});

await test('the full mutation gate rejects survivors and incomplete reports', () => {
  assert.equal(mutationGateFailed(reportWith('Survived')), true);
  for (const report of [
    {},
    { files: {} },
    { files: { 'src/example.ts': {} } },
    { files: { 'src/example.ts': { mutants: [] } } },
  ]) {
    assert.equal(mutationGateFailed(report), true);
  }
});

await test('the required PR mutation threshold cannot be lowered', () => {
  const config = record(JSON.parse(readFileSync('stryker.config.json', 'utf8')));
  assert.deepEqual(config['thresholds'], { high: 100, low: 100, break: 100 });
});
