const fs = require('fs');
const path = require('path');

// Regression guard for VOL-505.
//
// The SDK ships an ES module build (dist/*.esm.mjs) that bundlers inline into
// consumer output. Rollup passes any hand-written `module.exports = ...`,
// `window.* = ...`, or AMD `define(...)` statement in an entry source straight
// through into the ES build (it only rewrites real `import`/`export`
// declarations). A stray top-level `module.exports = VolcanoAuth` in
// dist/index.esm.mjs then runs when esbuild bundles the SDK into a function
// (`esbuild --bundle --format=cjs`) and OVERWRITES that bundle's own
// `module.exports = { handler }`, producing a runtime "handler is not a
// function" — exactly the Model B failure VOL-505 describes.
//
// The entry sources must therefore stay pure ES modules: declare exports only
// with `export`/`export default`, never hand-roll CJS/UMD/global exports.
// Because rollup never emits `module.exports` for a `format: 'es'` output,
// keeping the sources free of it guarantees the ESM builds stay clobber-safe.
describe('entry sources are pure ES modules (VOL-505 regression)', () => {
  const entries = ['src/index.js', 'src/realtime.js', 'src/next/middleware.js'];

  // Match on code only: strip comments so documentation that *names* these
  // tokens (like the guard note in src/index.js) doesn't trip the guard.
  const stripComments = (src) =>
    src
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/^\s*\/\/.*$/gm, '') // full-line comments
      .replace(/([^:])\/\/.*$/gm, '$1'); // trailing comments (keep http://)

  for (const rel of entries) {
    test(`${rel} hand-rolls no CJS/UMD export statements`, () => {
      const code = stripComments(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'));
      // The direct clobber cause — must never reappear in an entry source.
      expect(code).not.toMatch(/\bmodule\.exports\b/);
      // Full multi-format-hack surface: browser-global and AMD blocks belong to
      // the same hand-rolled UMD pattern and pollute the ES build too.
      expect(code).not.toMatch(/^\s*window\.[A-Za-z_$][\w$]*\s*=\s*[A-Za-z_$]/m);
      expect(code).not.toMatch(/\bdefine\s*\(\s*\[/);
    });
  }
});
