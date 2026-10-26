import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  callsOf,
  configOf,
  fakeBatch,
  firstCall,
  mockDurableRuntime,
  resetEngineDouble,
  run,
  shipped,
  stageBatch,
} from './support/durable-core-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

beforeEach(resetEngineDouble);

function flattensTheBatch(): void {
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
}

function readsMapArguments(): void {
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
    ).rejects.toThrow(/requires an array of items/u);
  });
}

function reportsFailedItems(): void {
  it('reports a failed item instead of rejecting', async () => {
    const failure = new Error('cannot ship b');
    const ship = jest.fn<(item: string) => Promise<string>>().mockResolvedValueOnce('A').mockRejectedValueOnce(failure);
    const result = await run((_input, ctx) => ctx.map('ship', ['a', 'b'], ship));

    expect(ship.mock.calls.map(([item]) => item)).toEqual(['a', 'b']);

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
    const result = await run((_input, ctx) => ctx.map('ship', [1], (item) => Promise.resolve(item)));
    result.throwIfFailed();

    expect(callsOf('throwIfError')).toHaveLength(1);
  });
}

function replaysAnEarlyCompletion(): void {
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
}

function keepsFailuresReadable(): void {
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

    stageBatch(fakeBatch([{ index: 0, status: 'FAILED', error: new ChildContextError('cannot ship a') }]));
    const result = await run((_input, ctx) => ctx.map('ship', ['a'], (item) => Promise.resolve(item)));

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
    const result = await run((_input, ctx) => ctx.map('ship', ['a'], (item) => Promise.resolve(item)));

    result.throwIfFailed();
    expect(callsOf('throwIfError')).toHaveLength(1);
  });
}

describe('ctx.map', () => {
  flattensTheBatch();
  readsMapArguments();
  reportsFailedItems();
  replaysAnEarlyCompletion();
  keepsFailuresReadable();
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
    expect(call.branches).toEqual([expect.objectContaining({ name: 'charge', func: expect.any(Function) })]);
    expect(call.config).toEqual({ maxConcurrency: 2 });
  });

  it('takes an unnamed parallel', async () => {
    await run((_input, ctx) => ctx.parallel([() => Promise.resolve('ok')]));

    expect(firstCall('parallel').name).toBeUndefined();
  });

  it('refuses a branch that is neither a function nor { name, run }', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.parallel.bind(ctx), undefined, ['fanout', [{ name: 'charge' }]]);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/a parallel branch is a function, or \{ name, run \}/u);
  });

  it('refuses branches that are not an array', async () => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.parallel.bind(ctx), undefined, ['fanout', 'left']);
        return Promise.resolve(result);
      }),
    ).rejects.toThrow(/requires an array of branches/u);
  });
});
