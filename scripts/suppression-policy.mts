import assert from 'node:assert/strict';
import ts from 'typescript';

// Exact directives for the exceptions approved in quality-exceptions.json, each listed once per place it is
// approved. Each must sit alone on its line, so a copy cannot ride along as a trailing comment.
const approvedComments = new Map<string, readonly string[]>([
  [
    'src/index.ts',
    [
      '// oxlint-disable-next-line eslint/no-redeclare -- The published runtime value and public type share this name.',
      '// oxlint-disable-next-line eslint/no-redeclare -- The published runtime value and public type share this name.',
    ],
  ],
  [
    'src/volcano-fetch.ts',
    [
      "// oxlint-disable-next-line unicorn/prefer-number-coercion -- Retry-After keeps parseInt's leading-integer parsing.",
      "// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Orval's generated callers name the response type.",
    ],
  ],
  [
    'scripts/jest-completeness.cts',
    [
      "// oxlint-disable-next-line eslint/require-unicode-regexp -- Select tests exactly as Jest's own name filter does.",
    ],
  ],
  [
    'src/database-query.ts',
    ['// oxlint-disable-next-line unicorn/no-thenable -- Awaiting a query builder runs the query.'],
  ],
  [
    'src/database-mutations.ts',
    ['// oxlint-disable-next-line unicorn/no-thenable -- Awaiting a mutation builder runs the mutation.'],
  ],
  [
    '__tests__/durable-messages-subscribe-handlers.test.ts',
    ["// oxlint-disable-next-line unicorn/no-thenable -- Delivery must adopt a handler's non-Promise thenable."],
  ],
  [
    'src/durable-platform-request.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each retry waits out its backoff after the previous attempt failed.',
      '// oxlint-disable-next-line eslint/no-await-in-loop -- A retry is sent only once the previous attempt has failed.',
    ],
  ],
  [
    'src/durable-message-stream.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each page starts after the last message the previous page delivered.',
    ],
  ],
  [
    'src/storage-file-objects.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Delete one path at a time so a long list never bursts the API.',
    ],
  ],
  [
    'src/storage-resumable.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Parts upload in order, and the first failure aborts the session.',
    ],
  ],
  [
    'src/volcano-auth.ts',
    ['// oxlint-disable-next-line import/max-dependencies -- VolcanoAuth composes one module per public sub-API.'],
  ],
  [
    'scripts/property-policy.test.mts',
    [
      "// oxlint-disable-next-line import/max-dependencies -- This end-to-end test drives Babel, Jest, and Node's process APIs.",
    ],
  ],
  [
    'scripts/typescript-policy.test.mts',
    [
      '// oxlint-disable-next-line import/max-dependencies -- This test checks every tracked file against each native tool.',
    ],
  ],
  [
    '__tests__/durable-message-runtime.test.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- 50 turns in sequence let a replayed session resolve before `second`.',
    ],
  ],
  [
    '__tests__/durable-messages-subscribe-retries.test.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Fake time must advance step by step to observe each backoff delay.',
    ],
  ],
  [
    '__tests__/support/durable-messages-realtime.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Polls once per event-loop turn; the next check must follow this turn.',
    ],
  ],
  [
    '__tests__/functions-http.test.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each repeat must follow the cached first resolve.',
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each retry must follow the cached failed resolve.',
    ],
  ],
  [
    '__tests__/realtime-channel-lifecycle-presence.test.ts',
    [
      '// oxlint-disable-next-line eslint/no-await-in-loop -- Each refresh advances the shared fake clock before the next.',
    ],
  ],
  [
    '__tests__/errors.test.ts',
    [
      "// oxlint-disable-next-line eslint/no-extend-native -- Only a getter on a primitive's prototype can observe the receiver.",
    ],
  ],
  [
    'examples/nextjs-notes-app/src/app/layout.tsx',
    [
      '// oxlint-disable-next-line import/no-unassigned-import -- Next.js loads global CSS only by a side-effect import.',
    ],
  ],
  [
    'examples/nextjs-notes-app/src/components/NoteCardEditor.tsx',
    ['// oxlint-disable-next-line jsx-a11y/no-autofocus -- The Edit button that had focus unmounts as this opens.'],
  ],
  [
    'examples/nextjs-notes-app/src/components/NoteEditorForm.tsx',
    ['// oxlint-disable-next-line jsx-a11y/no-autofocus -- The button that had focus unmounts as this form opens.'],
  ],
  [
    'examples/nextjs-notes-app/src/components/useNoteEditor.ts',
    ['// oxlint-disable-next-line react/memo-dependencies -- The rule misses onCreate inside try/finally.'],
  ],
  [
    'src/sdk-public-types-functions.ts',
    [
      '// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Callers may name the payload type they send.',
    ],
  ],
  [
    'src/sdk-public-types-durable.ts',
    [
      '// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Callers may name the input type they send.',
    ],
  ],
  [
    'src/volcano-auth-facades.ts',
    [
      '// oxlint-disable-next-line typescript/no-deprecated -- Auth publishes this alias until the next major release.',
      '// oxlint-disable-next-line typescript/no-deprecated -- Auth publishes this alias until the next major release.',
      '// oxlint-disable-next-line typescript/strict-void-return -- JavaScript callers still receive the redirect URL.',
    ],
  ],
  [
    'scripts/audit-dependencies.mts',
    [
      "// oxlint-disable-next-line typescript/strict-void-return -- promisify's custom overload resolves execFile's { stdout, stderr }.",
    ],
  ],
  [
    'scripts/dependency-audit.test.mts',
    [
      "// oxlint-disable-next-line typescript/strict-void-return -- promisify's custom overload resolves execFile's { stdout, stderr }.",
    ],
  ],
  [
    'scripts/test-package-quickstart.mts',
    [
      "// oxlint-disable-next-line typescript/strict-void-return -- promisify's custom overload resolves execFile's { stdout, stderr }.",
    ],
  ],
  [
    'test/fixtures/published-api/durable.d.ts',
    [
      '// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- The published signature lets callers name these types.',
      '// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- The published signature lets callers name these types.',
    ],
  ],
  [
    'test/fixtures/public-api-compatibility.d.ts',
    [
      '// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Each generic signature compares one type exactly.',
      '// oxlint-disable-next-line typescript/no-deprecated -- The deprecated builder aliases stay published until the next major release.',
      '// oxlint-disable-next-line typescript/no-deprecated -- The deprecated builder aliases stay published until the next major release.',
      '// oxlint-disable-next-line typescript/no-deprecated -- The deprecated builder aliases stay published until the next major release.',
      '// oxlint-disable-next-line typescript/no-deprecated -- The deprecated builder aliases stay published until the next major release.',
      '// oxlint-disable-next-line typescript/no-deprecated -- The deprecated builder aliases stay published until the next major release.',
      '// oxlint-disable-next-line typescript/no-deprecated -- The deprecated builder aliases stay published until the next major release.',
    ],
  ],
]);

