// TypeScript rewrites variable dynamic imports through a helper that Rollup
// omits from the bundle. Keep the optional peer import in JavaScript so the
// packaged CJS and ESM entrypoints both resolve it at invocation time.
const runtimeSpecifier = '@aws/durable-execution-sdk-js';

export function importDurableRuntime() {
  return import(runtimeSpecifier);
}
