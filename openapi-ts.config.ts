import { defineConfig } from '@hey-api/openapi-ts';

const outputPath = process.env.OPENAPI_OUTPUT ?? 'src/generated/api';

export default defineConfig({
  input: './openapi/openapi.yaml',
  output: {
    clean: true,
    path: outputPath,
    postProcess: [
      {
        command: 'prettier',
        args: [
          '--ignore-unknown',
          '{{path}}',
          '--write',
          '--ignore-path',
          './.prettierignore',
          '--config',
          './prettier.config.cjs',
        ],
        name: 'Prettier',
      },
    ],
  },
  plugins: [
    '@hey-api/typescript',
    {
      name: '@hey-api/client-fetch',
      bundle: true,
    },
    {
      name: '@hey-api/sdk',
      operations: {
        strategy: 'flat',
      },
      paramsStructure: 'grouped',
      responseStyle: 'fields',
    },
  ],
});
