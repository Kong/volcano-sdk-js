import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { durable } from '../src/durable.ts';
import type { EngineBatch } from '../src/durable-batch-result.ts';
import type {
  DurableContext,
  DurableHandler,
  DurableLog,
  DurableStepScope,
} from '../src/durable-types.ts';
// The durable runtime is an optional peer dependency, so these tests stand a
// recording double in its place and assert on what the facade hands it. That is the contract worth pinning here: the
// translation from the Volcano authoring surface to the engine's own — argument
// order, duration form, config field names.
//
// A durable function written against this module is exercised for real by the
// hosting cloud E2E suite, which deploys one and runs an execution.

interface EngineCall {
  op: string;
  name?: unknown;
  config?: Record<string, unknown>;
  duration?: unknown;
  items?: unknown[];
  branches?: unknown[];
}

interface EngineBatchItem {
  index: number;
  status: 'SUCCEEDED' | 'FAILED' | 'STARTED';
  result?: unknown;
  error?: unknown;
}

interface EngineScope {
  logger: DurableLog;
  attempt: number;
}

type EngineBranch =
  | ((context: RecordingContext) => Promise<unknown>)
  | { name: unknown; func: (context: RecordingContext) => Promise<unknown> };

interface RecordingContext {
  logger: DurableLog;
  configureLogger: ReturnType<typeof jest.fn<(config: unknown) => void>>;
  step(
    name: unknown,
    fn: (scope: EngineScope) => Promise<unknown>,
    config: Record<string, unknown>,
  ): Promise<unknown>;
  wait(name: unknown, duration?: unknown): Promise<void>;
  runInChildContext(
    name: unknown,
    fn: (context: RecordingContext) => Promise<unknown>,
  ): Promise<unknown>;
  waitForCondition(
    name: unknown,
    checkFn: (state: unknown, scope: EngineScope) => Promise<unknown>,
    config: { initialState: unknown },
  ): Promise<unknown>;
  map(
    name: unknown,
    items: unknown[],
    mapFn: (
      context: RecordingContext,
      item: unknown,
      index: number,
      items: unknown[],
    ) => Promise<unknown>,
    config: Record<string, unknown>,
  ): Promise<EngineBatch<unknown>>;
  parallel(
    name: unknown,
    branches: EngineBranch[],
    config: Record<string, unknown>,
  ): Promise<EngineBatch<unknown>>;
}

const engineCalls: EngineCall[] = [];

const fakeStepSemantics = {
  AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY',
  AtLeastOncePerRetry: 'AT_LEAST_ONCE_PER_RETRY',
};

// The engine's own batch result: methods and upper-case statuses, which the
// facade flattens.
// The engine settles every item and reports failures in the batch rather than
// rejecting, so the double does the same: a branch that throws is a failed item.
const fakeBatchItem = (settled: PromiseSettledResult<unknown>, index: number): EngineBatchItem =>
  settled.status === 'fulfilled'
    ? { index, status: 'SUCCEEDED', result: settled.value }
    : { index, status: 'FAILED', error: settled.reason };

const fakeBatch = (items: EngineBatchItem[], completionReason = 'ALL_COMPLETED') => ({
  all: items,
  getResults: () => items.filter((item) => item.status === 'SUCCEEDED').map((item) => item.result),
  getErrors: () => items.filter((item) => item.error !== undefined).map((item) => item.error),
  successCount: items.filter((item) => item.status === 'SUCCEEDED').length,
  failureCount: items.filter((item) => item.status === 'FAILED').length,
  startedCount: items.filter((item) => item.status === 'STARTED').length,
  totalCount: items.length,
  completionReason,
  throwIfError() {
    engineCalls.push({ op: 'throwIfError' });
  },
});

// A batch the test hands back verbatim, for the shapes the double cannot reach
// by running mappers: an early completion with items still in flight, and the
// same batch as the engine rebuilds it on a replay.
let stagedBatch: EngineBatch<unknown> | null = null;
const stageBatch = (batch: EngineBatch<unknown>): void => {
  stagedBatch = batch;
};
const takeStagedBatch = (): EngineBatch<unknown> | null => {
  const batch = stagedBatch;
  stagedBatch = null;
  return batch;
};

const lastContext: { value?: RecordingContext } = {};

