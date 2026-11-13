import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import test from 'node:test';
import ts from 'typescript';
import { lint } from './oxlint-report.mts';
import { declarations } from './lint-exception-declarations.mts';
import { requireUnsuppressed, sourceComments } from './suppression-policy.mts';
import { array, record, stringValue } from './values.mts';

const root = dirname(import.meta.dirname);
const auditRule = 'pnpm audit';

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
  wholeFile: boolean;
}

async function exceptions(): Promise<Record<string, unknown>[]> {
  const content = await readFile(join(root, 'quality-exceptions.json'), 'utf8');
  return array(JSON.parse(content)).map((value) => record(value));
}

// The rules a directive names in its exact `-next-line <rule>, <rule> -- <reason>` form.
function directiveRules(text: string): string[] {
  if (/^\/\* oxlint-disable eslint\/max-lines -- \S.* \*\/$/u.test(text)) {
    return ['eslint/max-lines'];
  }
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
      return { line, rules: directiveRules(text), wholeFile: text.startsWith('/*') };
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
async function checkedDirectives(
  path: string,
  approved: readonly Exception[],
  suppliedSource?: string,
): Promise<number> {
  const source = suppliedSource ?? (await readFile(join(root, path), 'utf8'));
  const lines = source.split('\n');
  const found = directives(path, source);
  const findings = await lintWithoutDirectives(path, lines, found);
  for (const { rule, scope, declaration, rationale, evidence } of approved.filter((item) =>
    item.scope.startsWith(`${path}:`),
  )) {
    assert.ok(rationale.length > 30);
    assert.ok(evidence.length > 30);
    if (archivalFileException(rule, scope)) {
      assert.ok(
        found.some((item) => item.wholeFile && item.rules.length === 1 && item.rules[0] === rule),
        `${scope} needs its exact file directive`,
      );
      assert.ok(
        [...findings].some((finding) => finding.startsWith(`${oxlintCode(rule)}:`)),
        `${scope} no longer needs ${rule}`,
      );
      continue;
    }
    const target = exceptionTarget(path, source, lines, declaration);
    const covering = found.find((item) => !item.wholeFile && item.line === target - 1);
    assert.ok(covering?.rules.includes(rule) === true, `${scope} needs its ${rule} directive on the line before it`);
    assert.ok(findings.has(`${oxlintCode(rule)}:${String(target + 1)}`), `${scope} no longer needs ${rule}`);
  }
  return found.reduce((sum, item) => sum + item.rules.length, 0);
}

function exceptionTarget(path: string, source: string, lines: readonly string[], declaration: string): number {
  if (
    path === 'test/fixtures/published-openapi.d.ts' &&
    (declaration === 'CreateSandboxSessionRequest' || declaration === 'SandboxExecutionRequest')
  ) {
    const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
    const owner = file.statements.find(
      (node): node is ts.InterfaceDeclaration => ts.isInterfaceDeclaration(node) && node.name.text === 'components',
    );
    const schemas = owner?.members.find((node) => node.name?.getText(file) === 'schemas');
    if (schemas && ts.isPropertySignature(schemas) && schemas.type && ts.isTypeLiteralNode(schemas.type)) {
      const field = schemas.type.members.find((node) => node.name?.getText(file) === declaration);
      if (field) return file.getLineAndCharacterOfPosition(field.end - 1).line;
    }
    return -1;
  }
  return lines.findIndex((line) => line.trim().startsWith(declaration));
}

function archivalFileException(rule: string, scope: string): boolean {
  return (
    rule === 'eslint/max-lines' &&
    (scope === 'src/openapi-compatibility.ts:archivalContract' ||
      scope === 'test/fixtures/published-openapi.d.ts:baselineContract')
  );
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

await test('dependency audit exceptions name one advisory at one version', async () => {
  assert.deepEqual(
    (await exceptions()).filter((item) => item['rule'] === auditRule).map((item) => item['scope']),
    ['GHSA-gcqx-w48m-w2h4:deepmerge@4.3.1'],
  );
});

await test('archival directives stay bound to their exact path, rule and occurrence', async () => {
  await Promise.all(
    [
      ['src/openapi-compatibility.ts', 'src/openapi-compatibility.ts:archivalContract'],
      ['test/fixtures/published-openapi.d.ts', 'test/fixtures/published-openapi.d.ts:baselineContract'],
    ].map(async ([pathValue, scopeValue]) => {
      const path = stringValue(pathValue);
      const scope = stringValue(scopeValue);
      const source = await readFile(join(root, path), 'utf8');
      const directive = sourceComments(path, source).find(({ text }) => text.startsWith('/* oxlint-disable'))?.text;
      assert.ok(directive !== undefined);
      requireUnsuppressed(path, source);
      assert.throws(() => {
        requireUnsuppressed('src/unrelated-archive.ts', source);
      });
      assert.throws(() => {
        requireUnsuppressed(path, source.replace('eslint/max-lines --', 'eslint/max-lines, eslint/no-undef --'));
      });
      assert.throws(() => {
        requireUnsuppressed(path, source + '\n' + directive);
      });
      const registered = (await exceptions()).find((entry) => entry['scope'] === scope);
      assert.ok(registered);
      const approval: Exception = {
        rule: 'eslint/max-lines',
        scope,
        declaration: '[archival file]',
        rationale: stringValue(registered['rationale']),
        evidence: stringValue(registered['evidence']),
      };
      await assert.rejects(
        checkedDirectives(path, [approval], directive + '\nexport type Archive = never;\n'),
        /no longer needs/u,
      );
    }),
  );
});
