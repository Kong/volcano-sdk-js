import { DurableRuntimeMissingError } from './durable-runtime-error.ts';

interface DurableEngine {
  withDurableExecution(
    handler: (input: unknown, context: unknown) => unknown,
  ): (event: unknown, functionContext: unknown) => Promise<unknown>;
  StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' };
  createRetryStrategy(config: Record<string, unknown>): unknown;
  createWaitStrategy(config: Record<string, unknown>): unknown;
}

// Volcano installs this optional peer only in deployed durable functions.
const runtimeSpecifier = '@aws/durable-execution-sdk-js';
let enginePromise: Promise<DurableEngine> | undefined;

export function loadEngine(): Promise<DurableEngine> {
  enginePromise ??= resolveEngine();
  return enginePromise;
}

async function resolveEngine(): Promise<DurableEngine> {
  let loaded: unknown;
  try {
    loaded = await import(runtimeSpecifier);
  } catch (cause: unknown) {
    throw new DurableRuntimeMissingError(cause);
  }
  return engineFrom(loaded);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function hasStrategies(value: Record<string, unknown>): boolean {
  return (
    isRecord(value['StepSemantics']) &&
    value['StepSemantics']['AtMostOncePerRetry'] === 'AT_MOST_ONCE_PER_RETRY' &&
    typeof value['createRetryStrategy'] === 'function' &&
    typeof value['createWaitStrategy'] === 'function'
  );
}

function isEngine(value: unknown): value is DurableEngine {
  return (
    isRecord(value) && typeof value['withDurableExecution'] === 'function' && hasStrategies(value)
  );
}

/** Accept both the native ESM namespace and the CommonJS default export. */
export function engineFrom(loaded: unknown): DurableEngine {
  const candidate =
    isRecord(loaded) && Boolean(loaded['withDurableExecution'])
      ? loaded
      : isRecord(loaded)
        ? loaded['default']
        : undefined;
  if (!isEngine(candidate)) {
    throw new TypeError('The durable runtime does not expose the expected engine API');
  }
  return candidate;
}
