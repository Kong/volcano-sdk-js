import { existsSync, readFileSync } from 'node:fs';

// Stryker has native file/line selection, but no git-base selector for a clean CI checkout.
export const criticalRuntime = [
  'src/auth-validation.ts',
  'src/database-filters.ts',
  'src/durable-arguments.ts',
  'src/durable-retry.ts',
  'src/lock-random.ts',
  'src/realtime-channel-name.ts',
  'src/storage-paths.ts',
];

function handwrittenRuntime(path) {
  return (
    /^src\/.+\.(?:js|ts)$/.test(path) &&
    !path.endsWith('.d.ts') &&
    // This module contains only public type declarations; Stryker emits no mutants for it.
    path !== 'src/sdk-public-types.ts' &&
    !path.startsWith('src/generated/') &&
    !path.startsWith('src/generated-runtime/')
  );
}

export function changedRuntimePatterns(diff) {
  const patterns = new Set();
  let path = null;
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      const candidate = line.slice(4);
      path = candidate.startsWith('b/') ? candidate.slice(2) : null;
      continue;
    }
    if (path === null || !handwrittenRuntime(path) || !existsSync(path)) {
      continue;
    }
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match) {
      const start = Number(match[1]);
      const count = Number(match[2] ?? '1');
      if (count > 0) {
        patterns.add(`${path}:${start}-${start + count - 1}`);
      } else {
        // A deletion has no added line to select. Mutate the two surviving
        // neighbors, clamping deletions at the beginning or end of the file.
        const source = readFileSync(path, 'utf8');
        const lineCount =
          source.length === 0 ? 0 : source.split('\n').length - Number(source.endsWith('\n'));
        if (lineCount === 0) {
          throw new Error(`${path}: empty handwritten runtime file after deletion`);
        }
        const anchor = Math.min(Math.max(1, start), lineCount);
        patterns.add(`${path}:${Math.max(1, anchor - 1)}-${anchor}`);
      }
    }
  }
  return [...patterns];
}

export function mutationPatterns(committedDiff, workingDiff, untrackedPaths) {
  const patterns = new Set(criticalRuntime);
  for (const pattern of [
    ...changedRuntimePatterns(committedDiff),
    ...changedRuntimePatterns(workingDiff),
  ]) {
    patterns.add(pattern);
  }
  for (const path of untrackedPaths) {
    if (handwrittenRuntime(path) && existsSync(path)) {
      patterns.add(path);
    }
  }
  return [...patterns];
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
    const group = groups.get(path) ?? { path, patterns: [], lines: new Set() };
    group.patterns.push(pattern);
    for (let line = start; line <= end; line += 1) {
      group.lines.add(line);
    }
    groups.set(path, group);
  }

  const shards = Array.from({ length: shardCount }, () => ({ patterns: [], weight: 0 }));
  const ordered = [...groups.values()].sort(
    (left, right) => right.lines.size - left.lines.size || left.path.localeCompare(right.path),
  );
  for (const group of ordered) {
    let target = shards[0];
    for (const shard of shards.slice(1)) {
      if (shard.weight < target.weight) {
        target = shard;
      }
    }
    target.patterns.push(...group.patterns);
    target.weight += group.lines.size;
  }
  const selected = shards[shardIndex].patterns;
  if (selected.length === 0) {
    throw new Error(`Mutation shard ${shardIndex}/${shardCount} selected no source`);
  }
  return selected;
}
