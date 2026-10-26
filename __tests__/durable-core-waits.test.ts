import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  configOf,
  firstCall,
  invoke,
  mockDurableRuntime,
  resetEngineDouble,
  run,
} from './support/durable-core-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

beforeEach(resetEngineDouble);

function acceptsDurations(): void {
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
    ).rejects.toThrow(/ctx\.wait\(\) takes a name and a duration, or a duration alone/u);
  });

  it('refuses a duration object that holds no duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', {}))).rejects.toThrow(
      /wait duration needs one of days, hours, minutes, seconds/u,
    );
  });
}

function refusesBadDurations(): void {
  it('names what is wrong with an unparseable duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', 'soon'))).rejects.toThrow(
      /wait must be a duration in whole seconds, such as '30s'.*got 'soon'/u,
    );
  });

  it('refuses a negative duration', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', -1))).rejects.toThrow(/non-negative whole number of seconds/u);
  });

  // The duration the engine takes carries whole seconds, so a sub-second value
  // could only be rounded. It was: 'ms' parsed, and '400ms' became a wait of
  // nothing while '500ms' became a second. A wait that does not happen is worse
  // than one that is refused, since the code reads as if it paused.
  it.each(['400ms', '500ms', '2000ms', `${'9'.repeat(400)}s`])(
    'rejects an unrepresentable duration: %p',
    async (given) => {
      await expect(run((_input, ctx) => ctx.wait('pause', given))).rejects.toThrow(
        /must be a duration in whole seconds/u,
      );
    },
  );

  it('refuses a fraction of a second', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', 0.4))).rejects.toThrow(/non-negative whole number of seconds/u);
  });

  // The object form went to the engine unread, so a plausible-looking key was a
  // duration of nothing.
  it('refuses a duration object it does not understand', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.wait.bind(ctx), undefined, ['pause', { milliseconds: 500 }]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/takes days, hours, minutes, seconds \(got milliseconds\)/u);
  });

  it('refuses a duration object with a fractional part', async () => {
    await expect(run((_input, ctx) => ctx.wait('pause', { seconds: 1.5 }))).rejects.toThrow(
      /seconds must be a non-negative whole number/u,
    );
  });
}

describe('ctx.wait', () => {
  acceptsDurations();
  refusesBadDurations();
});

describe('ctx.wait bounds', () => {
  // A zero wait passes every shape check and is refused by the platform, which
  // means the execution fails partway through -- after earlier steps have run
  // and been charged -- rather than at the call that was wrong.
  it.each([0, '0s', { seconds: 0 }, { minutes: 0, seconds: 0 }])('refuses a wait of nothing (%p)', async (duration) => {
    await expect(run((_input, ctx) => ctx.wait('cool-off', duration))).rejects.toThrow(
      /wait must be at least 1 second/u,
    );
  });

  // The other end is the execution ceiling: a wait longer than an execution may
  // live cannot elapse.
  it('refuses a wait longer than an execution may run', async () => {
    await expect(run((_input, ctx) => ctx.wait('cool-off', { days: 367 }))).rejects.toThrow(
      /wait must be at most 31622400 seconds/u,
    );
  });

  it('takes the shortest wait the platform accepts', async () => {
    await run((_input, ctx) => ctx.wait('cool-off', '1s'));

    expect(firstCall('wait').duration).toEqual({ seconds: 1 });
  });
});

function pollsUntilTheConditionHolds(): void {
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
}

function refusesPollingItCannotRun(): void {
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
    ).rejects.toThrow(/has no `timeout`: bound the wait with `maxAttempts`/u);
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
    ).rejects.toThrow(/requires an `until` predicate/u);
  });
}

function takesTheInitialState(): void {
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
    ).rejects.toThrow(/requires an `initialState` in its options/u);
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
}

describe('ctx.waitUntil', () => {
  pollsUntilTheConditionHolds();
  refusesPollingItCannotRun();
  takesTheInitialState();
});
