import { engineConfig } from './durable-arguments.ts';
import { optionalDuration } from './durable-duration.ts';
import { toRetryStrategy } from './durable-retry.ts';

interface DurableConfigEngine {
  StepSemantics: { AtMostOncePerRetry: unknown };
  createRetryStrategy(config: Record<string, unknown>): unknown;
  createWaitStrategy(config: Record<string, unknown>): unknown;
}

export function stepConfig(
  options: Record<string, unknown>,
  engine: DurableConfigEngine,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (Boolean(options['atMostOnce'])) {
    config['semantics'] = engine.StepSemantics.AtMostOncePerRetry;
  }
  const retryStrategy = toRetryStrategy(options['retry'], engine);
  if (Boolean(retryStrategy)) {
    config['retryStrategy'] = retryStrategy;
  }
  return config;
}

/** Map a bounded condition to the engine's suspended polling strategy. */
export function conditionConfig(
  options: Record<string, unknown>,
  engine: DurableConfigEngine,
): { initialState: unknown; waitStrategy: unknown } {
  const until: unknown = options['until'];
  if (typeof until !== 'function') {
    throw new TypeError('ctx.waitUntil() requires an `until` predicate in its options');
  }
  const initialState = options['initialState'];
  if (initialState === undefined) {
    throw new TypeError(
      'ctx.waitUntil() requires an `initialState` in its options, which is what `until` is given until the state changes',
    );
  }
  if (options['timeout'] !== undefined) {
    throw new TypeError(
      'ctx.waitUntil() has no `timeout`: bound the wait with `maxAttempts`, `interval` and `maxInterval`',
    );
  }

  return {
    initialState,
    waitStrategy: engine.createWaitStrategy(
      engineConfig({
        shouldContinuePolling(state: unknown) {
          const reached: unknown = Reflect.apply(until, options, [state]);
          return !Boolean(reached);
        },
        maxAttempts: options['maxAttempts'],
        initialDelay: optionalDuration(options['interval'], 'interval'),
        maxDelay: optionalDuration(options['maxInterval'], 'maxInterval'),
        backoffRate: options['backoffRate'],
      }),
    ),
  };
}

export function batchConfig(options: Record<string, unknown> = {}): Record<string, unknown> {
  const config: Record<string, unknown> = {};
  if (options['concurrency'] !== undefined) {
    config['maxConcurrency'] = options['concurrency'];
  }
  if (options['minSucceeded'] !== undefined) {
    config['completionConfig'] = { minSuccessful: options['minSucceeded'] };
  }
  return config;
}
