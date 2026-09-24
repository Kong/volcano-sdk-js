import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

// Small, mutation-dense modules must also split across CI jobs.
const MAX_SHARD_LINES = 80;
export const mutationShardCount = 16;
function handwrittenRuntime(path) {
  return (
    /^src\/.+\.(?:js|ts)$/.test(path) &&
    !path.endsWith('.d.ts') &&
    !path.startsWith('src/generated/') &&
    !path.startsWith('src/generated-runtime/')
  );
}

export function mutationPatterns(paths) {
  return [...new Set(paths.filter((path) => handwrittenRuntime(path) && existsSync(path)))].sort();
}

function nodeEndLine(sourceFile, node) {
  return sourceFile.getLineAndCharacterOfPosition(node.end - 1).line + 1;
}

function safeCutLines(path, source, lineCount) {
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

function safeChunks(path, source, lineCount) {
  const cuts = safeCutLines(path, source, lineCount);
  const chunks = [];
  let start = 1;
  while (start <= lineCount) {
    const preferred = cuts.filter((line) => line >= start && line < start + MAX_SHARD_LINES);
    const end = preferred.at(-1) ?? cuts.find((line) => line >= start);
    if (end === undefined) {
      throw new Error(`${path}: no safe mutation shard boundary after line ${start}`);
    }
    chunks.push({ start, end });
    start = end + 1;
  }
  return chunks;
}

function selectedRanges(path, lines, start, end) {
  const selected = [...lines].filter((line) => line >= start && line <= end).sort((a, b) => a - b);
  const ranges = [];
  let first;
  let last;
  for (const line of selected) {
    if (first === undefined) {
      first = line;
    } else if (line > last + 1) {
      ranges.push(`${path}:${first}-${last}`);
      first = line;
    }
    last = line;
  }
  if (first !== undefined) {
    ranges.push(`${path}:${first}-${last}`);
  }
  return { patterns: ranges, weight: selected.length };
}

function shardItems(group) {
  if (group.lines.size <= MAX_SHARD_LINES) {
    return [{ patterns: group.patterns, weight: group.lines.size }];
  }
  return safeChunks(group.path, group.source, group.lineCount)
    .map(({ start, end }) => selectedRanges(group.path, group.lines, start, end))
    .filter((item) => item.weight > 0);
}

export function shardMutationPatterns(patterns, shardIndex, shardCount) {
  if (
    !Number.isInteger(shardIndex) ||
    !Number.isInteger(shardCount) ||
    shardCount < 1 ||
    shardIndex < 0 ||
    shardIndex >= shardCount
  ) {
    throw new Error('Invalid mutation shard index or count');
  }

  const groups = new Map();
  for (const pattern of patterns) {
    const match = /^(src\/.+\.(?:js|ts))(?::(\d+)-(\d+))?$/.exec(pattern);
    if (!match) {
      throw new Error(`Invalid mutation pattern: ${pattern}`);
    }
    const [, path, first, last] = match;
    const source = readFileSync(path, 'utf8');
    const lineCount =
      source.length === 0 ? 0 : source.split('\n').length - Number(source.endsWith('\n'));
    const start = first === undefined ? 1 : Number(first);
    const end = last === undefined ? lineCount : Number(last);
    if (start < 1 || end < start || end > lineCount) {
      throw new Error(`Invalid mutation range: ${pattern}`);
    }
    const group = groups.get(path) ?? { path, patterns: [], lines: new Set(), source, lineCount };
    group.patterns.push(pattern);
    for (let line = start; line <= end; line += 1) {
      group.lines.add(line);
    }
    groups.set(path, group);
  }

  const shards = Array.from({ length: shardCount }, () => ({ patterns: [], weight: 0 }));
  const ordered = [...groups.values()]
    .flatMap((group) => shardItems(group))
    .sort(
      (left, right) =>
        right.weight - left.weight || left.patterns[0].localeCompare(right.patterns[0]),
    );
  for (const item of ordered) {
    let target = shards[0];
    for (const shard of shards.slice(1)) {
      if (shard.weight < target.weight) {
        target = shard;
      }
    }
    target.patterns.push(...item.patterns);
    target.weight += item.weight;
  }
  const selected = shards[shardIndex].patterns;
  if (selected.length === 0) {
    throw new Error(`Mutation shard ${shardIndex}/${shardCount} selected no source`);
  }
  return selected;
}
