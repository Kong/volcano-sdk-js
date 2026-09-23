import { expect, jest, test } from '@jest/globals';
import { batchConfig, conditionConfig, stepConfig } from '../src/durable-config.ts';

function engine() {
  return {
    StepSemantics: { AtMostOncePerRetry: 'once' },
    createRetryStrategy: jest.fn((config: Record<string, unknown>): unknown => config),
    createWaitStrategy: jest.fn((config: Record<string, unknown>): unknown => config),
  };
}

const retry = (): { shouldRetry: false } => ({ shouldRetry: false });

test('step config omits absent options and forwards checkpoint and retry choices', () => {
  const runtime = engine();
  expect(stepConfig({}, runtime)).toEqual({});

  expect(stepConfig({ atMostOnce: true, retry }, runtime)).toEqual({
    semantics: 'once',
    retryStrategy: retry,
  });
});

test.each([
  [{}, '`until` predicate'],
  [{ until: (): boolean => false }, '`initialState`'],
  [{ until: (): boolean => false, initialState: 0, timeout: '1h' }, 'no `timeout`'],
] as const)('condition config rejects incomplete or unsupported options', (options, message) => {
  expect(() => conditionConfig(options, engine())).toThrow(message);
});

test('condition config preserves state and builds bounded suspended polling', () => {
  const runtime = engine();
  const options = {
    target: 2,
    until(state: unknown): boolean {
      return state === this.target;
    },
    initialState: 0,
    interval: '5s',
    maxInterval: '30s',
    maxAttempts: 3,
    backoffRate: 2,
  };
  const result = conditionConfig(options, runtime);
  expect(result.initialState).toBe(0);
  expect(runtime.createWaitStrategy).toHaveBeenCalledTimes(1);
  expect(result.waitStrategy).toEqual({
    shouldContinuePolling: expect.any(Function),
    maxAttempts: 3,
    initialDelay: { seconds: 5 },
    maxDelay: { seconds: 30 },
    backoffRate: 2,
  });
  const config = runtime.createWaitStrategy.mock.calls[0]?.[0];
  const shouldContinue = config?.['shouldContinuePolling'];
  if (typeof shouldContinue !== 'function') {
    throw new TypeError('expected the polling predicate');
  }
  expect(Reflect.apply(shouldContinue, undefined, [1])).toBe(true);
  expect(Reflect.apply(shouldContinue, undefined, [2])).toBe(false);
});

test('batch config only forwards supplied concurrency and completion threshold', () => {
  expect(batchConfig()).toEqual({});
  expect(batchConfig({ concurrency: 4, minSucceeded: 2 })).toEqual({
    maxConcurrency: 4,
    completionConfig: { minSuccessful: 2 },
  });
});
