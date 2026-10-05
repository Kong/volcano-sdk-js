import { DurableRuntimeMissingError } from './durable-runtime-error.ts';

interface DurableEngine {
  withDurableExecution<Handler extends (input: never, context: unknown) => Promise<unknown>>(
    handler: Handler,
  ): (event: unknown, functionContext: unknown) => Promise<Awaited<ReturnType<Handler>>>;
  StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' };
  createRetryStrategy(config: Record<string, unknown>): unknown;
  createWaitStrategy(config: Record<string, unknown>): unknown;
}

// Volcano installs this optional peer only in deployed durable functions.
let enginePromise: Promise<DurableEngine> | undefined;

export function loadEngine(): Promise<DurableEngine> {
  enginePromise ??= resolveEngine();
  return enginePromise;
}

async function resolveEngine(): Promise<DurableEngine> {
  let loaded: unknown;
  try {
    loaded = await import('@aws/durable-execution-sdk-js');
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