const fakeContext = (): RecordingContext => {
  const context: RecordingContext = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    configureLogger: jest.fn<(config: unknown) => void>(),

    step(name, fn, config) {
      engineCalls.push({ op: 'step', name, config });
      return Promise.resolve(fn({ logger: context.logger, attempt: 2 }));
    },

    wait(name, duration) {
      engineCalls.push({ op: 'wait', name, duration });
      return Promise.resolve();
    },

    runInChildContext(name, fn) {
      engineCalls.push({ op: 'child', name });
      return Promise.resolve(fn(context));
    },

    waitForCondition(name, checkFn, config) {
      engineCalls.push({ op: 'waitForCondition', name, config });
      return Promise.resolve(checkFn(config.initialState, { logger: context.logger, attempt: 1 }));
    },

    map(name, items, mapFn, config) {
      engineCalls.push({ op: 'map', name, items, config });
      const staged = takeStagedBatch();
      if (staged !== null) {
        return Promise.resolve(staged);
      }
      return Promise.allSettled(
        items.map((item, index) => mapFn(context, item, index, items)),
      ).then((settled) => fakeBatch(settled.map((item, index) => fakeBatchItem(item, index))));
    },

    parallel(name, branches, config) {
      engineCalls.push({ op: 'parallel', name, branches, config });
      return Promise.allSettled(
        branches.map((branch) =>
          typeof branch === 'function' ? branch(context) : branch.func(context),
        ),
      ).then((settled) => fakeBatch(settled.map((item, index) => fakeBatchItem(item, index))));
    },
  };
  lastContext.value = context;
  return context;
};

// The engine merges a strategy config over its own defaults with a spread, so a
// key present with an undefined value replaces the default instead of falling
// back to it — and an absent delay is then read for a unit it does not have,
// which throws on the first failure. The double holds the facade to that: a
// config carrying a key the caller never set fails here.
const engineStrategyConfig = (
  op: string,
  config: Record<string, unknown>,
): Record<string, unknown> => {
  const unset = Object.keys(config).filter((key) => config[key] === undefined);
  if (unset.length > 0) {
    throw new TypeError(`${op} was given undefined ${unset.join(', ')}, which clobbers a default`);
  }
  return config;
};

const neverRetry = (): { shouldRetry: false } => ({ shouldRetry: false });
const neverContinue = (): { shouldContinue: false } => ({ shouldContinue: false });

jest.mock(
  '@aws/durable-execution-sdk-js',
  () => ({
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) =>
      (event: { input: unknown }) =>
        handler(event.input, fakeContext()),
    StepSemantics: fakeStepSemantics,
    createRetryStrategy(config: Record<string, unknown>) {
      engineCalls.push({
        op: 'createRetryStrategy',
        config: engineStrategyConfig('retry', config),
      });
      return neverRetry;
    },
    createWaitStrategy(config: Record<string, unknown>) {
      engineCalls.push({ op: 'createWaitStrategy', config: engineStrategyConfig('wait', config) });
      return neverContinue;
    },
  }),
  { virtual: true },
);

async function run<Input = Record<string, never>, Result = unknown>(
  handler: DurableHandler<Input, Result>,
  input?: Input,
): Promise<Result> {
  const completion: { result?: { value: Result } } = {};
  await durable(async (value: Input, context: DurableContext) => {
    const result = await handler(value, context);
    completion.result = { value: result };
    return result;
  })({ input: input ?? {} }, {});
  if (completion.result === undefined) {
    throw new Error('Durable handler did not complete');
  }
  return completion.result.value;
}

const callsOf = (op: string): EngineCall[] => engineCalls.filter((call) => call.op === op);

function firstCall(op: string): EngineCall {
  const call = callsOf(op)[0];
  if (call === undefined) {
    throw new Error(`Missing ${op} engine call`);
  }
  return call;
}

function configOf(op: string): Record<string, unknown> {
  const config = firstCall(op).config;
  if (config === undefined) {
    throw new Error(`Missing ${op} engine config`);
  }
  return config;
}

