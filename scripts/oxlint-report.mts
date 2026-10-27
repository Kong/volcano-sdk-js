import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { array, record, stringValue } from './values.mts';

export interface OxlintReport {
  files: number;
  findings: { code: string; filename: string; line: number }[];
}

const root = fileURLToPath(new URL('..', import.meta.url));
const oxlint = join(root, 'node_modules/oxlint/bin/oxlint');

function finding(value: unknown): OxlintReport['findings'][number] {
  const diagnostic = record(value);
  const labels = array(diagnostic['labels']).map((label) => record(label));
  // Type-aware diagnostics list their annotated spans first; the unannotated span is the one reported.
  const reported = labels.find((label) => label['label'] === undefined) ?? labels[0];
  const line = record(reported?.['span'])['line'];
  assert.ok(typeof line === 'number', 'Expected a line number');
  return { code: stringValue(diagnostic['code']), filename: stringValue(diagnostic['filename']), line };
}

export function lint(paths: readonly string[]): OxlintReport {
  const result = spawnSync(process.execPath, [oxlint, '--format=json', ...paths], {
    cwd: root,
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(result.error, undefined);
  assert.ok(result.status === 0 || result.status === 1, result.stderr);
  // oxlint prints plain text instead of a JSON report when ignore patterns leave nothing to lint.
  if (result.stdout.startsWith('No files found to lint')) {
    return { files: 0, findings: [] };
  }
  const report = record(JSON.parse(result.stdout));
  const files = report['number_of_files'];
  assert.ok(typeof files === 'number', 'Expected a linted file count');
  return { files, findings: array(report['diagnostics']).map((value) => finding(value)) };
}

export function requireLinted(path: string, report: (paths: readonly string[]) => OxlintReport = lint): void {
  assert.equal(report([path]).files, 1, `${path} is ignored by oxlint`);
}
