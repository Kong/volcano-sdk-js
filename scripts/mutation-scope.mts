import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

interface LineRange {
  start: number;
  end: number;
}

interface MutationShard {
  patterns: string[];
  weight: number;
}

interface SourceGroup {
  path: string;
  patterns: string[];
  lines: Set<number>;
  source: string;
  lineCount: number;
}

// Stryker accepts file/line ranges but has no native CI shard selector.
// Split small, mutation-dense modules without cutting through syntax nodes.
const MAX_SHARD_LINES = 80;
export const mutationShardCount = 32;
function handwrittenRuntime(path: string): boolean {
  return (
    /^src\/.+\.(?:js|ts)$/.test(path) &&
    !path.endsWith('.d.ts') &&
    !path.startsWith('src/generated/') &&
    !path.startsWith('src/generated-runtime/')
  );
}

export function mutationPatterns(paths: readonly string[]): string[] {
  return [...new Set(paths.filter((path) => handwrittenRuntime(path) && existsSync(path)))].sort(
    (left, right) => left.localeCompare(right),
  );
}

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
  return [...cuts].sort((left, right) => left - right);
}

function safeChunks(path: string, source: string, lineCount: number): LineRange[] {
  const cuts = safeCutLines(path, source, lineCount);
  const chunks: LineRange[] = [];
  let start = 1;
  while (start <= lineCount) {
    const preferred = cuts.filter((line) => line >= start && line < start + MAX_SHARD_LINES);
    const end = preferred.at(-1) ?? cuts.find((line) => line >= start);
    if (end === undefined) {
      throw new Error(`${path}: no safe mutation shard boundary after line ${String(start)}`);
    }
    chunks.push({ start, end });
    start = end + 1;
  }
  return chunks;
}

function selectedRanges(
  path: string,
  lines: ReadonlySet<number>,
  start: number,
  end: number,
): MutationShard {
  const selected = [...lines].filter((line) => line >= start && line <= end).sort((a, b) => a - b);
  const ranges: string[] = [];
  let current: LineRange | undefined;
  for (const line of selected) {
    if (current === undefined) {
      current = { start: line, end: line };
    } else if (line > current.end + 1) {
      ranges.push(`${path}:${String(current.start)}-${String(current.end)}`);
      current = { start: line, end: line };
    }
    current.end = line;
  }
  if (current !== undefined) {
    ranges.push(`${path}:${String(current.start)}-${String(current.end)}`);
  }
  return { patterns: ranges, weight: selected.length };
}

function shardItems(group: SourceGroup): MutationShard[] {
  if (group.lines.size <= MAX_SHARD_LINES) {
    return [{ patterns: group.patterns, weight: group.lines.size }];
  }
  return safeChunks(group.path, group.source, group.lineCount)
    .map(({ start, end }) => selectedRanges(group.path, group.lines, start, end))
    .filter((item) => item.weight > 0);
}

function validateShardSelection(shardIndex: number, shardCount: number): void {
  const invalid = [
    !Number.isInteger(shardIndex),
    !Number.isInteger(shardCount),
    shardCount < 1,
    shardIndex < 0,
    shardIndex >= shardCount,
  ];
  if (invalid.includes(true)) {
    throw new Error('Invalid mutation shard index or count');
  }
}

function parsePattern(pattern: string): {
  path: string;
  first: string | undefined;
  last: string | undefined;
} {
  const match = /^(src\/.+\.(?:js|ts))(?::(\d+)-(\d+))?$/.exec(pattern);
  const path = match?.[1];
  if (path === undefined) {
    throw new Error(`Invalid mutation pattern: ${pattern}`);
  }
  return { path, first: match?.[2], last: match?.[3] };
}

function patternBounds(
  first: string | undefined,
  last: string | undefined,
  lineCount: number,
): LineRange {
  return { start: Number(first ?? 1), end: Number(last ?? lineCount) };
}

function addPatternGroup(groups: Map<string, SourceGroup>, pattern: string): void {
  const { path, first, last } = parsePattern(pattern);
  const source = readFileSync(path, 'utf8');
  const lineCount =
    source.split('\n').length - Number(source.endsWith('\n')) - Number(source.length === 0);
  const { start, end } = patternBounds(first, last, lineCount);
  const invalidRange = [start < 1, end < start, end > lineCount];
  if (invalidRange.includes(true)) {
    throw new Error(`Invalid mutation range: ${pattern}`);
  }
  const group = groups.get(path) ?? {
    path,
    patterns: [],
    lines: new Set<number>(),
    source,
    lineCount,
  };
  group.patterns.push(pattern);
  for (let line = start; line <= end; line += 1) {
    group.lines.add(line);
  }
  groups.set(path, group);
}

function firstPattern(shard: MutationShard): string {
  const first = shard.patterns[0];
  if (first === undefined) {
    throw new Error('Mutation shard item contains no pattern');
  }
  return first;
}

function lightestShard(shards: readonly MutationShard[]): MutationShard {
  let target = shards[0];
  if (target === undefined) {
    throw new Error('No mutation shards were configured');
  }
  for (const shard of shards.slice(1)) {
    if (shard.weight < target.weight) {
      target = shard;
    }
  }
  return target;
}

function distributeShardItems(
  groups: ReadonlyMap<string, SourceGroup>,
  shardCount: number,
): MutationShard[] {
  const shards: MutationShard[] = Array.from({ length: shardCount }, () => ({
    patterns: [],
    weight: 0,
  }));
  const ordered = [...groups.values()]
    .flatMap((group) => shardItems(group))
    .sort((left, right) => {
      const weightOrder = right.weight - left.weight;
      return weightOrder !== 0
        ? weightOrder
        : firstPattern(left).localeCompare(firstPattern(right));
    });
  for (const item of ordered) {
    const target = lightestShard(shards);
    target.patterns.push(...item.patterns);
    target.weight += item.weight;
  }
  return shards;
}

export function shardMutationPatterns(
  patterns: readonly string[],
  shardIndex: number,
  shardCount: number,
): string[] {
  validateShardSelection(shardIndex, shardCount);
  const groups = new Map<string, SourceGroup>();
  for (const pattern of patterns) {
    addPatternGroup(groups, pattern);
  }
  const shards = distributeShardItems(groups, shardCount);
  const selected = shards[shardIndex];
  if (selected === undefined || selected.patterns.length === 0) {
    throw new Error(
      `Mutation shard ${String(shardIndex)}/${String(shardCount)} selected no source`,
    );
  }
  return selected.patterns;
}