function required<Value>(value: Value | null | undefined, name: string): Value {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

function invoke(value: unknown, args: unknown[]): unknown {
  if (typeof value !== 'function') {
    throw new TypeError('Expected engine callback');
  }
  const result: unknown = Reflect.apply(value, undefined, args);
  return result;
}

const retryOnce = (): { shouldRetry: true; delay: { seconds: 1 } } => ({
  shouldRetry: true,
  delay: { seconds: 1 },
});

const shipped = (batch: EngineBatch<unknown>) => {
  stageBatch(batch);
  return run((_input, ctx) =>
    ctx.map('ship', ['a', 'b', 'c'], (item) => Promise.resolve(item), { minSucceeded: 2 }),
  );
};

beforeEach(() => {
  engineCalls.length = 0;
  stagedBatch = null;
});

describe('durable()', () => {
  it('calls the handler with the execution input and a durable context', async () => {
    const result = await run(
      (input, ctx) => {
        expect(typeof ctx.step).toBe('function');
        return Promise.resolve({ got: input.order_id });
      },
      { order_id: 4417 },
    );

    expect(result).toEqual({ got: 4417 });
  });

  it('refuses anything but a function', () => {
    expect(() => {
      const result: unknown = Reflect.apply(durable, undefined, ['index.handler']);
      return result;
    }).toThrow(/requires a handler function/);
  });
});

describe('ctx.step', () => {
  it('runs the function and returns its result', async () => {
    const result = await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('charged')));

    expect(result).toBe('charged');
    expect(firstCall('step').name).toBe('charge');
  });

  it('hands the step its attempt number and a logger, not a durable context', async () => {
    const captured: { value?: DurableStepScope } = {};
    await run((_input, ctx) =>
      ctx.step('charge', (stepScope) => {
        captured.value = stepScope;
        return Promise.resolve(null);
      }),
    );

    const scope = required(captured.value, 'step scope');
    expect(scope.attempt).toBe(2);
    expect(typeof scope.log.info).toBe('function');
    expect(Reflect.get(scope, 'step')).toBeUndefined();
  });

  it('takes an unnamed step', async () => {
    await run((_input, ctx) => ctx.step(() => Promise.resolve('ok')));

    expect(firstCall('step').name).toBeUndefined();
  });

  it('turns retry: false into a strategy that never retries', async () => {
    await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('ok'), { retry: false }));

    const config = configOf('step');
    expect(invoke(config['retryStrategy'], [new Error('boom'), 1])).toEqual({ shouldRetry: false });
    expect(callsOf('createRetryStrategy')).toHaveLength(0);
  });

  it('converts retry options, durations included', async () => {
    await run((_input, ctx) =>
      ctx.step('charge', () => Promise.resolve('ok'), {
        retry: { attempts: 5, initialDelay: '2s', maxDelay: '1m30s', backoffRate: 3 },
      }),
    );

    expect(configOf('createRetryStrategy')).toStrictEqual({
      maxAttempts: 5,
      initialDelay: { seconds: 2 },
      maxDelay: { minutes: 1, seconds: 30 },
      backoffRate: 3,
    });
  });

  // What the caller leaves out has to reach the engine as left out. Naming it
  // with an undefined value overrode the engine's default, and the first
  // failure of a step written the way the guide writes one died reading a
  // duration that was not there.
  it('sends only the retry options the caller set', async () => {
    await run((_input, ctx) =>
      ctx.step('charge', () => Promise.resolve('ok'), {
        retry: { attempts: 5, initialDelay: '2s' },
      }),
    );

    expect(configOf('createRetryStrategy')).toStrictEqual({
      maxAttempts: 5,
      initialDelay: { seconds: 2 },
    });
  });

  it('passes a retry function through untouched', async () => {
    await run((_input, ctx) =>
      ctx.step('charge', () => Promise.resolve('ok'), { retry: retryOnce }),
    );

    expect(configOf('step')['retryStrategy']).toBe(retryOnce);
  });

  it('maps atMostOnce onto the engine semantics', async () => {
    await run((_input, ctx) =>
      ctx.step('charge', () => Promise.resolve('ok'), { atMostOnce: true }),
    );

    expect(configOf('step')['semantics']).toBe(fakeStepSemantics.AtMostOncePerRetry);
  });

  it('leaves the semantics alone for atMostOnce: false', async () => {
    await run((_input, ctx) =>
      ctx.step('charge', () => Promise.resolve('ok'), { atMostOnce: false }),
    );

    expect(configOf('step')).toStrictEqual({});
  });

  it('leaves retry and semantics unset when neither is asked for', async () => {
    await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('ok')));

    expect(configOf('step')).toEqual({});
  });

  it('refuses a step with nothing to run', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.step.bind(ctx), undefined, ['charge']);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/ctx\.step\(\) requires a function to run/);
  });
});

