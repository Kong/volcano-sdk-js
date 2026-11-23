import { existsSync, readFileSync } from 'node:fs';
import { type LineRange, MAX_SHARD_LINES, safeChunks } from './mutation-chunks.mts';
import { type MutationCosts, readMutationCosts } from './mutation-costs.mts';
import { itemWeight, measuredCost, runtimeLines, type ShardItem, unmeasuredLineCost } from './mutation-weights.mts';

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
  runtimeLines: ReadonlySet<number>;
}

// Stryker accepts file/line ranges but has no native CI shard selector.
export const mutationShardCount = 48;
function handwrittenRuntime(path: string): boolean {
  return (
    /^src\/.+\.(?:js|ts)$/u.test(path) &&
    !path.endsWith('.d.ts') &&
    !path.startsWith('src/generated/') &&
    !path.startsWith('src/generated-runtime/')
  );
}

export function mutationPatterns(paths: readonly string[]): string[] {
  return [...new Set(paths.filter((path) => handwrittenRuntime(path) && existsSync(path)))].toSorted((left, right) =>
    left.localeCompare(right),
  );
}

function selectedRanges(group: SourceGroup, start: number, end: number): ShardItem {
  const { path, lines } = group;
  const selected = [...lines].filter((line) => line >= start && line <= end).toSorted((a, b) => a - b);
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
  return {
    path,
    patterns: ranges,
    lines: selected,
    mutantFree: !selected.some((line) => group.runtimeLines.has(line)),
  };
}

function wholeItem(group: SourceGroup): ShardItem {
  const lines = [...group.lines];
  return {
    path: group.path,
    patterns: group.patterns,
    lines,
    mutantFree: !lines.some((line) => group.runtimeLines.has(line)),
  };
}

// A file too long, or measured as too costly, for one item splits between
// statements or class members, so one slow file cannot set the slowest shard.
function shardItems(
  group: SourceGroup,
  weigh: (item: ShardItem) => number,
  target: number,
  measured: boolean,
): ShardItem[] {
  if (group.lines.size <= MAX_SHARD_LINES && !(measured && weigh(wholeItem(group)) > target)) {
    return [wholeItem(group)];
  }
  const fits = (start: number, end: number): boolean => weigh(selectedRanges(group, start, end)) <= target;
  return safeChunks(group.path, group.source, group.lineCount, fits)
    .map(({ start, end }) => selectedRanges(group, start, end))
    .filter((item) => item.lines.length > 0);
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
  const match = /^(src\/.+\.(?:js|ts))(?::(\d+)-(\d+))?$/u.exec(pattern);
  const path = match?.[1];
  if (path === undefined) {
    throw new Error(`Invalid mutation pattern: ${pattern}`);
  }
  return { path, first: match?.[2], last: match?.[3] };
}

function patternBounds(first: string | undefined, last: string | undefined, lineCount: number): LineRange {
  return { start: Number(first ?? 1), end: Number(last ?? lineCount) };
}

function addPatternGroup(groups: Map<string, SourceGroup>, pattern: string): void {
  const { path, first, last } = parsePattern(pattern);
  const source = readFileSync(path, 'utf8');
  const lineCount = source.split('\n').length - Number(source.endsWith('\n')) - Number(source.length === 0);
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
    runtimeLines: runtimeLines(path, source),
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
  costs: MutationCosts,
): MutationShard[] {
  const shards: MutationShard[] = Array.from({ length: shardCount }, () => ({
    patterns: [],
    weight: 0,
  }));
  const unmeasured = unmeasuredLineCost(groups.values(), costs);
  const weigh = (item: ShardItem): number => itemWeight(item, costs, unmeasured);
  // Size pieces against the full run, so a pull request's few changed files
  // split only as far as they would in the complete target.
  const selected = [...groups.values()].reduce((sum, group) => sum + weigh(wholeItem(group)), 0);
  const total = Math.max(measuredCost(costs), selected);
  const ordered = [...groups.values()]
    .flatMap((group) => shardItems(group, weigh, total / shardCount, costs.has(group.path)))
    .map((item) => ({ patterns: item.patterns, weight: weigh(item) }))
    .toSorted((left, right) => {
      const weightOrder = right.weight - left.weight;
      return weightOrder === 0 ? firstPattern(left).localeCompare(firstPattern(right)) : weightOrder;
    });
  for (const item of ordered) {
    const target = lightestShard(shards);
    target.patterns.push(...item.patterns);
    target.weight += item.weight;
  }
  return shards;
}

function mutationShards(patterns: readonly string[], shardCount: number, costs: MutationCosts): string[][] {
  const groups = new Map<string, SourceGroup>();
  for (const pattern of patterns) {
    addPatternGroup(groups, pattern);
  }
  return distributeShardItems(groups, shardCount, costs).map((shard) => shard.patterns);
}

// Every shard job must compute the same split, so weights come only from the
// sources and the committed cost table.
export function shardMutationPatterns(
  patterns: readonly string[],
  shardIndex: number,
  shardCount: number,
  costs: MutationCosts = readMutationCosts(),
): string[] {
  validateShardSelection(shardIndex, shardCount);
  const selected = mutationShards(patterns, shardCount, costs)[shardIndex];
  if (selected === undefined || selected.length === 0) {
    throw new Error(`Mutation shard ${String(shardIndex)}/${String(shardCount)} selected no source`);
  }
  return selected;
}

// A change that touches a few files leaves most shards empty; those pass without Stryker.
export function changedShardPatterns(
  patterns: readonly string[],
  shardIndex: number,
  shardCount: number,
  costs: MutationCosts = readMutationCosts(),
): string[] {
  validateShardSelection(shardIndex, shardCount);
  return mutationShards(patterns, shardCount, costs)[shardIndex] ?? [];
}

function outputLines(output: string): string[] {
  return output.split('\n').filter(Boolean);
}

interface ShardSelection {
  index: number;
  count: number;
}

// With a base commit, mutate only the runtime files changed since it;
// otherwise, the complete target.
export function selectMutationPatterns(
  base: string | undefined,
  git: (...args: string[]) => string,
  shard?: ShardSelection,
): string[] {
  const listed =
    base === undefined ? git('ls-files', '--cached', '--', 'src') : git('diff', '--name-only', base, '--', 'src');
  const untracked = git('ls-files', '--others', '--exclude-standard', '--', 'src');
  const scope = mutationPatterns([...outputLines(listed), ...outputLines(untracked)]);
  if (shard === undefined) {
    return scope;
  }
  const select = base === undefined ? shardMutationPatterns : changedShardPatterns;
  return select(scope, shard.index, shard.count);
}
