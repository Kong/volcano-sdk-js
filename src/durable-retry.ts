import { engineConfig } from './durable-arguments.ts';
import { optionalDuration } from './durable-duration.ts';

interface RetryEngine {
  createRetryStrategy(config: Record<string, unknown>): unknown;
}

function isAbsent(value: unknown): value is null | undefined {
  return value === undefined || value === null;
}

/** `false` overrides the engine default with a strategy that never retries. */
export function toRetryStrategy(retry: unknown, engine: RetryEngine): unknown {
  if (isAbsent(retry)) {
    return null;
  }
  if (retry === false) {
    return () => ({ shouldRetry: false });
  }
  if (typeof retry === 'function') {
    return retry;
  }
  if (typeof retry !== 'object') {
    throw new TypeError('retry must be false, a function, or an options object');
  }

  return engine.createRetryStrategy(
    engineConfig({
      maxAttempts: Reflect.get(retry, 'attempts'),
      initialDelay: optionalDuration(Reflect.get(retry, 'initialDelay'), 'initialDelay'),
      maxDelay: optionalDuration(Reflect.get(retry, 'maxDelay'), 'maxDelay'),
      backoffRate: Reflect.get(retry, 'backoffRate'),
      retryableErrors: Reflect.get(retry, 'retryOn'),
      retryableErrorTypes: Reflect.get(retry, 'retryOnTypes'),
    }),
  );
}
