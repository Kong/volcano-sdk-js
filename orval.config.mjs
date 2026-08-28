import { defineConfig } from 'orval';

export default defineConfig({
  volcano: {
    hooks: {
      afterAllFilesWrite:
        'pnpm generate:openapi:types && prettier src/generated/openapi.d.ts --write',
    },
    input: {
      parserOptions: {
        externalRefs: {
          allow: [
            './components/common/parameters.yaml',
            './components/common/schemas.yaml',
            './components/common/security-schemes.yaml',
          ],
        },
      },
      target: './openapi/openapi.yaml',
    },
    output: {
      client: 'fetch',
      mode: 'single',
      override: {
        fetch: {
          includeHttpResponseReturnType: true,
        },
        mutator: {
          name: 'volcanoFetch',
          path: './src/generated/volcano-fetch.ts',
        },
        operations: {
          uploadStorageObject: {
            contentType: {
              include: ['multipart/form-data'],
            },
          },
        },
      },
      schemas: './src/generated/model',
      target: './src/generated/client.ts',
    },
  },
});
