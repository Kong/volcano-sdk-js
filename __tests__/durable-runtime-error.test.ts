import { expect, test } from '@jest/globals';
import { DurableRuntimeMissingError } from '../src/durable-runtime-error.ts';

test('reports a missing durable runtime with its original cause', () => {
  const cause = new Error('runtime not installed');
  const error = new DurableRuntimeMissingError(cause);

  expect(error).toBeInstanceOf(Error);
  expect(error.name).toBe('DurableRuntimeMissingError');
  expect(error.message).toContain('Durable execution is not available here.');
  expect(error.message).toContain('`kind: durable`');
  expect(error.cause).toBe(cause);
});

test('permits a missing cause', () => {
  expect(new DurableRuntimeMissingError().cause).toBeUndefined();
});
