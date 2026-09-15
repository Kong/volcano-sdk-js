const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
const ROOT = path.join(__dirname, '..');
const RUNTIME = '@aws/durable-execution-sdk-js';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

describe(`packaging keeps ${RUNTIME} out of an SDK install`, () => {
  test('it is declared only as an optional peer', () => {
    expect(manifest.peerDependencies?.[RUNTIME]).toBeTruthy();
    expect(manifest.peerDependenciesMeta?.[RUNTIME]?.optional).toBe(true);
    expect(manifest.dependencies?.[RUNTIME]).toBeUndefined();
    expect(manifest.devDependencies?.[RUNTIME]).toBeUndefined();
  });

  // pnpm resolves optional peers into the importer even though the setting is
  // documented as non-optional only (pnpm/pnpm#11155), which is what
  // autoInstallPeers in pnpm-workspace.yaml is there to stop.
  test('this repo does not resolve it into its own lockfile', () => {
    const lock = fs.readFileSync(path.join(ROOT, 'pnpm-lock.yaml'), 'utf8');
    const importer = lock.slice(lock.indexOf('importers:'), lock.indexOf('\npackages:'));

    expect(importer).not.toContain(RUNTIME);
  });

  describe('the durable build imports it rather than inlining it', () => {
    const durableBuilds = ['dist/durable.js', 'dist/durable.esm.mjs'];

    beforeAll(() => {
      if (!durableBuilds.every((file) => fs.existsSync(path.join(ROOT, file)))) {
        execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
      }
    });

    for (const file of durableBuilds) {
      test(`${file} loads it at runtime`, () => {
        expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).toContain(RUNTIME);
      });
    }
  });
});
