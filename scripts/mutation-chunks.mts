import ts from 'typescript';

export interface LineRange {
  start: number;
  end: number;
}

// Split small, mutation-dense modules without cutting through syntax nodes:
// pieces end only after a top-level statement or class member, so no Stryker
// mutant spans two of them.
export const MAX_SHARD_LINES = 80;

function nodeEndLine(sourceFile: ts.SourceFile, node: ts.Node): number {
  return sourceFile.getLineAndCharacterOfPosition(node.end - 1).line + 1;
}

function safeCutLines(path: string, source: string, lineCount: number): number[] {
  // A line-range boundary inside a method can omit a multiline Stryker mutant.
  const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true);
  const cuts = new Set([lineCount]);
  for (const statement of sourceFile.statements) {
    cuts.add(nodeEndLine(sourceFile, statement));
    if (ts.isClassDeclaration(statement)) {
      for (const member of statement.members) {
        cuts.add(nodeEndLine(sourceFile, member));
      }
    }
  }
  return [...cuts].toSorted((left, right) => left - right);
}

// The longest piece that starts at `start`, ends on a safe cut, stays under
// MAX_SHARD_LINES, and fits the cost target; at least one statement or member.
function chunkEnd(
  cuts: readonly number[],
  start: number,
  fits: (start: number, end: number) => boolean,
): number | undefined {
  const preferred = cuts.filter((line) => line >= start && line < start + MAX_SHARD_LINES && fits(start, line));
  return preferred.at(-1) ?? cuts.find((line) => line >= start);
}

export function safeChunks(
  path: string,
  source: string,
  lineCount: number,
  fits: (start: number, end: number) => boolean,
): LineRange[] {
  const cuts = safeCutLines(path, source, lineCount);
  const chunks: LineRange[] = [];
  let start = 1;
  while (start <= lineCount) {
    const end = chunkEnd(cuts, start, fits);
    if (end === undefined) {
      throw new Error(`${path}: no safe mutation shard boundary after line ${String(start)}`);
    }
    chunks.push({ start, end });
    start = end + 1;
  }
  return chunks;
}
