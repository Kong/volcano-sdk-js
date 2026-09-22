import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from '@jest/globals';

// Installing this SDK must never install the durable runtime. Volcano puts it in
// a durable function's own dependencies when it builds one, on a Node runtime
// that satisfies the runtime's own `engines` — nowhere else does it belong, and
// this repo supports Node 20, which the runtime does not.
//
// It is declared as an optional peer so the SDK can still resolve it from inside
// a strict node_modules layout once the build has added it to the function.
// Three things have to hold for that to stay true: the declaration stays an
// optional peer, this repo's install does not resolve it anyway, and the build
// keeps it external so the dynamic import survives into the artifacts rather
// than being inlined.
const ROOT = join(__dirname, '..');
const RUNTIME = '@aws/durable-execution-sdk-js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Expected a JSON object');
  }
  return value;
}

const manifest = requiredRecord(JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')));

function dependency(group: string): unknown {
  const entries = manifest[group];
  return isRecord(entries) ? entries[RUNTIME] : undefined;
}

describe(`packaging keeps ${RUNTIME} out of an SDK install`, () => {
  test('it is declared only as an optional peer', () => {
    expect(dependency('peerDependencies')).toBeTruthy();
    const peerMetadata = requiredRecord(manifest['peerDependenciesMeta']);
    const durableMetadata = requiredRecord(peerMetadata[RUNTIME]);
    expect(durableMetadata['optional']).toBe(true);
    expect(dependency('dependencies')).toBeUndefined();
    expect(dependency('devDependencies')).toBeUndefined();
  });

  // pnpm resolves optional peers into the importer even though the setting is
  // documented as non-optional only (pnpm/pnpm#11155), which is what
  // autoInstallPeers in pnpm-workspace.yaml is there to stop.
  test('this repo does not resolve it into its own lockfile', () => {
    const lock = readFileSync(join(ROOT, 'pnpm-lock.yaml'), 'utf8');
    const importer = lock.slice(lock.indexOf('importers:'), lock.indexOf('\npackages:'));

    expect(importer).not.toContain(RUNTIME);
  });

  describe('the durable build imports it rather than inlining it', () => {
    const durableBuilds = ['dist/durable.js', 'dist/durable.esm.mjs'];

    for (const file of durableBuilds) {
      test(`${file} loads it at runtime`, () => {
        expect(readFileSync(join(ROOT, file), 'utf8')).toContain(RUNTIME);
      });
    }
  });
});
