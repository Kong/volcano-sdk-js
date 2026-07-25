const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Regression guard for VOL-505.
//
// The SDK ships an ES module build (dist/*.esm.mjs) that bundlers inline into
// consumer output. If an entry source hand-rolls CommonJS/UMD/global exports
// (`module.exports = VolcanoAuth`, `window.* = ...`, AMD `define(...)`), rollup
// passes those statements straight through into the ES build (it only rewrites
// real `import`/`export` declarations). A stray top-level `module.exports =
// VolcanoAuth` in dist/index.esm.mjs then runs when esbuild bundles the SDK
// into a function (`esbuild --bundle --format=cjs`) and OVERWRITES that
// bundle's own `module.exports = { handler }` — the Model B "handler is not a
// function" failure VOL-505 describes. (The browser/UMD global is provided by
// a `footer` on the UMD output in rollup.config.mjs, scoped to dist/index.js
// only, so it never reaches the ES builds.)
//
// Two layers of guard:
//  1. Entry sources must be authored as pure ES modules.
//  2. The built ES artifacts must be format-pure (also catches a bad
//     rollup/plugin/config change that injects impurity without touching a
//     source file — the residual gap a source-only scan leaves).
const ROOT = path.join(__dirname, '..');
const SOURCES = ['src/index.js', 'src/realtime.js', 'src/next/middleware.js'];
const ESM_BUILDS = ['dist/index.esm.mjs', 'dist/realtime.esm.mjs', 'dist/next/middleware.esm.mjs'];

const FORBIDDEN = [
  /\bmodule\.exports\b/, // the direct clobber cause
  /^\s*window\.[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$]/m, // browser-global assignment
  /\bdefine\s*\(\s*\[/, // AMD define([...], ...)
];

// Match on code only: strip comments so documentation that *names* these
// tokens (like the guard note in src/index.js) doesn't trip the guard.
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
    .replace(/^\s*\/\/.*$/gm, '') // full-line comments
    .replace(/([^:])\/\/.*$/gm, '$1'); // trailing comments (keep http://)

const expectPure = (code) => {
  for (const re of FORBIDDEN) expect(code).not.toMatch(re);
};

describe('VOL-505: SDK ES output carries no CJS/UMD/global export statements', () => {
  describe('entry sources are pure ES modules', () => {
    for (const rel of SOURCES) {
      test(`${rel} hand-rolls no CJS/UMD export statements`, () => {
        expectPure(stripComments(fs.readFileSync(path.join(ROOT, rel), 'utf8')));
      });
    }
  });

  describe('built ES artifacts are format-pure', () => {
    beforeAll(() => {
      if (!ESM_BUILDS.every((f) => fs.existsSync(path.join(ROOT, f)))) {
        execSync('npm run build', { cwd: ROOT, stdio: 'ignore' });
      }
    });

    for (const rel of ESM_BUILDS) {
      test(`${rel} contains no module.exports / window.* = / define([`, () => {
        expectPure(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
      });
    }
  });
});
