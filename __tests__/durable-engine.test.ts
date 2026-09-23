import { describe, expect, jest, test } from '@jest/globals';
import { engineFrom, loadEngine } from '../src/durable-engine.ts';

const engine = {
  withDurableExecution:
    (handler: (input: unknown, context: unknown) => unknown) =>
    (event: unknown, context: unknown): Promise<unknown> =>
      Promise.resolve(handler(event, context)),
  StepSemantics: { AtMostOncePerRetry: 'once' },
  createRetryStrategy: (config: Record<string, unknown>): unknown => config,
  createWaitStrategy: (config: Record<string, unknown>): unknown => config,
};

jest.mock('@aws/durable-execution-sdk-js', () => engine, { virtual: true });

describe('durable runtime boundary', () => {
  test('loads the optional runtime once for repeated invocations', async () => {
    const first = loadEngine();
    expect(loadEngine()).toBe(first);
    expect(await first).toMatchObject(engine);
  });

  test('accepts ESM and CommonJS exports', () => {
    expect(engineFrom(engine)).toBe(engine);
    expect(engineFrom({ default: engine })).toBe(engine);
  });

  test.each([
    null,
    {},
    { withDurableExecution: true, default: engine },
    { ...engine, withDurableExecution: undefined },
    { ...engine, StepSemantics: null },
    { ...engine, StepSemantics: {} },
    { ...engine, createRetryStrategy: undefined },
    { ...engine, createWaitStrategy: undefined },
  ])('rejects a runtime with an invalid API', (loaded: unknown) => {
    expect(() => engineFrom(loaded)).toThrow('expected engine API');
  });
});
