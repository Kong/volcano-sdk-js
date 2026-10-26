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
  ['src/durable-platform-request.ts:postToPlatform.retryTimeout', 'const timeout = await retryTimeout('],
  ['src/durable-platform-request.ts:postToPlatform.send', 'outcome = await send(url, init, request, timeout)'],
  ['src/durable-message-stream.ts:DurableMessageStream.readPages', 'page = await this.listAfter(after)'],
  [
    'src/storage-file-objects.ts:deletePaths',
    "const result = await host._storageRequest(host._buildUrl(path), { method: 'DELETE' })",
  ],
  ['src/storage-resumable.ts:uploadParts', 'const result = await host.uploadPart('],
  ['src/volcano-auth.ts:imports', "import { authApi, durableApi } from './volcano-auth-facades.ts'"],
  ['scripts/property-policy.test.mts:imports', "import { record } from './values.mts'"],
  ['scripts/typescript-policy.test.mts:imports', "import { array, record, stringValue } from './values.mts'"],
  ['__tests__/durable-message-runtime.test.ts:keepsPublishOrder', 'await Promise.resolve();'],
  [
    '__tests__/durable-messages-subscribe-retries.test.ts:backsOffBetweenRetries',
    'await jest.advanceTimersByTimeAsync(advance);',
  ],
  ['__tests__/support/durable-messages-realtime.ts:until', 'await settled();'],
  ['__tests__/functions-http.test.ts:reachesResolvedHost', 'const { error, status } = await volcano.functions.invoke('],
  [
    '__tests__/functions-http.test.ts:sharesResolution',
    "const { error } = await volcano.functions.invoke('missing-function'",
  ],
  [
    '__tests__/realtime-channel-lifecycle-presence.test.ts:ignoresMalformedPresence',
    'await refreshPresence(Promise.resolve({ clients: malformed',
  ],
  [
    '__tests__/errors.test.ts:preservesInheritedBrandReceiver',
    "Object.defineProperty(String.prototype, 'isSystemError'",
  ],
  ['examples/nextjs-notes-app/src/app/layout.js:RootLayout', "import './globals.css'"],
  ['examples/nextjs-notes-app/src/components/NoteCardEditor.js:NoteCardEditor', 'autoFocus'],
  ['examples/nextjs-notes-app/src/components/NoteEditorForm.js:NoteEditorForm', 'autoFocus'],
  [
    'examples/nextjs-notes-app/src/components/useNoteEditor.js:useNoteEditor.handleSubmit',
    '[title, content, onCreate]',
  ],
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

// Checks every exception approved in `path` and answers how many directives the file holds.
async function checkedDirectives(path: string, approved: readonly Record<string, unknown>[]): Promise<number> {
  const lines = (await readFile(join(root, path), 'utf8')).split('\n');
  const findings = await lintWithoutDirectives(path, lines);
  for (const item of approved.filter((entry) => stringValue(entry['scope']).startsWith(`${path}:`))) {
    const scope = stringValue(item['scope']);
    const rule = stringValue(item['rule']);
    const declaration = stringValue(declarations.get(scope));
    const target = lines.findIndex((line) => line.trim().startsWith(declaration));
    assert.ok(
      stringValue(lines[target - 1])
        .trim()
        .startsWith(`${directive}-next-line ${rule} -- `),
      scope,
    );
    assert.ok(findings.has(`${oxlintCode(rule)}:${String(target + 1)}`), `${scope} no longer needs ${rule}`);
    assert.ok(stringValue(item['rationale']).length > 30);
    assert.ok(stringValue(item['evidence']).length > 30);
  }
  return directiveLines(lines).length;
}

await test('every lint exception is approved, exact, and still needed', async () => {
  const approved = (await exceptions()).filter((item) => item['rule'] !== auditRule);
  assert.deepEqual(
    approved.map((item) => item['scope']),
    [...declarations.keys()],
  );
  const paths = new Set(approved.map((item) => stringValue(stringValue(item['scope']).split(':')[0])));
  // Each file's copy is linted in its own temporary directory.
  const counts = await Promise.all([...paths].map((path) => checkedDirectives(path, approved)));
  const total = counts.reduce((sum, count) => sum + count, 0);
  assert.equal(total, approved.length, 'Each lint exception covers exactly one directive');
});

await test('the dependency audit has no exceptions', async () => {
  assert.deepEqual(
    (await exceptions()).filter((item) => item['rule'] === auditRule).map((item) => item['scope']),
    [],
  );
});
