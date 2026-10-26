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
  [
    'src/durable-platform-request.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each retry waits out its backoff after the previous attempt failed.',
      '// oxlint-disable-next-line eslint/no-await-in-loop -- A retry is sent only once the previous attempt has failed.',
    ]),
  ],
  [
    'src/durable-message-stream.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each page starts after the last message the previous page delivered.',
    ]),
  ],
  [
    'src/storage-file-objects.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Delete one path at a time so a long list never bursts the API.',
    ]),
  ],
  [
    'src/storage-resumable.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Parts upload in order, and the first failure aborts the session.',
    ]),
  ],
  [
    'src/volcano-auth.ts',
    new Set([
      '// oxlint-disable-next-line import/max-dependencies -- VolcanoAuth composes one module per public sub-API.',
    ]),
  ],
  [
    'scripts/property-policy.test.mts',
    new Set([
      "// oxlint-disable-next-line import/max-dependencies -- This end-to-end test drives Babel, Jest, and Node's process APIs.",
    ]),
  ],
  [
    'scripts/typescript-policy.test.mts',
    new Set([
      '// oxlint-disable-next-line import/max-dependencies -- This test checks every tracked file against each native tool.',
    ]),
  ],
  [
    '__tests__/durable-message-runtime.test.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- 50 turns in sequence let a replayed session resolve before `second`.',
    ]),
  ],
  [
    '__tests__/durable-messages-subscribe-retries.test.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Fake time must advance step by step to observe each backoff delay.',
    ]),
  ],
  [
    '__tests__/support/durable-messages-realtime.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Polls once per event-loop turn; the next check must follow this turn.',
    ]),
  ],
  [
    '__tests__/functions-http.test.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each repeat must follow the cached first resolve.',
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each retry must follow the cached failed resolve.',
    ]),
  ],
  [
    '__tests__/realtime-channel-lifecycle-presence.test.ts',
    new Set([
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each refresh advances the shared fake clock before the next.',
    ]),
  ],
  [
    '__tests__/errors.test.ts',
    new Set([
      "// oxlint-disable-next-line eslint/no-extend-native -- Only a getter on a primitive's prototype can observe the receiver.",
    ]),
  ],
  [
    'examples/nextjs-notes-app/src/app/layout.js',
    new Set([
      '// oxlint-disable-next-line import/no-unassigned-import -- Next.js loads global CSS only by a side-effect import.',
    ]),
  ],
  [
    'examples/nextjs-notes-app/src/components/NoteCardEditor.js',
    new Set([
      '// oxlint-disable-next-line jsx-a11y/no-autofocus -- The Edit button that had focus unmounts as this opens.',
    ]),
  ],
  [
    'examples/nextjs-notes-app/src/components/NoteEditorForm.js',
    new Set([
      '// oxlint-disable-next-line jsx-a11y/no-autofocus -- The button that had focus unmounts as this form opens.',
    ]),
  ],
  [
    'examples/nextjs-notes-app/src/components/useNoteEditor.js',
    new Set(['// oxlint-disable-next-line react/memo-dependencies -- The rule misses onCreate inside try/finally.']),
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