describe('ctx.wait', () => {
  it.each([
    ['30s', { seconds: 30 }],
    ['5m', { minutes: 5, seconds: 0 }],
    ['2h', { hours: 2, minutes: 0, seconds: 0 }],
    ['1d', { days: 1, hours: 0, minutes: 0, seconds: 0 }],
    [45, { seconds: 45 }],
    [{ minutes: 90 }, { minutes: 90 }],
  ])('accepts %p as a duration', async (given, expected) => {
    await run((_input, ctx) => ctx.wait('pause', given));

    expect(firstCall('wait').duration).toEqual(expected);
  });

  it('takes an unnamed wait', async () => {
    await run((_input, ctx) => ctx.wait('90s'));

    const call = firstCall('wait');
    expect(call.name).toEqual({ minutes: 1, seconds: 30 });
    expect(call.duration).toBeUndefined();
  });

  it('refuses a duration where the name belongs', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.wait.bind(ctx), undefined, [30, '5m']);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/ctx\.wait\(\) takes a name and a duration, or a duration alone/);
  });

  it('refuses a duration object that holds no duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', {}))).rejects.toThrow(
      /wait duration needs one of days, hours, minutes, seconds/,
    );
  });

  it('names what is wrong with an unparseable duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', 'soon'))).rejects.toThrow(
      /wait must be a duration in whole seconds, such as '30s'.*got 'soon'/,
    );
  });

  it('refuses a negative duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', -1))).rejects.toThrow(
      /non-negative whole number of seconds/,
    );
  });

  // The duration the engine takes carries whole seconds, so a sub-second value
  // could only be rounded. It was: 'ms' parsed, and '400ms' became a wait of
  // nothing while '500ms' became a second. A wait that does not happen is worse
  // than one that is refused, since the code reads as if it paused.
  it.each(['400ms', '500ms', '2000ms', `${'9'.repeat(400)}s`])(
    'rejects an unrepresentable duration: %p',
    async (given) => {
      await expect(run((_input, ctx) => ctx.wait('pause', given))).rejects.toThrow(
        /must be a duration in whole seconds/,
      );
    },
  );

  it('refuses a fraction of a second', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', 0.4))).rejects.toThrow(
      /non-negative whole number of seconds/,
    );
  });

  // The object form went to the engine unread, so a plausible-looking key was a
  // duration of nothing.
  it('refuses a duration object it does not understand', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.wait.bind(ctx), undefined, [
          'pause',
          { milliseconds: 500 },
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/takes days, hours, minutes, seconds \(got milliseconds\)/);
  });

  it('refuses a duration object with a fractional part', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', { seconds: 1.5 }))).rejects.toThrow(
      /seconds must be a non-negative whole number/,
    );
  });
});

describe('ctx.wait bounds', () => {
  // A zero wait passes every shape check and is refused by the platform, which
  // means the execution fails partway through -- after earlier steps have run
  // and been charged -- rather than at the call that was wrong.
  it.each([0, '0s', { seconds: 0 }, { minutes: 0, seconds: 0 }])(
    'refuses a wait of nothing (%p)',
    async (duration) => {
      await expect(run((_input, ctx) => ctx.wait('cool-off', duration))).rejects.toThrow(
        /wait must be at least 1 second/,
      );
    },
  );

  // The other end is the execution ceiling: a wait longer than an execution may
  // live cannot elapse.
  it('refuses a wait longer than an execution may run', async () => {
    await expect(run((_input, ctx) => ctx.wait('cool-off', { days: 367 }))).rejects.toThrow(
      /wait must be at most 31622400 seconds/,
    );
  });

  it('takes the shortest wait the platform accepts', async () => {
    await run((_input, ctx) => ctx.wait('cool-off', '1s'));

    expect(firstCall('wait').duration).toEqual({ seconds: 1 });
  });
});

