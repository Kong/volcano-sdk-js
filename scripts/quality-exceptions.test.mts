import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { lint } from './oxlint-report.mts';
import { sourceComments } from './suppression-policy.mts';
import { array, record, stringValue } from './values.mts';

const root = fileURLToPath(new URL('..', import.meta.url));
const auditRule = 'pnpm audit';
// Each approved lint exception, in quality-exceptions.json's order, and the declaration its directive must precede.
const declarations: [string, string][] = [
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
  ['examples/nextjs-notes-app/src/app/layout.tsx:RootLayout', "import './globals.css'"],
  ['examples/nextjs-notes-app/src/components/NoteCardEditor.tsx:NoteCardEditor', 'autoFocus'],
  ['examples/nextjs-notes-app/src/components/NoteEditorForm.tsx:NoteEditorForm', 'autoFocus'],
  [
    'examples/nextjs-notes-app/src/components/useNoteEditor.ts:useNoteEditor.handleSubmit',
    '[title, content, onCreate]',
  ],
  ['src/volcano-fetch.ts:volcanoFetch', 'return { data, status: response.status, headers: response.headers } as T'],
  ['src/sdk-public-types-functions.ts:Functions.invoke', 'invoke<TPayload = JsonValue, TResult = unknown>('],
  ['src/sdk-public-types-durable.ts:Durable.start', 'start<TInput = JsonValue>('],
  ['src/volcano-auth-facades.ts:authApi.signUpAnonymous', 'signUpAnonymous: client.signUpAnonymous.bind(client)'],
  ['src/volcano-auth-facades.ts:authApi.forgotPassword', 'forgotPassword: client.forgotPassword.bind(client)'],
  ['src/volcano-auth-facades.ts:providerRedirect', 'return start;'],
  ['scripts/audit-dependencies.mts:run', 'const run = promisify(execFile);'],
  ['scripts/dependency-audit.test.mts:run', 'const run = promisify(execFile);'],
  ['scripts/test-package-quickstart.mts:run', 'const run = promisify(execFile);'],
  ['test/fixtures/published-api/durable.d.ts:Functions.invoke', 'invoke<TPayload = JsonValue, TResult = unknown>('],
  ['test/fixtures/published-api/durable.d.ts:Durable.start', 'start<TInput = JsonValue>('],
  ['test/fixtures/public-api-compatibility.d.ts:Exact', 'export type Exact<A, B> ='],
  [
    'test/fixtures/public-api-compatibility.d.ts:PublishedTypes.InsertBuilder',
    'Exact<Expected.InsertBuilder, Actual.InsertBuilder>',
  ],
  [
    'test/fixtures/public-api-compatibility.d.ts:PublishedTypes.UpdateBuilder',
    'Exact<Expected.UpdateBuilder, Actual.UpdateBuilder>',
  ],
  [
    'test/fixtures/public-api-compatibility.d.ts:PublishedTypes.DeleteBuilder',
    'Exact<Expected.DeleteBuilder, Actual.DeleteBuilder>',
  ],
  [
    'test/fixtures/public-api-compatibility.d.ts:EsmPublishedTypes.InsertBuilder',
    'Exact<Expected.InsertBuilder, ESM.InsertBuilder>',
  ],
  [
    'test/fixtures/public-api-compatibility.d.ts:EsmPublishedTypes.UpdateBuilder',
    'Exact<Expected.UpdateBuilder, ESM.UpdateBuilder>',
  ],
  [
    'test/fixtures/public-api-compatibility.d.ts:EsmPublishedTypes.DeleteBuilder',
    'Exact<Expected.DeleteBuilder, ESM.DeleteBuilder>',
  ],
  [
    'examples/durable-order-pipeline/volcano/functions/orders-api/index.js:submitOrder',
    'unwrap(await insertOrderItem(volcano, order, item));',
  ],
];

interface Exception {
  rule: string;
  scope: string;
  declaration: string;
  rationale: string;
  evidence: string;
}

interface Directive {
  // Zero-based line the directive sits on.
  line: number;
  rules: string[];
}

