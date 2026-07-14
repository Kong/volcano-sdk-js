import { defineConfig } from '@hey-api/openapi-ts';

const outputPath = process.env.OPENAPI_OUTPUT ?? 'src/generated/api';

export default defineConfig({
  input: './openapi/openapi.yaml',
  output: {
    clean: true,
    path: outputPath,
    postProcess: ['prettier'],
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