describe('ctx.child', () => {
  it('runs the child against a durable context of its own', async () => {
    const result = await run((_input, ctx) =>
      ctx.child('pipeline', async (childCtx) => {
        await childCtx.wait('settle', '10s');
        return childCtx.step('finish', () => Promise.resolve('done'));
      }),
    );

    expect(result).toBe('done');
    expect(firstCall('child').name).toBe('pipeline');
    expect(firstCall('wait').duration).toEqual({ seconds: 10 });
    expect(firstCall('step').name).toBe('finish');
  });

  it('takes an unnamed child', async () => {
    const result = await run((_input, ctx) => ctx.child(() => Promise.resolve('done')));

    expect(result).toBe('done');
    expect(firstCall('child').name).toBeUndefined();
  });
});

describe('ctx.waitUntil', () => {
  it('inverts until into the engine polling predicate', async () => {
    await run((_input, ctx) =>
      ctx.waitUntil('approval', (state) => Promise.resolve({ ...state, approved: true }), {
        initialState: { approved: false },
        until: (state) => state.approved,
        interval: '15s',
        maxInterval: '5m',
        maxAttempts: 40,
      }),
    );

    const config = configOf('waitForCondition');
    expect(config['initialState']).toEqual({ approved: false });

    const strategy = configOf('createWaitStrategy');
    expect(invoke(strategy['shouldContinuePolling'], [{ approved: false }])).toBe(true);
    expect(invoke(strategy['shouldContinuePolling'], [{ approved: true }])).toBe(false);
    expect(strategy['initialDelay']).toEqual({ seconds: 15 });
    expect(strategy['maxDelay']).toEqual({ minutes: 5, seconds: 0 });
    expect(strategy['maxAttempts']).toBe(40);
  });

  it('sends only the polling options the caller set', async () => {
    await run((_input, ctx) =>
      ctx.waitUntil('approval', (state) => Promise.resolve(state), {
        initialState: { approved: false },
        until: (state) => state.approved,
      }),
    );

    expect(Object.keys(configOf('createWaitStrategy'))).toStrictEqual(['shouldContinuePolling']);
  });

  // The engine's wait strategy has no deadline: it bounds a condition by how
  // many times it is checked. `timeout` was accepted, forwarded to a field
  // nothing reads, and a wait meant to give up after an hour polled on.
  it('refuses a timeout it cannot enforce', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.waitUntil.bind(ctx), undefined, [
          'approval',
          (state: unknown) => Promise.resolve(state),
          { initialState: {}, until: () => true, timeout: '1h' },
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/has no `timeout`: bound the wait with `maxAttempts`/);
  });

  it('returns the state the check produced', async () => {
    const result = await run((_input, ctx) =>
      ctx.waitUntil((state) => Promise.resolve({ checks: state.checks + 1 }), {
        initialState: { checks: 0 },
        until: (state) => state.checks > 0,
      }),
    );

    expect(result).toEqual({ checks: 1 });
    expect(firstCall('waitForCondition').name).toBeUndefined();
  });

  it('requires an until predicate', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.waitUntil.bind(ctx), undefined, [
          'approval',
          (state: unknown) => Promise.resolve(state),
          { interval: '5s' },
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/requires an `until` predicate/);
  });

  // The engine refuses a condition with no initialState, in a message about its
  // own config rather than the options written here. Forwarding the undefined
  // left the caller reading that message.
  it('requires an initialState, in terms of the option it is given as', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.waitUntil.bind(ctx), undefined, [
          'approval',
          (state: unknown) => Promise.resolve(state),
          { until: Boolean },
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/requires an `initialState` in its options/);
  });

  it('takes a falsy initialState as a state, not as an omission', async () => {
    await run((_input, ctx) =>
      ctx.waitUntil('approval', () => Promise.resolve(1), {
        initialState: 0,
        until: (state) => state > 0,
      }),
    );

    expect(configOf('waitForCondition')['initialState']).toBe(0);
  });
});

