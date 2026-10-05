import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { durable } from '../src/durable.ts';
import type { EngineBatch } from '../src/durable-batch-result.ts';
import type { DurableContext } from '../src/durable-types.ts';

type EngineHandler = (input: unknown, context: unknown) => Promise<unknown>;
type AuthoringHandler = (input: unknown, context: DurableContext) => Promise<unknown>;
interface EngineScope {
  logger: typeof mockLogger;
  attempt: number;
}
type EngineBranch =
  | ((context: unknown) => Promise<unknown>)
  | { name: unknown; func: (context: unknown) => Promise<unknown> };

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

function mockBatch(results: unknown[]): EngineBatch<unknown> {
  return {
    all: results.map((result, index) => ({ index, status: 'SUCCEEDED', result })),
    getResults: () => results,
    getErrors: () => [],
    successCount: results.length,
    failureCount: 0,
    completionReason: 'ALL_COMPLETED',
    throwIfError: jest.fn(),
  };
}

const mockValidContext = {
  logger: mockLogger,
  configureLogger: jest.fn(),
  step: jest.fn<
    (
      name: unknown,
      run: (scope: EngineScope) => Promise<unknown>,
      config: unknown,
    ) => Promise<unknown>
  >((_name, run) => run({ logger: mockLogger, attempt: 2 })),
  wait: jest.fn<(nameOrDuration: unknown, duration?: unknown) => Promise<void>>(() =>
    Promise.resolve(),
  ),
  runInChildContext: jest.fn((_name: unknown, run: (context: unknown) => Promise<unknown>) =>
    run(mockValidContext),
  ),
  waitForCondition: jest.fn(
    (
      _name: unknown,
      check: (state: unknown, scope: EngineScope) => Promise<unknown>,
      config: { initialState: unknown },
    ) => check(config.initialState, { logger: mockLogger, attempt: 1 }),
  ),
  map: jest.fn<
    (
      name: unknown,
      items: unknown[],
      run: (context: unknown, item: unknown, index: number) => Promise<unknown>,
      config: unknown,
    ) => Promise<EngineBatch<unknown>>
  >(
    async (_name, items, run): Promise<EngineBatch<unknown>> =>
      mockBatch(await Promise.all(items.map((item, index) => run(mockValidContext, item, index)))),
  ),
  parallel: jest.fn<
    (name: unknown, branches: EngineBranch[], config: unknown) => Promise<EngineBatch<unknown>>
  >((_name, branches) => mockParallel(branches)),
};

async function mockParallel(branches: EngineBranch[]): Promise<EngineBatch<unknown>> {
  const results = await Promise.all(
    branches.map((branch) =>
      typeof branch === 'function' ? branch(mockValidContext) : branch.func(mockValidContext),
    ),
  );
  return mockBatch(results);
}

let mockContext: unknown = mockValidContext;
const mockWrap = jest.fn(
  (handler: EngineHandler) =>
    async (event: unknown): Promise<unknown> =>
      handler(event, mockContext),
);

jest.mock('../src/durable-engine.ts', () => ({
  loadEngine: () =>
    Promise.resolve({
      withDurableExecution: mockWrap,
      StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' },
      createRetryStrategy: jest.fn(),
      createWaitStrategy: jest.fn(),
    }),
}));

async function contextFor(handler: AuthoringHandler): Promise<unknown> {
  return durable(handler)({}, {});
}

beforeEach(() => {
  mockContext = mockValidContext;
  jest.clearAllMocks();
});

describe('validated engine callback boundary', () => {
  test('rejects a handler that is not callable', () => {
    expect(() => {
      Reflect.apply(durable, undefined, ['index.handler']);
    }).toThrow('durable(handler) requires a handler function');
  });

  test.each([
    null,
    7,
    {},
    { logger: mockLogger },
    { ...mockValidContext, logger: null },
    { ...mockValidContext, logger: {} },
  ])('rejects malformed context %p', async (value) => {
    mockContext = value;
    await expect(contextFor(() => Promise.resolve(null))).rejects.toThrow(
      'The durable runtime did not provide a durable context',
    );
  });

  test('reuses its loaded wrapper on subsequent calls', async () => {
    const wrapped = durable((input: number) => Promise.resolve(input + 1));
    await expect(wrapped(1, {})).resolves.toBe(2);
    await expect(wrapped(2, {})).resolves.toBe(3);
    expect(mockWrap).toHaveBeenCalledTimes(1);
  });
});

