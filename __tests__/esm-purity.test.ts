import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';
import * as ts from 'typescript';

// Regression guard for VOL-505.
//
// The SDK ships an ES module build (dist/*.esm.mjs) that bundlers inline into
// consumer output. If an entry source hand-rolls CommonJS/UMD/global exports
// (`module.exports = VolcanoAuth`, `window.* = ...`, AMD `define(...)`), rollup
// passes those statements straight through into the ES build (it only rewrites
// real `import`/`export` declarations). A stray top-level `module.exports =
// VolcanoAuth` in dist/index.esm.mjs then runs when esbuild bundles the SDK
// into a function (`esbuild --bundle --format=cjs`) and OVERWRITES that
// bundle's own `module.exports = { handler }` — the Model B "handler is not a
// function" failure VOL-505 describes. (The browser/UMD global is provided by
// a `footer` on the UMD output in rollup.config.mjs, scoped to dist/index.js
// only, so it never reaches the ES builds.)
//
// Two layers of guard:
//  1. Entry sources must be authored as pure ES modules.
//  2. The built ES artifacts must be format-pure (also catches a bad
//     rollup/plugin/config change that injects impurity without touching a
//     source file — the residual gap a source-only scan leaves).
const ROOT = join(__dirname, '..');
const SOURCES = ['src/index.ts', 'src/realtime.ts', 'src/durable.ts', 'src/next/middleware.ts'];
const ESM_BUILDS = [
  'dist/index.esm.mjs',
  'dist/realtime.esm.mjs',
  'dist/durable.esm.mjs',
  'dist/next/middleware.esm.mjs',
];

function isCommonJsExport(node: ts.Node): boolean {
  return (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === 'module' &&
    node.name.text === 'exports'
  );
}

function isBrowserGlobalAssignment(node: ts.Node): boolean {
  return (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
    ts.isPropertyAccessExpression(node.left) &&
    ts.isIdentifier(node.left.expression) &&
    node.left.expression.text === 'window'
  );
}

function isAmdDefinition(node: ts.Node): boolean {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) {
    return false;
  }
  const firstArgument = node.arguments[0];
  return (
    node.expression.text === 'define' &&
    firstArgument !== undefined &&
    ts.isArrayLiteralExpression(firstArgument)
  );
}

function forbiddenExports(code: string, fileName: string): string[] {
  const source = ts.createSourceFile(
    fileName,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const findings: string[] = [];

  function visit(node: ts.Node): void {
    if (isCommonJsExport(node) || isBrowserGlobalAssignment(node) || isAmdDefinition(node)) {
      findings.push(node.getText(source));
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return findings;
}

test.each(['module.exports = sdk;', 'window.Volcano = sdk;', 'define([], factory);'])(
  'rejects foreign module exports: %s',
  (code) => {
    expect(forbiddenExports(code, 'probe.js')).not.toEqual([]);
  },
);

test('ignores export-like text inside comments and strings', () => {
  const code =
    '// module.exports = sdk\nconst note = "window.Volcano = sdk; define([], factory);";';
  expect(forbiddenExports(code, 'probe.js')).toEqual([]);
});

describe('VOL-505: SDK ES output carries no CJS/UMD/global export statements', () => {
  test('legacy source-path shim delegates only to the built CJS entrypoint', () => {
    const statements = readFileSync(join(ROOT, 'src/index.js'), 'utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '' && !line.trim().startsWith('//'));
    expect(statements).toEqual(["module.exports = require('../dist/index.js');"]);
  });

  describe('entry sources are pure ES modules', () => {
    for (const rel of SOURCES) {
      test(`${rel} hand-rolls no CJS/UMD export statements`, () => {
        expect(forbiddenExports(readFileSync(join(ROOT, rel), 'utf8'), rel)).toEqual([]);
      });
    }
  });

  describe('built ES artifacts are format-pure', () => {
    for (const rel of ESM_BUILDS) {
      test(`${rel} contains no module.exports / window.* = / define([`, () => {
        expect(forbiddenExports(readFileSync(join(ROOT, rel), 'utf8'), rel)).toEqual([]);
      });
    }
  });
});