describe('ctx.map', () => {
  it('hands the item first and the context second, and flattens the batch', async () => {
    const seen: { item: string; index: number; isContext: boolean }[] = [];
    const result = await run((_input, ctx) =>
      ctx.map('ship', ['a', 'b'], (item, itemCtx, index) => {
        seen.push({ item, index, isContext: typeof itemCtx.step === 'function' });
        return Promise.resolve(item.toUpperCase());
      }),
    );

    expect(seen).toEqual([
      { item: 'a', index: 0, isContext: true },
      { item: 'b', index: 1, isContext: true },
    ]);
    expect(result.results).toEqual(['A', 'B']);
    expect(result.items).toEqual([
      { index: 0, status: 'succeeded', result: 'A', error: undefined },
      { index: 1, status: 'succeeded', result: 'B', error: undefined },
    ]);
    expect(result).toMatchObject({
      succeeded: 2,
      failed: 0,
      completed: 2,
      completionReason: 'all_completed',
      errors: [],
    });
  });

  it('translates the batch options', async () => {
    await run((_input, ctx) =>
      ctx.map('ship', [1], (item) => Promise.resolve(item), { concurrency: 4, minSucceeded: 1 }),
    );

    expect(configOf('map')).toEqual({
      maxConcurrency: 4,
      completionConfig: { minSuccessful: 1 },
    });
  });

  it('takes an unnamed map', async () => {
    await run((_input, ctx) => ctx.map([1, 2], (item) => Promise.resolve(item * 2)));

    const call = firstCall('map');
    expect(call.name).toBeUndefined();
    expect(call.items).toEqual([1, 2]);
  });

  it('refuses items that are not an array', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.map.bind(ctx), undefined, [
          'ship',
          'a,b',
          (item: unknown) => Promise.resolve(item),
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/requires an array of items/);
  });

  it('reports a failed item instead of rejecting', async () => {
    const failure = new Error('cannot ship b');
    const result = await run((_input, ctx) =>
      ctx.map('ship', ['a', 'b'], (item) => {
        if (item === 'b') {
          return Promise.reject(failure);
        }
        return Promise.resolve(item.toUpperCase());
      }),
    );

    // `results` holds what succeeded, so it is not aligned with the input; the
    // input order lives in `items`.
    expect(result.results).toEqual(['A']);
    expect(result.items).toEqual([
      { index: 0, status: 'succeeded', result: 'A', error: undefined },
      {
        index: 1,
        status: 'failed',
        result: undefined,
        error: { name: 'Error', message: 'cannot ship b' },
      },
    ]);
    expect(result).toMatchObject({
      succeeded: 1,
      failed: 1,
      completed: 2,
      errors: [{ name: 'Error', message: 'cannot ship b' }],
    });
  });

  it('delegates throwIfFailed to the batch', async () => {
    const result = await run((_input, ctx) =>
      ctx.map('ship', [1], (item) => Promise.resolve(item)),
    );
    result.throwIfFailed();

    expect(callsOf('throwIfError')).toHaveLength(1);
  });

  // `minSucceeded` ends the batch with items still running, and the engine does
  // not promise to rebuild those when the execution resumes: the in-flight
  // entries and the total it counted live can both come back different. A
  // handler that saw them would branch one way live and another way on the
  // replay, which is the one thing durable execution is supposed to rule out.
  // So the result a handler is given has to be the same both times.
  it('gives the same result live and on the replay of an early completion', async () => {
    // Live: two finished, the third was still going when the batch completed.
    const live = await shipped(
      fakeBatch(
        [
          { index: 0, status: 'SUCCEEDED', result: 'a' },
          { index: 1, status: 'SUCCEEDED', result: 'b' },
          { index: 2, status: 'STARTED' },
        ],
        'MIN_SUCCESSFUL_REACHED',
      ),
    );

    // Resumed: the engine rebuilt the completed items only.
    const replayed = await shipped(
      fakeBatch(
        [
          { index: 0, status: 'SUCCEEDED', result: 'a' },
          { index: 1, status: 'SUCCEEDED', result: 'b' },
        ],
        'MIN_SUCCESSFUL_REACHED',
      ),
    );

    expect(live.items).toEqual([
      { index: 0, status: 'succeeded', result: 'a', error: undefined },
      { index: 1, status: 'succeeded', result: 'b', error: undefined },
    ]);
    expect(live.completed).toBe(2);
    expect(live.completionReason).toBe('min_successful_reached');
    expect(JSON.stringify(live)).toEqual(JSON.stringify(replayed));
  });

  // The result is documented as surviving JSON.stringify, and an Error does not:
  // `message` and `name` are non-enumerable, so serializing the engine's own
  // error kept its errorType and dropped the field anybody actually reads.
  it('keeps a failure readable through JSON', async () => {
    // The engine's shape: an Error subclass carrying its own classification.
    class ChildContextError extends Error {
      errorType: string;
      errorData: string;

      constructor(message: string) {
        super(message);
        this.name = 'ChildContextError';
        this.errorType = 'ChildContextError';
        this.errorData = '{"code":"card_declined"}';
      }
    }

    stageBatch(
      fakeBatch([{ index: 0, status: 'FAILED', error: new ChildContextError('cannot ship a') }]),
    );
    const result = await run((_input, ctx) =>
      ctx.map('ship', ['a'], (item) => Promise.resolve(item)),
    );

    const encoded = JSON.stringify(result);
    const serialized: unknown = JSON.parse(encoded);
    const expectedError = {
      name: 'ChildContextError',
      message: 'cannot ship a',
      type: 'ChildContextError',
      data: '{"code":"card_declined"}',
    };
    expect(serialized).toHaveProperty('items.0.error', expectedError);
    expect(serialized).toHaveProperty('errors.0', expectedError);
  });

  // Throwing is not reporting: a handler that wants to propagate the failure
  // gets the engine's own error, stack and all.
  it('still throws the engine error from throwIfFailed', async () => {
    stageBatch(fakeBatch([{ index: 0, status: 'FAILED', error: new Error('cannot ship a') }]));
    const result = await run((_input, ctx) =>
      ctx.map('ship', ['a'], (item) => Promise.resolve(item)),
    );

    result.throwIfFailed();
    expect(callsOf('throwIfError')).toHaveLength(1);
  });
});

