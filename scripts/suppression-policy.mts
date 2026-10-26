import assert from 'node:assert/strict';
import ts from 'typescript';

// Exact directives for the exceptions approved in quality-exceptions.json.
const approvedComments = new Map([
  [
    'src/index.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-redeclare -- The published runtime value and public type share this name.',
    ]),
  ],
  [
    'src/volcano-fetch.ts',
    new Set([
      "// oxlint-disable-next-line unicorn/prefer-number-coercion -- Retry-After keeps parseInt's leading-integer parsing.",
    ]),
  ],
  [
    'scripts/jest-completeness.cts',
    new Set([
      "// oxlint-disable-next-line eslint/require-unicode-regexp -- Select tests exactly as Jest's own name filter does.",
    ]),
  ],
  [
    'src/database-query.ts',
    new Set(['// oxlint-disable-next-line unicorn/no-thenable -- Awaiting a query builder runs the query.']),
  ],
  [
    'src/database-mutations.ts',
    new Set(['// oxlint-disable-next-line unicorn/no-thenable -- Awaiting a mutation builder runs the mutation.']),
  ],
  [
    '__tests__/durable-messages-subscribe-handlers.test.ts',
    new Set([
      "// oxlint-disable-next-line unicorn/no-thenable -- Delivery must adopt a handler's non-Promise thenable.",
    ]),
  ],
]);

export function requireUnsuppressed(path: string, source: string): void {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, false, ts.LanguageVariant.JSX, source);
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token !== ts.SyntaxKind.SingleLineCommentTrivia && token !== ts.SyntaxKind.MultiLineCommentTrivia) {
      continue;
    }
    requireAllowedComment(path, scanner.getTokenText());
  }
}

function requireAllowedComment(path: string, comment: string): void {
  if (approvedComments.get(path)?.has(comment) === true) {
    return;
  }
  const forbidden =
    /(?:es|ox)lint-(?:disable|enable)|eslint\s|@ts-ignore|@ts-nocheck|(?:istanbul|[cv]8|nyc) ignore|Stryker (?:disable|restore)|(?:prettier|oxfmt)-ignore/u;
  assert.doesNotMatch(comment, forbidden, `${path} suppresses a quality check`);
  if (path.startsWith('test/types/') && comment.includes('@ts-expect-error')) {
    assert.match(comment, /^\/\/\s*@ts-expect-error\s+\S/u, `${path} needs an expected-error rationale`);
    return;
  }
  assert.doesNotMatch(comment, /@ts-expect-error/u, `${path} suppresses a quality check`);
}
