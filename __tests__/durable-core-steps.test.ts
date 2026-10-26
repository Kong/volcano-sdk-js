import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { durable } from '../src/durable.ts';
import type { DurableLog, DurableStepScope } from '../src/durable-types.ts';
import {
  callsOf,
  configOf,
  engineDouble,
  fakeStepSemantics,
  firstCall,
  invoke,
  lastContext,
  mockDurableRuntime,
  required,
  resetEngineDouble,
  retryOnce,
  run,
} from './support/durable-core-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

beforeEach(resetEngineDouble);

describe('durable()', () => {
  it('rejects an engine logger missing a required method', async () => {
    engineDouble.contextTransform = (context) => {
      Reflect.deleteProperty(context.logger, 'warn');
      return context;
    };
    await expect(run(() => Promise.resolve('unused'))).rejects.toThrow(
      'The durable runtime did not provide a durable context',
    );
  });

  it('rejects an engine context missing a required method', async () => {
    engineDouble.contextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCondition');
      return context;
    };
    await expect(run(() => Promise.resolve('unused'))).rejects.toThrow(
      'The durable runtime did not provide a durable context',
    );
  });

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
    }).toThrow(/requires a handler function/u);
  });
});

function runsSteps(): void {
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
}

function convertsRetryOptions(): void {
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
    await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('ok'), { retry: retryOnce }));

    expect(configOf('step')['retryStrategy']).toBe(retryOnce);
  });
}

function readsStepOptions(): void {
  it('maps atMostOnce onto the engine semantics', async () => {
    await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('ok'), { atMostOnce: true }));

    expect(configOf('step')['semantics']).toBe(fakeStepSemantics.AtMostOncePerRetry);
  });

  it('leaves the semantics alone for atMostOnce: false', async () => {
    await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('ok'), { atMostOnce: false }));

    expect(configOf('step')).toStrictEqual({});
  });

  it('leaves retry and semantics unset when neither is asked for', async () => {
    await run((_input, ctx) => ctx.step('charge', () => Promise.resolve('ok')));

    expect(configOf('step')).toEqual({});
  });

  it.each(['invalid', Object.assign(['invalid'], { retry: false }), null])(
    'ignores malformed step options: %p',
    async (options) => {
      await run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.step.bind(ctx), undefined, [
          'charge',
          () => Promise.resolve('ok'),
          options,
        ]);
        return Promise.resolve(result);
      });
      expect(configOf('step')).toStrictEqual({});
    },
  );

  it('refuses a step with nothing to run', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.step.bind(ctx), undefined, ['charge']);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/ctx\.step\(\) requires a function to run/u);
  });
}

describe('ctx.step', () => {
  runsSteps();
  convertsRetryOptions();
  readsStepOptions();
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
      (_input, ctx) => {
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
