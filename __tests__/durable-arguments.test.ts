import { expect, test } from '@jest/globals';
import { engineConfig, mapArgs, namedArgs, requireFunction } from '../src/durable-arguments.ts';

const operand = (): number => 42;
const mapCallback = (item: number): number => item + 1;

test('normalizes named and unnamed operations without copying operands', () => {
  const options = { retry: false };
  const named = namedArgs('charge', operand, options);
  expect(named).toEqual(['charge', operand, options]);
  expect(named[1]).toBe(operand);
  expect(named[2]).toBe(options);
  expect(namedArgs(undefined, operand)).toEqual([undefined, operand, {}]);
  expect(namedArgs(operand, options)).toEqual([undefined, operand, options]);
  expect(namedArgs(operand, null)).toEqual([undefined, operand, {}]);
});

test('normalizes map arguments without copying items or callback', () => {
  const items = [1, 2];
  const options = { concurrency: 2 };
  const named = mapArgs('batch', items, mapCallback, options);
  expect(named).toEqual(['batch', items, mapCallback, options]);
  expect(named[1]).toBe(items);
  expect(named[2]).toBe(mapCallback);
  expect(named[3]).toBe(options);
  expect(mapArgs(items, mapCallback, options)).toEqual([undefined, items, mapCallback, options]);
  expect(mapArgs(items, mapCallback)).toEqual([undefined, items, mapCallback, {}]);
  expect(mapArgs('batch', items, mapCallback)).toEqual(['batch', items, mapCallback, {}]);
});

test('rejects missing callbacks with the operation name', () => {
  requireFunction(operand, 'step');
  expect(() => {
    requireFunction(null, 'child');
  }).toThrow('ctx.child() requires a function to run');
});

test('omits only undefined engine settings', () => {
  const retryableErrors = ['temporary'];
  const config = engineConfig({
    maxAttempts: undefined,
    retryableErrors,
    shouldRetry: false,
    initialDelay: null,
    backoffRate: 0,
  });
  expect(config).toEqual({
    retryableErrors,
    shouldRetry: false,
    initialDelay: null,
    backoffRate: 0,
  });
  expect(config['retryableErrors']).toBe(retryableErrors);
});