async function exceptions(): Promise<Record<string, unknown>[]> {
  const content = await readFile(join(root, 'quality-exceptions.json'), 'utf8');
  return array(JSON.parse(content)).map((value) => record(value));
}

// The rules a directive names in its exact `-next-line <rule>, <rule> -- <reason>` form.
function directiveRules(text: string): string[] {
  const match = /^\/\/ oxlint-disable-next-line (?<rules>[\w/-]+(?:, [\w/-]+)*) -- \S/u.exec(text);
  assert.ok(match?.groups !== undefined, `${text} is not an exact directive`);
  return stringValue(match.groups['rules']).split(', ');
}

// Counts the comments the scanner finds rather than line prefixes, so no directive hides in a trailing comment.
function directives(path: string, source: string): Directive[] {
  return sourceComments(path, source)
    .filter(({ text }) => text.includes('oxlint-disable'))
    .map(({ text, line, alone }) => {
      assert.ok(alone, `${path}:${String(line + 1)} shares its line with a directive`);
      return { line, rules: directiveRules(text) };
    });
}

async function lintWithoutDirectives(
  path: string,
  lines: readonly string[],
  found: readonly Directive[],
): Promise<Set<string>> {
  // Lint a copy beside the original so its relative imports, type information, ignore patterns, and scope still apply.
  const copy = join(root, dirname(path), `quality-fixture-${randomUUID()}-${basename(path)}`);
  try {
    const stripped = lines.map((line, index) => (found.some((item) => item.line === index) ? '//' : line));
    await writeFile(copy, stripped.join('\n'));
    return new Set(lint([copy]).findings.map(({ code, line }) => `${code}:${String(line)}`));
  } finally {
    await rm(copy, { force: true });
  }
}

function oxlintCode(rule: string): string {
  const [plugin, name] = rule.split('/');
  return `${stringValue(plugin)}(${stringValue(name)})`;
}

// Checks every exception approved in `path` and answers how many rules the file's directives name.
async function checkedDirectives(path: string, approved: readonly Exception[]): Promise<number> {
  const source = await readFile(join(root, path), 'utf8');
  const lines = source.split('\n');
  const found = directives(path, source);
  const findings = await lintWithoutDirectives(path, lines, found);
  for (const { rule, scope, declaration, rationale, evidence } of approved.filter((item) =>
    item.scope.startsWith(`${path}:`),
  )) {
    const target = lines.findIndex((line) => line.trim().startsWith(declaration));
    const covering = found.find((item) => item.line === target - 1);
    assert.ok(covering?.rules.includes(rule) === true, `${scope} needs its ${rule} directive on the line before it`);
    assert.ok(findings.has(`${oxlintCode(rule)}:${String(target + 1)}`), `${scope} no longer needs ${rule}`);
    assert.ok(rationale.length > 30);
    assert.ok(evidence.length > 30);
  }
  return found.reduce((sum, item) => sum + item.rules.length, 0);
}

await test('every lint exception is approved, exact, and still needed', async () => {
  const entries = (await exceptions()).filter((item) => item['rule'] !== auditRule);
  assert.deepEqual(
    entries.map((item) => item['scope']),
    declarations.map(([scope]) => scope),
  );
  const approved = entries.map((item, index) => ({
    rule: stringValue(item['rule']),
    scope: stringValue(item['scope']),
    declaration: stringValue(declarations[index]?.[1]),
    rationale: stringValue(item['rationale']),
    evidence: stringValue(item['evidence']),
  }));
  const paths = new Set(approved.map(({ scope }) => stringValue(scope.split(':')[0])));
  // Each file's copy is linted on its own.
  const counts = await Promise.all([...paths].map((path) => checkedDirectives(path, approved)));
  const total = counts.reduce((sum, count) => sum + count, 0);
  assert.equal(total, approved.length, 'Each lint exception covers exactly one rule in one directive');
});

await test('the dependency audit has no exceptions', async () => {
  assert.deepEqual(
    (await exceptions()).filter((item) => item['rule'] === auditRule).map((item) => item['scope']),
    [],
  );
});
