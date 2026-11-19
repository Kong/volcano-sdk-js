import { existsSync, readFileSync } from 'node:fs';
import { isRecord } from './values.mts';

// Measured mutation time in milliseconds by source file, then by the line a
// mutant starts on.
export type MutationCosts = ReadonlyMap<string, ReadonlyMap<number, number>>;

export const mutationCostsPath = 'mutation-costs.json';

function lineCosts(path: string, value: unknown): Map<number, number> {
  if (!isRecord(value)) {
    throw new Error(`${path}: expected line costs`);
  }
  return new Map(
    Object.entries(value).map(([line, cost]) => {
      if (!/^[1-9]\d*$/u.test(line) || typeof cost !== 'number' || !Number.isFinite(cost) || cost < 0) {
        throw new Error(`${path}:${line}: expected a positive line number and a non-negative cost`);
      }
      return [Number(line), cost];
    }),
  );
}

export function parseMutationCosts(text: string): MutationCosts {
  const parsed: unknown = JSON.parse(text);
  const files = isRecord(parsed) ? parsed['files'] : undefined;
  if (!isRecord(files)) {
    throw new Error('Mutation costs must contain a files object');
  }
  return new Map(Object.entries(files).map(([path, lines]) => [path, lineCosts(path, lines)]));
}

export function readMutationCosts(path: string = mutationCostsPath): MutationCosts {
  return existsSync(path) ? parseMutationCosts(readFileSync(path, 'utf8')) : new Map();
}

// Shards measure disjoint lines, so a file split across shards is the union of
// their timings. A file no timing mentions keeps its earlier costs.
export function mergeMutationCosts(existing: MutationCosts, timings: readonly MutationCosts[]): MutationCosts {
  const measured = new Map<string, Map<number, number>>();
  for (const timing of timings) {
    for (const [path, lines] of timing) {
      const merged = measured.get(path) ?? new Map<number, number>();
      for (const [line, cost] of lines) {
        merged.set(line, (merged.get(line) ?? 0) + cost);
      }
      measured.set(path, merged);
    }
  }
  return new Map([...existing, ...measured]);
}

export function formatMutationCosts(costs: MutationCosts): string {
  const files = Object.fromEntries(
    [...costs.entries()]
      .toSorted(([left], [right]) => left.localeCompare(right))
      .map(([path, lines]) => [
        path,
        Object.fromEntries(
          [...lines.entries()].toSorted(([left], [right]) => left - right).map(([line, cost]) => [String(line), cost]),
        ),
      ]),
  );
  return `${JSON.stringify({ files }, undefined, 2)}\n`;
}
