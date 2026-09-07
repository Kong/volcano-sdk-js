// The durable runtime is an optional peer dependency, so these tests stand a
// recording double in its place and assert on what the facade hands it. That is the contract worth pinning here: the
// translation from the Volcano authoring surface to the engine's own — argument
// order, duration form, config field names.
//
// A durable function written against this module is exercised for real by the
// hosting cloud E2E suite, which deploys one and runs an execution.

const engineCalls = [];

const fakeStepSemantics = {
  AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY',
  AtLeastOncePerRetry: 'AT_LEAST_ONCE_PER_RETRY',
};

// The engine's own batch result: methods and upper-case statuses, which the
// facade flattens.
// The engine settles every item and reports failures in the batch rather than
// rejecting, so the double does the same: a branch that throws is a failed item.
const fakeBatchItem = (settled, index) =>
  settled.status === 'fulfilled'
    ? { index, status: 'SUCCEEDED', result: settled.value }
    : { index, status: 'FAILED', error: settled.reason };

const fakeBatch = (items) => ({
  all: items,
  getResults: () => items.filter((item) => item.status === 'SUCCEEDED').map((item) => item.result),
  getErrors: () => items.filter((item) => item.error).map((item) => item.error),
  successCount: items.filter((item) => item.status === 'SUCCEEDED').length,
  failureCount: items.filter((item) => item.status === 'FAILED').length,
  totalCount: items.length,
  throwIfError: () => {
    engineCalls.push({ op: 'throwIfError' });
  },
});

const fakeContext = () => {
  const context = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    configureLogger: jest.fn(),

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
      return Promise.allSettled(
        items.map((item, index) => mapFn(context, item, index, items)),
      ).then((settled) => fakeBatch(settled.map(fakeBatchItem)));
    },

    parallel(name, branches, config) {
      engineCalls.push({ op: 'parallel', name, branches, config });
      return Promise.allSettled(
        branches.map((branch) =>
          typeof branch === 'function' ? branch(context) : branch.func(context),
        ),
      ).then((settled) => fakeBatch(settled.map(fakeBatchItem)));
    },
  };
  return context;
};

jest.mock(
  '@aws/durable-execution-sdk-js',
  () => ({
    withDurableExecution: (handler) => (event) => handler(event.input, fakeContext()),
    StepSemantics: fakeStepSemantics,
    createRetryStrategy: (config) => {
      engineCalls.push({ op: 'createRetryStrategy', config });
      return () => ({ shouldRetry: false });
    },
    createWaitStrategy: (config) => {
      engineCalls.push({ op: 'createWaitStrategy', config });
      return () => ({ shouldContinue: false });
    },
  }),
  { virtual: true },
);

const { durable } = require('../src/durable.js');

const run = async (handler, input = {}) => {
  const result = await durable(handler)({ input }, {});
  return result;
};

const callsOf = (op) => engineCalls.filter((call) => call.op === op);

beforeEach(() => {
  engineCalls.length = 0;
});

describe('durable()', () => {
  it('calls the handler with the execution input and a durable context', async () => {
    const result = await run(
      async (input, ctx) => {
        expect(typeof ctx.step).toBe('function');
        return { got: input.order_id };
      },
      { order_id: 4417 },
    );

    expect(result).toEqual({ got: 4417 });
  });

  it('refuses anything but a function', () => {
    expect(() => durable('index.handler')).toThrow(/requires a handler function/);
  });
});

