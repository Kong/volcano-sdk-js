import { expect, test } from '@jest/globals';
import { toRetryStrategy } from '../src/durable-retry.ts';

const unexpectedEngine = {
  createRetryStrategy(): never {
    throw new Error('unexpected engine call');
  },
};

function retryCallback(error: Error, attempt: number): boolean {
  return error.message === 'retry' && attempt < 3;
}

test('uses the engine default for an omitted retry option', () => {
  expect(toRetryStrategy(undefined, unexpectedEngine)).toBeNull();
  expect(toRetryStrategy(null, unexpectedEngine)).toBeNull();
});

test('fails on the first error when retry is false', () => {
  const strategy = toRetryStrategy(false, unexpectedEngine);
  if (typeof strategy !== 'function') {
    throw new TypeError('expected a retry callback');
  }
  const decision: unknown = Reflect.apply(strategy, null, [new TypeError('failed'), 1]);
  expect(decision).toEqual({ shouldRetry: false });
});

test('passes a custom retry callback through unchanged', () => {
  expect(toRetryStrategy(retryCallback, unexpectedEngine)).toBe(retryCallback);
});

test('passes only configured retry options to the engine', () => {
  const configs: Record<string, unknown>[] = [];
  const engine = {
    createRetryStrategy(config: Record<string, unknown>): object {
      configs.push(config);
      return { config };
    },
  };
  const retryOn = ['temporary'];
  const retryOnTypes = [TypeError];
  const created = toRetryStrategy(
    { attempts: 5, initialDelay: '2s', maxDelay: '1m30s', backoffRate: 3, retryOn, retryOnTypes },
    engine,
  );
  expect(created).toEqual({ config: configs[0] });
  expect(configs).toEqual([
    {
      maxAttempts: 5,
      initialDelay: { seconds: 2 },
      maxDelay: { minutes: 1, seconds: 30 },
      backoffRate: 3,
      retryableErrors: retryOn,
      retryableErrorTypes: retryOnTypes,
    },
  ]);
  expect(toRetryStrategy({}, engine)).toEqual({ config: {} });
});

test.each([3, true, 'yes'])('explains invalid top-level retry option %p', (retry) => {
  expect(() => toRetryStrategy(retry, unexpectedEngine)).toThrow(
    new TypeError('retry must be false, a function, or an options object'),
  );
});

test.each(['initialDelay', 'maxDelay'] as const)(
  'names the invalid %s duration before calling the engine',
  (field) => {
    expect(() => toRetryStrategy({ [field]: '400ms' }, unexpectedEngine)).toThrow(
      `${field} must be a duration in whole seconds`,
    );
  },
);
