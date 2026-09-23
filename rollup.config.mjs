import typescript from '@rollup/plugin-typescript';

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
    plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
    external: ['centrifuge', 'ws'],
    output: [
      {
        dir: 'dist',
        entryFileNames: 'index.js',
        format: 'umd',
        name: 'VolcanoAuth',
        exports: 'named',
        inlineDynamicImports: true,
        footer: umdBrowserGlobalFooter,
      },
      {
        dir: 'dist',
        entryFileNames: 'index.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
      },
      {
        dir: 'dist',
        entryFileNames: 'index.cjs.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
      },
    ],
  },
  // Realtime module bundle
  {
    input: 'src/realtime.js',
    plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
    external: ['centrifuge', 'ws'],
    output: [
      {
        dir: 'dist',
        entryFileNames: 'realtime.js',
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
        dir: 'dist',
        entryFileNames: 'realtime.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
      },
      {
        dir: 'dist',
        entryFileNames: 'realtime.cjs.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
      },
    ],
  },
  // Durable function authoring bundle. The durable runtime stays external and
  // is imported lazily at runtime: it is an optional peer dependency only a
  // durable function installs.
  {
    input: 'src/durable.ts',
    plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
    external: ['@aws/durable-execution-sdk-js'],
    output: [
      {
        dir: 'dist',
        entryFileNames: 'durable.js',
        format: 'cjs',
        exports: 'named',
      },
      {
        dir: 'dist',
        entryFileNames: 'durable.esm.mjs',
        format: 'es',
      },
    ],
  },
  // Next.js middleware helpers bundle
  {
    input: 'src/next/middleware.ts',
    plugins: [typescript({ tsconfig: './tsconfig.build.json' })],
    output: [
      {
        dir: 'dist',
        entryFileNames: 'next/middleware.js',
        format: 'cjs',
        exports: 'named',
      },
      {
        dir: 'dist',
        entryFileNames: 'next/middleware.esm.mjs',
        format: 'es',
      },
    ],
  },
];