describe('ctx.step', () => {
  it('runs the function and returns its result', async () => {
    const result = await run((_input, ctx) => ctx.step('charge', async () => 'charged'));

    expect(result).toBe('charged');
    expect(callsOf('step')[0].name).toBe('charge');
  });

  it('hands the step its attempt number and a logger, not a durable context', async () => {
    let scope;
    await run((_input, ctx) =>
      ctx.step('charge', async (stepScope) => {
        scope = stepScope;
        return null;
      }),
    );

    expect(scope.attempt).toBe(2);
    expect(typeof scope.log.info).toBe('function');
    expect(scope.step).toBeUndefined();
  });

  it('takes an unnamed step', async () => {
    await run((_input, ctx) => ctx.step(async () => 'ok'));

    expect(callsOf('step')[0].name).toBeUndefined();
  });

  it('turns retry: false into a strategy that never retries', async () => {
    await run((_input, ctx) => ctx.step('charge', async () => 'ok', { retry: false }));

    const { config } = callsOf('step')[0];
    expect(config.retryStrategy(new Error('boom'), 1)).toEqual({ shouldRetry: false });
    expect(callsOf('createRetryStrategy')).toHaveLength(0);
  });

  it('converts retry options, durations included', async () => {
    await run((_input, ctx) =>
      ctx.step('charge', async () => 'ok', {
        retry: { attempts: 5, initialDelay: '2s', maxDelay: '1m30s', backoffRate: 3 },
      }),
    );

    expect(callsOf('createRetryStrategy')[0].config).toEqual({
      maxAttempts: 5,
      initialDelay: { seconds: 2 },
      maxDelay: { minutes: 1, seconds: 30 },
      backoffRate: 3,
      retryableErrors: undefined,
      retryableErrorTypes: undefined,
    });
  });

  it('passes a retry function through untouched', async () => {
    const retry = () => ({ shouldRetry: true, delay: { seconds: 1 } });
    await run((_input, ctx) => ctx.step('charge', async () => 'ok', { retry }));

    expect(callsOf('step')[0].config.retryStrategy).toBe(retry);
  });

  it('maps atMostOnce onto the engine semantics', async () => {
    await run((_input, ctx) => ctx.step('charge', async () => 'ok', { atMostOnce: true }));

    expect(callsOf('step')[0].config.semantics).toBe(fakeStepSemantics.AtMostOncePerRetry);
  });

  it('leaves retry and semantics unset when neither is asked for', async () => {
    await run((_input, ctx) => ctx.step('charge', async () => 'ok'));

    expect(callsOf('step')[0].config).toEqual({});
  });

  it('refuses a step with nothing to run', async () => {
    await expect(run((_input, ctx) => ctx.step('charge'))).rejects.toThrow(
      /ctx\.step\(\) requires a function to run/,
    );
  });
});

describe('ctx.wait', () => {
  it.each([
    ['30s', { seconds: 30 }],
    ['5m', { minutes: 5, seconds: 0 }],
    ['2h', { hours: 2, minutes: 0, seconds: 0 }],
    ['1d', { days: 1, hours: 0, minutes: 0, seconds: 0 }],
    ['500ms', { seconds: 1 }],
    [45, { seconds: 45 }],
    [{ minutes: 90 }, { minutes: 90 }],
  ])('accepts %p as a duration', async (given, expected) => {
    await run((_input, ctx) => ctx.wait('pause', given));

    expect(callsOf('wait')[0].duration).toEqual(expected);
  });

  it('takes an unnamed wait', async () => {
    await run((_input, ctx) => ctx.wait('90s'));

    const call = callsOf('wait')[0];
    expect(call.name).toEqual({ minutes: 1, seconds: 30 });
    expect(call.duration).toBeUndefined();
  });

  it('names what is wrong with an unparseable duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', 'soon'))).rejects.toThrow(
      /wait must be a duration such as '30s'.*got 'soon'/,
    );
  });

  it('refuses a negative duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', -1))).rejects.toThrow(
      /non-negative number of seconds/,
    );
  });
});

describe('ctx.child', () => {
  it('runs the child against a durable context of its own', async () => {
    const result = await run((_input, ctx) =>
      ctx.child('pipeline', async (childCtx) => {
        await childCtx.wait('settle', '10s');
        return childCtx.step('finish', async () => 'done');
      }),
    );

    expect(result).toBe('done');
    expect(callsOf('child')[0].name).toBe('pipeline');
    expect(callsOf('wait')[0].duration).toEqual({ seconds: 10 });
    expect(callsOf('step')[0].name).toBe('finish');
  });
});

describe('ctx.waitUntil', () => {
  it('inverts until into the engine polling predicate', async () => {
    await run((_input, ctx) =>
      ctx.waitUntil('approval', async (state) => ({ ...state, approved: true }), {
        initialState: { approved: false },
        until: (state) => state.approved,
        interval: '15s',
        maxInterval: '5m',
        maxAttempts: 40,
        timeout: '1h',
      }),
    );

    const { config } = callsOf('waitForCondition')[0];
    expect(config.initialState).toEqual({ approved: false });

    const strategy = callsOf('createWaitStrategy')[0].config;
    expect(strategy.shouldContinuePolling({ approved: false })).toBe(true);
    expect(strategy.shouldContinuePolling({ approved: true })).toBe(false);
    expect(strategy.initialDelay).toEqual({ seconds: 15 });
    expect(strategy.maxDelay).toEqual({ minutes: 5, seconds: 0 });
    expect(strategy.maxAttempts).toBe(40);
    expect(strategy.timeoutSeconds).toBe(3600);
  });

  it('returns the state the check produced', async () => {
    const result = await run((_input, ctx) =>
      ctx.waitUntil(async (state) => ({ checks: state.checks + 1 }), {
        initialState: { checks: 0 },
        until: (state) => state.checks > 0,
      }),
    );

    expect(result).toEqual({ checks: 1 });
    expect(callsOf('waitForCondition')[0].name).toBeUndefined();
  });

  it('requires an until predicate', async () => {
    await expect(
      run((_input, ctx) => ctx.waitUntil('approval', async (state) => state, { interval: '5s' })),
    ).rejects.toThrow(/requires an `until` predicate/);
  });
});

