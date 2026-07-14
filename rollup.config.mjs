import typescript from '@rollup/plugin-typescript';
import { dts } from 'rollup-plugin-dts';

const typescriptPlugin = () =>
  typescript({
    compilerOptions: {
      declaration: false,
      emitDeclarationOnly: false,
      noEmit: false,
    },
    tsconfig: './tsconfig.json',
  });

export default [
  // Main SDK bundle
  {
    input: 'src/index.ts',
    external: ['centrifuge', 'ws'],
    plugins: [typescriptPlugin()],
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
        sourcemap: true,
      },
      {
        file: 'dist/index.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
        sourcemap: true,
      },
      {
        file: 'dist/volcano.umd.js',
        format: 'umd',
        name: 'Volcano',
        exports: 'named',
        inlineDynamicImports: true,
        sourcemap: true,
      },
    ],
  },
  {
    input: 'src/index.ts',
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: [
      { file: 'dist/index.d.ts', format: 'es' },
      { file: 'dist/index.esm.d.mts', format: 'es' },
    ],
  },
  // Generated OpenAPI client
  {
    input: 'src/api/index.ts',
    plugins: [typescriptPlugin()],
    output: [
      {
        file: 'dist/api/index.js',
        format: 'cjs',
        exports: 'named',
        sourcemap: true,
      },
      {
        file: 'dist/api/index.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
  },
  {
    input: 'src/api/index.ts',
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: [
      {
        file: 'dist/api/index.d.ts',
        format: 'es',
      },
      {
        file: 'dist/api/index.d.mts',
        format: 'es',
      },
    ],
  },
  // Realtime module bundle
  {
    input: 'src/realtime.ts',
    external: ['centrifuge', 'ws'],
    plugins: [typescriptPlugin()],
    output: [
      {
        file: 'dist/realtime.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
        sourcemap: true,
      },
      {
        file: 'dist/realtime.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
        sourcemap: true,
      },
      {
        file: 'dist/realtime.umd.js',
        format: 'umd',
        name: 'VolcanoRealtime',
        exports: 'named',
        inlineDynamicImports: true,
        sourcemap: true,
        globals: {
          centrifuge: 'Centrifuge',
          ws: 'WebSocket',
        },
      },
    ],
  },
  {
    input: 'src/realtime.ts',
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: [
      { file: 'dist/realtime.d.ts', format: 'es' },
      { file: 'dist/realtime.esm.d.mts', format: 'es' },
    ],
  },
  // Next.js middleware helpers bundle
  {
    input: 'src/next/middleware.ts',
    plugins: [typescriptPlugin()],
    output: [
      {
        file: 'dist/next/middleware.js',
        format: 'cjs',
        exports: 'named',
        sourcemap: true,
      },
      {
        file: 'dist/next/middleware.esm.mjs',
        format: 'es',
        sourcemap: true,
      },
    ],
  },
  {
    input: 'src/next/middleware.ts',
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: [
      { file: 'dist/next/middleware.d.ts', format: 'es' },
      { file: 'dist/next/middleware.esm.d.mts', format: 'es' },
    ],
  },
];