describe('ctx.parallel', () => {
  it('runs plain branch functions with a durable context', async () => {
    const result = await run((_input, ctx) =>
      ctx.parallel('fanout', [
        (branchCtx) => branchCtx.step('left', () => Promise.resolve('l')),
        (branchCtx) => branchCtx.step('right', () => Promise.resolve('r')),
      ]),
    );

    expect(result.results).toEqual(['l', 'r']);
    expect(callsOf('step').map((call) => call.name)).toEqual(['left', 'right']);
  });

  it('keeps a named branch name and adapts it to the engine shape', async () => {
    await run((_input, ctx) =>
      ctx.parallel('fanout', [{ name: 'charge', run: () => Promise.resolve('ok') }], {
        concurrency: 2,
      }),
    );

    const call = firstCall('parallel');
    expect(call.branches).toEqual([
      expect.objectContaining({ name: 'charge', func: expect.any(Function) }),
    ]);
    expect(call.config).toEqual({ maxConcurrency: 2 });
  });

  it('takes an unnamed parallel', async () => {
    await run((_input, ctx) => ctx.parallel([() => Promise.resolve('ok')]));

    expect(firstCall('parallel').name).toBeUndefined();
  });

  it('refuses a branch that is neither a function nor { name, run }', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.parallel.bind(ctx), undefined, [
          'fanout',
          [{ name: 'charge' }],
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/a parallel branch is a function, or \{ name, run \}/);
  });

  it('refuses branches that are not an array', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.parallel.bind(ctx), undefined, [
          'fanout',
          'left',
        ]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/requires an array of branches/);
  });
});

describe('logging', () => {
  // ctx.log is the operation's logger rather than the process's, which is what
  // suppresses a replayed line from being written twice.
  it('exposes the operation logger as ctx.log', async () => {
    const captured: { value?: DurableLog } = {};
    await run((_input, ctx) => {
      captured.value = ctx.log;
      ctx.log.info('started', { order: 1 });
      return Promise.resolve(null);
    });

    const log = required(captured.value, 'operation logger');
    expect(Reflect.get(log, 'info')).toHaveBeenCalledWith('started', { order: 1 });
    expect(log).not.toBe(console);
  });

  it('installs a custom logger before the handler runs', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    const captured: { calls?: unknown } = {};

    await durable(
      async (_input, ctx) => {
        captured.calls = required(lastContext.value, 'engine context').configureLogger.mock.calls;
        return ctx.step('charge', () => Promise.resolve('ok'));
      },
      { logger },
    )({ input: {} }, {});

    expect(captured.calls).toEqual([[{ customLogger: logger }]]);
  });

  it('leaves the logger alone when the handler brings none', async () => {
    await run(() => Promise.resolve(null));

    expect(required(lastContext.value, 'engine context').configureLogger).not.toHaveBeenCalled();
  });
});
