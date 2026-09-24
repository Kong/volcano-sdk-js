import { defineConfig, defineTransformer } from 'orval';

const sdkOperations = new Set([
  'listSandboxPresets',
  'listSandboxes',
  'createSandbox',
  'getSandbox',
  'deleteSandbox',
  'listSandboxSessions',
  'createSandboxSession',
  'executeSandbox',
  'getSandboxSession',
  'terminateSandboxSession',
  'suspendSandboxSession',
  'resumeSandboxSession',
  'executeSandboxSession',
  'readSandboxSessionFile',
  'writeSandboxSessionFile',
  'grantSandboxSession',
  'revokeSandboxSession',
  'createSandboxSessionAccess',
  'acquireProjectLock',
  'authSignin',
  'downloadStorageObject',
  'getDurableExecution',
  'listDurableExecutions',
  'queryDatabaseSelect',
  'releaseProjectLock',
  'startDurableExecutionFromApplication',
  'stopDurableExecution',
  'uploadStorageObject',
]);

const runtimeTag = 'Volcano SDK Runtime';

// Orval filters endpoints by tag; SDK operations share their original tags with
// unrelated API routes. Mark the runtime set before Orval selects its schemas.
const selectRuntimeOperations = defineTransformer((document) => {
  const found = new Set();
  for (const pathItem of Object.values(document.paths ?? {})) {
    for (const operation of Object.values(pathItem)) {
      if (!sdkOperations.has(operation?.operationId)) continue;
      operation.tags = [runtimeTag];
      found.add(operation.operationId);
    }
  }
  if (found.size !== sdkOperations.size) {
    throw new Error('The SDK runtime operation set does not match the OpenAPI spec');
  }
  return document;
});

export default defineConfig({
  volcano: {
    input: {
      // The vendored spec is a single bundled file: hosting's own spec is split
      // across components, but what lands here is already resolved, so there is
      // nothing external to allow. A second copy of those components used to
      // sit beside it, unread by any tool and free to drift from the bundle,
      // which is exactly what it did.
      target: './openapi/openapi.yaml',
      override: { transformer: selectRuntimeOperations },
      filters: { tags: [runtimeTag] },
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
