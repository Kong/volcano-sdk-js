import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint } from './oxlint-report.mts';
import { array, record, stringValue } from './values.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const auditRule = 'pnpm audit';
const directive = '// oxlint-disable';
// Each approved lint exception and the declaration its directive must precede.
const declarations = new Map([
  ['src/index.ts:QueryBuilder', 'export const QueryBuilder ='],
  ['src/index.ts:StorageFileApi', 'export const StorageFileApi ='],
  ['src/volcano-fetch.ts:retryAfterSeconds', 'const seconds = Number.parseInt('],
  ['scripts/jest-completeness.cts:testNamePattern', 'this.testNamePattern = pattern'],
  ['src/database-query.ts:QueryBuilder.then', 'then<'],
  ['src/database-mutations.ts:MutationBuilder.then', 'then<'],
  ['__tests__/durable-messages-subscribe-handlers.test.ts:runsReturnedThenables', 'const thenable = { then };'],
]);

async function exceptions(): Promise<Record<string, unknown>[]> {
  const content = await readFile(join(root, 'quality-exceptions.json'), 'utf8');
  return array(JSON.parse(content)).map((value) => record(value));
}

function directiveLines(lines: readonly string[]): number[] {
  return lines.flatMap((line, index) => (line.trim().startsWith(directive) ? [index] : []));
}

async function lintWithoutDirectives(path: string, lines: readonly string[]): Promise<Set<string>> {
  // Lint a sibling copy so the repository's ignore patterns and scope still apply.
  const directory = await mkdtemp(join(root, dirname(path), 'quality-fixture-'));
  try {
    const copy = join(directory, basename(path));
    const stripped = lines.map((line) => (line.trim().startsWith(directive) ? '//' : line));
    await writeFile(copy, stripped.join('\n'));
    return new Set(lint([copy]).findings.map(({ code, line }) => `${code}:${String(line)}`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function oxlintCode(rule: string): string {
  const [plugin, name] = rule.split('/');
  return `${stringValue(plugin)}(${stringValue(name)})`;
}

await test('every lint exception is approved, exact, and still needed', async () => {
  const approved = (await exceptions()).filter((item) => item['rule'] !== auditRule);
  assert.deepEqual(
    approved.map((item) => item['scope']),
    [...declarations.keys()],
  );
  const paths = new Set(approved.map((item) => stringValue(item['scope']).split(':')[0] ?? ''));
  const directives = new Map<string, number[]>();
  for (const path of paths) {
    const lines = (await readFile(join(root, path), 'utf8')).split('\n');
    directives.set(path, directiveLines(lines));
    const findings = await lintWithoutDirectives(path, lines);
    for (const item of approved.filter((entry) => stringValue(entry['scope']).startsWith(`${path}:`))) {
      const scope = stringValue(item['scope']);
      const rule = stringValue(item['rule']);
      const target = lines.findIndex((line) => line.trim().startsWith(declarations.get(scope) ?? '\0'));
      assert.ok((lines[target - 1] ?? '').trim().startsWith(`${directive}-next-line ${rule} -- `), scope);
      assert.ok(findings.has(`${oxlintCode(rule)}:${String(target + 1)}`), `${scope} no longer needs ${rule}`);
      assert.ok(stringValue(item['rationale']).length > 30);
      assert.ok(stringValue(item['evidence']).length > 30);
    }
  }
  const total = [...directives.values()].reduce((sum, lines) => sum + lines.length, 0);
  assert.equal(total, approved.length, 'Each lint exception covers exactly one directive');
});

await test('the dependency audit has no exceptions', async () => {
  assert.deepEqual(
    (await exceptions()).filter((item) => item['rule'] === auditRule).map((item) => item['scope']),
    [],
  );
});
