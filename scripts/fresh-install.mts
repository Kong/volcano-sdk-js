import assert from 'node:assert/strict';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { isRecord, record, stringValue } from './values.mts';

/** Package name to every version Node loads from a runtime dependency tree. */
export type Resolution = ReadonlyMap<string, readonly string[]>;

export interface DriftRow {
  name: string;
  lock: string;
  fresh: string;
  drift: boolean;
}

interface InstalledPackage {
  directory: string;
  version: string;
  manifest: Record<string, unknown>;
}

/** Find a package as Node does: in the nearest node_modules above the importer. */
export function installedPackage(from: string, name: string): InstalledPackage | undefined {
  const candidate = join(from, 'node_modules', name);
  if (existsSync(join(candidate, 'package.json'))) {
    const directory = realpathSync(candidate);
    const manifest = record(JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')));
    return { directory, version: stringValue(manifest['version']), manifest };
  }
  const parent = dirname(from);
  return parent === from ? undefined : installedPackage(parent, name);
}

interface Edge {
  from: string;
  name: string;
  required: boolean;
}

// Type declarations never load at runtime, and protobufjs's open-ended
// `@types/node` range would otherwise report every new Node release as drift.
function edges(from: string, manifest: Record<string, unknown>): Edge[] {
  const fields = { dependencies: true, optionalDependencies: false, peerDependencies: false };
  return Object.entries(fields).flatMap(([field, required]) => {
    const entries = manifest[field];
    return Object.keys(isRecord(entries) ? entries : {})
      .filter((name) => !name.startsWith('@types/'))
      .map((name) => ({ from, name, required }));
  });
}

/** Collect every package version Node loads for the dependencies `manifest` declares at `from`. */
export function runtimeClosure(from: string, manifest: Record<string, unknown>): Resolution {
  const versions = new Map<string, Set<string>>();
  const visited = new Set<string>();
  const pending = edges(from, manifest);
  for (let edge = pending.shift(); edge !== undefined; edge = pending.shift()) {
    const found = installedPackage(edge.from, edge.name);
    assert.ok(found !== undefined || !edge.required, `${edge.from} cannot load ${edge.name}`);
    if (found !== undefined && !visited.has(found.directory)) {
      visited.add(found.directory);
      versions.set(edge.name, new Set([...(versions.get(edge.name) ?? []), found.version]));
      pending.push(...edges(found.directory, found.manifest));
    }
  }
  return new Map([...versions].map(([name, found]) => [name, [...found].toSorted()]));
}

const exactVersion = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;

/** Require each exactly pinned dependency to load at its pinned version. */
export function requireExactPins(from: string, dependencies: Record<string, unknown>): void {
  for (const [name, range] of Object.entries(dependencies)) {
    if (typeof range === 'string' && exactVersion.test(range)) {
      const loaded = installedPackage(from, name)?.version ?? 'nothing';
      assert.equal(loaded, range, `${name} is pinned to ${range}, but ${from} loads ${loaded}`);
    }
  }
}

export function driftRows(lock: Resolution, fresh: Resolution): DriftRow[] {
  return [...new Set([...lock.keys(), ...fresh.keys()])].toSorted().map((name) => {
    const locked = lock.get(name)?.join(', ') ?? 'none';
    const resolved = fresh.get(name)?.join(', ') ?? 'none';
    return { name, lock: locked, fresh: resolved, drift: locked !== resolved };
  });
}

export function driftTable(rows: readonly DriftRow[]): string {
  return [
    '| Package | Lock | Fresh install | |',
    '| --- | --- | --- | --- |',
    ...rows.map((row) => `| \`${row.name}\` | ${row.lock} | ${row.fresh} | ${row.drift ? 'drift' : ''} |`),
  ].join('\n');
}
