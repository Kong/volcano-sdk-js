import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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

      test(`${file} invokes with an installed runtime`, () => {
        const fixture = mkdtempSync(join(tmpdir(), 'volcano-durable-package-'));
        try {
          const runtimeDir = join(fixture, 'node_modules', '@aws', 'durable-execution-sdk-js');
          mkdirSync(runtimeDir, { recursive: true });
          writeFileSync(
            join(runtimeDir, 'package.json'),
            JSON.stringify({ name: RUNTIME, main: 'index.cjs' }),
          );
          writeFileSync(
            join(runtimeDir, 'index.cjs'),
            `module.exports = {
              withDurableExecution: (handler) => handler,
              StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' },
              createRetryStrategy: (config) => config,
              createWaitStrategy: (config) => config,
            };`,
          );
          const filename = file.split('/').at(-1);
          if (filename === undefined || filename === '') {
            throw new Error('Missing bundle filename');
          }
          copyFileSync(join(ROOT, file), join(fixture, filename));
          const esm = filename.endsWith('.mjs');
          const load = esm
            ? `import { durable } from './${filename}';`
            : `const { durable } = require('./${filename}');`;
          const script = `${load}
            const handler = durable(async (input) => input.marker);
            handler({ marker: 'packaged-runtime-ok' }, { logger: {} })
              .then((result) => process.stdout.write(result))
              .catch((error) => { console.error(error); process.exitCode = 1; });`;
          const output = execFileSync(
            process.execPath,
            [`--input-type=${esm ? 'module' : 'commonjs'}`, '--eval', script],
            { cwd: fixture, encoding: 'utf8', timeout: 5000 },
          );
          expect(output).toBe('packaged-runtime-ok');
        } finally {
          rmSync(fixture, { recursive: true, force: true });
        }
      });
    }
  });
});