describe('ctx.map', () => {
  it('hands the item first and the context second, and flattens the batch', async () => {
    const seen = [];
    const result = await run((_input, ctx) =>
      ctx.map('ship', ['a', 'b'], async (item, itemCtx, index) => {
        seen.push({ item, index, isContext: typeof itemCtx.step === 'function' });
        return item.toUpperCase();
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
    expect(result).toMatchObject({ succeeded: 2, failed: 0, total: 2, errors: [] });
  });

  it('translates the batch options', async () => {
    await run((_input, ctx) =>
      ctx.map('ship', [1], async (item) => item, { concurrency: 4, minSucceeded: 1 }),
    );

    expect(callsOf('map')[0].config).toEqual({
      maxConcurrency: 4,
      completionConfig: { minSuccessful: 1 },
    });
  });

  it('takes an unnamed map', async () => {
    await run((_input, ctx) => ctx.map([1, 2], async (item) => item * 2));

    const call = callsOf('map')[0];
    expect(call.name).toBeUndefined();
    expect(call.items).toEqual([1, 2]);
  });

  it('refuses items that are not an array', async () => {
    await expect(run((_input, ctx) => ctx.map('ship', 'a,b', async (i) => i))).rejects.toThrow(
      /requires an array of items/,
    );
  });

  it('reports a failed item instead of rejecting', async () => {
    const failure = new Error('cannot ship b');
    const result = await run((_input, ctx) =>
      ctx.map('ship', ['a', 'b'], async (item) => {
        if (item === 'b') throw failure;
        return item.toUpperCase();
      }),
    );

    // `results` holds what succeeded, so it is not aligned with the input; the
    // input order lives in `items`.
    expect(result.results).toEqual(['A']);
    expect(result.items).toEqual([
      { index: 0, status: 'succeeded', result: 'A', error: undefined },
      { index: 1, status: 'failed', result: undefined, error: failure },
    ]);
    expect(result).toMatchObject({ succeeded: 1, failed: 1, total: 2, errors: [failure] });
  });

  it('delegates throwIfFailed to the batch', async () => {
    const result = await run((_input, ctx) => ctx.map('ship', [1], async (item) => item));
    result.throwIfFailed();

    expect(callsOf('throwIfError')).toHaveLength(1);
  });
});

describe('ctx.parallel', () => {
  it('runs plain branch functions with a durable context', async () => {
    const result = await run((_input, ctx) =>
      ctx.parallel('fanout', [
        (branchCtx) => branchCtx.step('left', async () => 'l'),
        (branchCtx) => branchCtx.step('right', async () => 'r'),
      ]),
    );

    expect(result.results).toEqual(['l', 'r']);
    expect(callsOf('step').map((call) => call.name)).toEqual(['left', 'right']);
  });

  it('keeps a named branch name and adapts it to the engine shape', async () => {
    await run((_input, ctx) =>
      ctx.parallel('fanout', [{ name: 'charge', run: async () => 'ok' }], { concurrency: 2 }),
    );

    const call = callsOf('parallel')[0];
    expect(call.branches[0].name).toBe('charge');
    expect(typeof call.branches[0].func).toBe('function');
    expect(call.config).toEqual({ maxConcurrency: 2 });
  });

  it('takes an unnamed parallel', async () => {
    await run((_input, ctx) => ctx.parallel([async () => 'ok']));

    expect(callsOf('parallel')[0].name).toBeUndefined();
  });

  it('refuses a branch that is neither a function nor { name, run }', async () => {
    await expect(
      run((_input, ctx) => ctx.parallel('fanout', [{ name: 'charge' }])),
    ).rejects.toThrow(/a parallel branch is a function, or \{ name, run \}/);
  });

  it('refuses branches that are not an array', async () => {
    await expect(run((_input, ctx) => ctx.parallel('fanout', 'left'))).rejects.toThrow(
      /requires an array of branches/,
    );
  });
});

describe('logging', () => {
  it('exposes the operation logger as ctx.log', async () => {
    await run(async (_input, ctx) => {
      ctx.log.info('started', { order: 1 });
      return null;
    });
  });

  it('installs a custom logger before the handler runs', async () => {
    const logger = { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() };
    let installed;

    await durable(
      async (_input, ctx) => {
        installed = ctx.log;
        return null;
      },
      { logger },
    )({ input: {} }, {});

    expect(installed).toBeDefined();
  });
});