describe('invalid operation calls from untyped JavaScript', () => {
  test('refuses a step without a callback', async () => {
    await expect(
      contextFor((_input, context) => {
        const rejected: unknown = Reflect.apply(context.step.bind(context), context, ['named']);
        return Promise.resolve(rejected);
      }),
    ).rejects.toThrow('ctx.step() requires a function to run');
  });

  test('refuses a child without a callback', async () => {
    await expect(
      contextFor((_input, context) => {
        const rejected: unknown = Reflect.apply(context.child.bind(context), context, ['named']);
        return Promise.resolve(rejected);
      }),
    ).rejects.toThrow('ctx.child() requires a function to run');
  });

  test('refuses a map without a callback', async () => {
    await expect(
      contextFor((_input, context) => {
        const rejected: unknown = Reflect.apply(context.map.bind(context), context, ['named', []]);
        return Promise.resolve(rejected);
      }),
    ).rejects.toThrow('ctx.map() requires a function to run');
  });

  test('refuses non-array map items', async () => {
    await expect(
      contextFor((_input, context) => {
        const rejected: unknown = Reflect.apply(context.map.bind(context), context, [
          'named',
          'not items',
          () => Promise.resolve(null),
        ]);
        return Promise.resolve(rejected);
      }),
    ).rejects.toThrow('ctx.map() requires an array of items');
  });

  test('refuses a condition without a callback', async () => {
    await expect(
      contextFor((_input, context) => {
        const rejected: unknown = Reflect.apply(context.waitUntil.bind(context), context, [
          'named',
          null,
          { initialState: 0, until: () => true },
        ]);
        return Promise.resolve(rejected);
      }),
    ).rejects.toThrow('ctx.waitUntil() requires a function to run');
  });

  test('refuses a non-string wait name', async () => {
    await expect(
      contextFor((_input, context) => {
        const rejected: unknown = Reflect.apply(context.wait.bind(context), context, [30, '5m']);
        return Promise.resolve(rejected);
      }),
    ).rejects.toThrow('ctx.wait() takes a name and a duration, or a duration alone');
  });
});

describe('typed durable operations', () => {
  test('passes input, step scope, and retry semantics through the engine', async () => {
    const result = await durable((input: number, context) =>
      context.step('charge', (scope) => Promise.resolve(input + scope.attempt), {
        atMostOnce: true,
      }),
    )(4, {});

    expect(result).toBe(6);
    expect(mockValidContext.step).toHaveBeenCalledWith('charge', expect.any(Function), {
      semantics: 'AT_MOST_ONCE_PER_RETRY',
    });
  });

  test('supports an unnamed step and default options', async () => {
    await expect(
      contextFor((_input, context) => context.step(() => Promise.resolve('done'))),
    ).resolves.toBe('done');
    expect(mockValidContext.step).toHaveBeenCalledWith(undefined, expect.any(Function), {});
  });

  test('supports named and unnamed waits', async () => {
    await contextFor(async (_input, context) => {
      await context.wait('settle', '30s');
      await context.wait('45s');
      return null;
    });
    expect(mockValidContext.wait).toHaveBeenNthCalledWith(1, 'settle', { seconds: 30 });
    expect(mockValidContext.wait).toHaveBeenNthCalledWith(2, { seconds: 45 });
  });

  test('scopes named and unnamed child operations', async () => {
    await expect(
      contextFor(async (_input, context) => {
        const named = await context.child('subflow', (child) =>
          child.step(() => Promise.resolve('a')),
        );
        const unnamed = await context.child(() => Promise.resolve('b'));
        return named + unnamed;
      }),
    ).resolves.toBe('ab');
    expect(mockValidContext.runInChildContext).toHaveBeenNthCalledWith(
      1,
      'subflow',
      expect.any(Function),
    );
    expect(mockValidContext.runInChildContext).toHaveBeenNthCalledWith(
      2,
      undefined,
      expect.any(Function),
    );
  });

  test('adapts named and unnamed condition checks', async () => {
    await expect(
      contextFor(async (_input, context) => {
        const named = await context.waitUntil(
          'approval',
          (state: number, scope) => Promise.resolve(state + scope.attempt),
          { initialState: 1, until: (state) => state > 1 },
        );
        const unnamed = await context.waitUntil((state: number) => Promise.resolve(state + 1), {
          initialState: 2,
          until: (state) => state > 2,
        });
        return named + unnamed;
      }),
    ).resolves.toBe(5);
    expect(mockValidContext.waitForCondition).toHaveBeenNthCalledWith(
      1,
      'approval',
      expect.any(Function),
      expect.objectContaining({ initialState: 1 }),
    );
    expect(mockValidContext.waitForCondition).toHaveBeenNthCalledWith(
      2,
      undefined,
      expect.any(Function),
      expect.objectContaining({ initialState: 2 }),
    );
  });

  test('adapts named and unnamed maps', async () => {
    await expect(
      contextFor(async (_input, context) => {
        const named = await context.map(
          'double',
          [1, 2],
          (item, child, index) => child.step(() => Promise.resolve(item * 2 + index)),
          { concurrency: 2 },
        );
        const unnamed = await context.map(['a'], (item) => Promise.resolve(item.toUpperCase()));
        return [named.results, unnamed.results];
      }),
    ).resolves.toEqual([[2, 5], ['A']]);
    expect(mockValidContext.map).toHaveBeenNthCalledWith(
      1,
      'double',
      [1, 2],
      expect.any(Function),
      { maxConcurrency: 2 },
    );
  });

  test('adapts named and unnamed parallel branches', async () => {
    await expect(
      contextFor(async (_input, context) => {
        const named = await context.parallel('fanout', [
          (child) => child.step(() => Promise.resolve('a')),
          { name: 'right', run: () => Promise.resolve('b') },
        ]);
        const unnamed = await context.parallel([() => Promise.resolve('c')]);
        return [named.results, unnamed.results];
      }),
    ).resolves.toEqual([['a', 'b'], ['c']]);
    expect(mockValidContext.parallel).toHaveBeenNthCalledWith(1, 'fanout', expect.any(Array), {});
  });

  test('configures a supplied logger before the handler', async () => {
    await durable(() => Promise.resolve(null), { logger: mockLogger })({}, {});
    expect(mockValidContext.configureLogger).toHaveBeenCalledWith({ customLogger: mockLogger });
  });
});
