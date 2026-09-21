import { defineConfig } from 'orval';

export default defineConfig({
  volcano: {
    hooks: {
      afterAllFilesWrite:
        'openapi-typescript openapi/openapi.yaml --default-non-nullable false -o src/generated/openapi.d.ts && prettier src/generated/openapi.d.ts --write',
    },
    input: {
      // The vendored spec is a single bundled file: hosting's own spec is split
      // across components, but what lands here is already resolved, so there is
      // nothing external to allow. A second copy of those components used to
      // sit beside it, unread by any tool and free to drift from the bundle,
      // which is exactly what it did.
      target: './openapi/openapi.yaml',
    },
    output: {
      client: 'fetch',
      mode: 'single',
      tsconfig: './tsconfig.generated.json',
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