interface SourceComment {
  text: string;
  // Zero-based line the comment starts on.
  line: number;
  // Whether only whitespace shares the comment's lines.
  alone: boolean;
}

function sourceComment(file: ts.SourceFile, range: ts.CommentRange): SourceComment {
  const { text } = file;
  const lineStart = text.lastIndexOf('\n', range.pos - 1) + 1;
  const lineEnd = text.indexOf('\n', range.end);
  const rest = lineEnd === -1 ? text.slice(range.end) : text.slice(range.end, lineEnd);
  return {
    text: text.slice(range.pos, range.end),
    line: file.getLineAndCharacterOfPosition(range.pos).line,
    alone: text.slice(lineStart, range.pos).trim() === '' && rest.trim() === '',
  };
}

function isJsDoc(node: ts.Node): boolean {
  return node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode;
}

function isTriviaToken(file: ts.SourceFile, node: ts.Node): boolean {
  return node.kind !== ts.SyntaxKind.JsxText && node.getChildCount(file) === 0;
}

// The comments in a token's trivia: TypeScript counts those before its first line break as trailing the token
// before it, and the rest as leading.
function triviaComments(text: string, position: number): ts.CommentRange[] {
  return [
    ...(ts.getTrailingCommentRanges(text, position) ?? []),
    ...(ts.getLeadingCommentRanges(text, position) ?? []),
  ];
}

// Every comment lies in the trivia before some token, so walking parsed tokens finds comments that a raw scan
// reads as template or regular expression text. JSDoc nodes lie inside a comment, and JSX text has no trivia.
function collectComments(file: ts.SourceFile, node: ts.Node, ranges: Map<number, ts.CommentRange>): void {
  if (isTriviaToken(file, node)) {
    for (const range of triviaComments(file.text, node.getFullStart())) {
      ranges.set(range.pos, range);
    }
  }
  for (const child of node.getChildren(file).filter((item) => !isJsDoc(item))) {
    collectComments(file, child, ranges);
  }
}

export function sourceComments(path: string, source: string): SourceComment[] {
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const ranges = new Map<number, ts.CommentRange>();
  collectComments(file, file, ranges);
  return [...ranges.values()]
    .toSorted((left, right) => left.pos - right.pos)
    .map((range) => sourceComment(file, range));
}

export function requireUnsuppressed(path: string, source: string): void {
  const expected = approvedComments.get(path) ?? [];
  const approved: string[] = [];
  for (const { text, alone } of sourceComments(path, source)) {
    if (expected.includes(text)) {
      assert.ok(alone, `${path} shares a line with an approved directive`);
      approved.push(text);
      continue;
    }
    requireAllowedComment(path, text);
  }
  assert.deepEqual(
    approved.toSorted(),
    expected.toSorted(),
    `${path} must hold each approved directive once per approval`,
  );
}

function requireAllowedComment(path: string, comment: string): void {
  const forbidden =
    /(?:es|ox)lint-(?:disable|enable)|eslint\s|@ts-ignore|@ts-nocheck|(?:istanbul|[cv]8|nyc) ignore|Stryker (?:disable|restore)|(?:prettier|oxfmt)-ignore/u;
  assert.doesNotMatch(comment, forbidden, `${path} suppresses a quality check`);
  if (path.startsWith('test/types/') && comment.includes('@ts-expect-error')) {
    assert.match(comment, /^\/\/\s*@ts-expect-error\s+\S/u, `${path} needs an expected-error rationale`);
    return;
  }
  assert.doesNotMatch(comment, /@ts-expect-error/u, `${path} suppresses a quality check`);
}
