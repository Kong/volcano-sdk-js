// UMD (browser <script>) only. rollup's named UMD sets the global
// `VolcanoAuth` to the export namespace ({ VolcanoAuth, QueryBuilder, ... });
// restore the documented `new VolcanoAuth()` CDN ergonomic by making the
// global the class itself, with the other named exports kept as their own
// globals — matching the old hand-rolled browser block. Scoped to this one
// output via `footer` so the ES build (dist/index.esm.mjs) stays a pure,
// side-effect-free module and can't clobber a CJS bundle that inlines it
// (VOL-505). No-op under CommonJS require (the UMD CJS branch never assigns
// the global), so it never affects `require('@volcano.dev/sdk')`.
const umdBrowserGlobalFooter = `;(function () {
  var g = typeof globalThis !== 'undefined' ? globalThis : (typeof self !== 'undefined' ? self : null);
  if (!g || !g.VolcanoAuth || !g.VolcanoAuth.VolcanoAuth) return;
  var ns = g.VolcanoAuth;
  g.VolcanoAuth = ns.VolcanoAuth;
  g.VolcanoClient = ns.VolcanoClient;
  g.QueryBuilder = ns.QueryBuilder;
  g.StorageFileApi = ns.StorageFileApi;
  g.isBrowser = ns.isBrowser;
  g.loadRealtime = ns.loadRealtime;
  g.databaseConnectionString = ns.databaseConnectionString;
})();`;

export default [
  // Main SDK bundle
  {
    input: 'src/index.js',
    external: ['centrifuge', 'ws'],
    output: [
      {
        file: 'dist/index.js',
        format: 'umd',
        name: 'VolcanoAuth',
        exports: 'named',
        inlineDynamicImports: true,
        footer: umdBrowserGlobalFooter,
      },
      {
        file: 'dist/index.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/index.cjs.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
      },
    ],
  },
  // Realtime module bundle
  {
    input: 'src/realtime.js',
    external: ['centrifuge', 'ws'],
    output: [
      {
        file: 'dist/realtime.js',
        format: 'umd',
        name: 'VolcanoRealtime',
        exports: 'named',
        inlineDynamicImports: true,
        globals: {
          centrifuge: 'Centrifuge',
          ws: 'WebSocket',
        },
      },
      {
        file: 'dist/realtime.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/realtime.cjs.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
      },
    ],
  },
  // Next.js middleware helpers bundle
  {
    input: 'src/next/middleware.js',
    output: [
      {
        file: 'dist/next/middleware.js',
        format: 'cjs',
        exports: 'named',
      },
      {
        file: 'dist/next/middleware.esm.mjs',
        format: 'es',
      },
    ],
  },
];
