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
