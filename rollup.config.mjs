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
    input: 'src/index.js',
    external: ['centrifuge', 'ws'],
    plugins: [typescriptPlugin()],
    output: [
      {
        file: 'dist/index.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/index.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/volcano.umd.js',
        format: 'umd',
        name: 'Volcano',
        exports: 'named',
        inlineDynamicImports: true,
      },
    ],
  },
  {
    input: 'src/index.types.ts',
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
      },
      {
        file: 'dist/api/index.mjs',
        format: 'es',
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
    input: 'src/realtime.js',
    external: ['centrifuge', 'ws'],
    output: [
      {
        file: 'dist/realtime.js',
        format: 'cjs',
        exports: 'named',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/realtime.esm.mjs',
        format: 'es',
        inlineDynamicImports: true,
      },
      {
        file: 'dist/realtime.umd.js',
        format: 'umd',
        name: 'VolcanoRealtime',
        exports: 'named',
        inlineDynamicImports: true,
        globals: {
          centrifuge: 'Centrifuge',
          ws: 'WebSocket',
        },
      },
    ],
  },
  {
    input: 'src/realtime.types.ts',
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: [
      { file: 'dist/realtime.d.ts', format: 'es' },
      { file: 'dist/realtime.esm.d.mts', format: 'es' },
    ],
  },
  // Next.js middleware helpers bundle
  {
    input: 'src/next/middleware.js',
    plugins: [typescriptPlugin()],
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
  {
    input: 'src/next/middleware.types.ts',
    plugins: [dts({ tsconfig: './tsconfig.json' })],
    output: [
      { file: 'dist/next/middleware.d.ts', format: 'es' },
      { file: 'dist/next/middleware.esm.d.mts', format: 'es' },
    ],
  },
];
