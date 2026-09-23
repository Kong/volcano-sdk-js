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
