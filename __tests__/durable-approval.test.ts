/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { durable } from '../src/durable.ts';
import type { DurableContext, DurableHandler, DurableLog } from '../src/durable-types.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

// Like durable.test.ts, a double stands in for the optional runtime. Its
// waitForCallback runs the submitter once with a fixed callback id and then
// resolves or rejects the way the runtime would when Volcano completes, or
// times out, the callback. Child, map, and parallel contexts carry no
// execution metadata of their own, so a ref that reaches them was threaded.

interface CallbackCall {
  name: unknown;
  config: Record<string, unknown>;
}

type Submitter = (callbackId: string) => Promise<void>;
type Run = (context: FakeContext) => Promise<unknown>;

interface FakeContext {
  logger: DurableLog;
  configureLogger(): void;
  step(name: unknown, fn: (scope: { logger: DurableLog; attempt: number }) => unknown): unknown;
  wait(): Promise<void>;
  runInChildContext(name: unknown, fn: Run): Promise<unknown>;
  waitForCondition(): Promise<unknown>;
  map(
    name: unknown,
    items: unknown[],
    fn: (context: FakeContext, item: unknown, index: number) => Promise<unknown>,
  ): Promise<unknown>;
  parallel(name: unknown, branches: (Run | { func: Run })[]): Promise<unknown>;
  waitForCallback?: (
    name: unknown,
    submitter: Submitter,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
  executionContext?: { durableExecutionArn?: unknown };
}

const EXECUTION_ARN =
  'arn:aws:lambda:us-east-1:123456789012:function:order-pipeline:$LATEST/durable-execution/exec-1/abc';
const API_URL = 'https://api.test.com';

const callbackCalls: CallbackCall[] = [];
let callbackOutcome: () => Promise<unknown>;
let mockContextTransform: ((context: FakeContext) => FakeContext) | undefined;

const decided = (overrides: Record<string, unknown> = {}): string =>
  JSON.stringify({
    status: 'approved',
    approved: true,
    comment: 'Address checked',
    decided_by: { id: 'user-1', email: 'owner@example.com' },
    decided_at: '2026-10-06T12:05:00Z',
    ...overrides,
  });

const batch = (results: unknown[]) => ({
  all: results.map((result, index) => ({ index, status: 'SUCCEEDED', result })),
  getResults: () => results,
  getErrors: () => [],
  successCount: results.length,
  failureCount: 0,
  completionReason: 'ALL_COMPLETED',
  throwIfError: jest.fn(),
});

function mockContext(executionContext?: FakeContext['executionContext']): FakeContext {
  const logger: DurableLog = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  return {
    logger,
    configureLogger: jest.fn(),
    step: (_name, fn) => fn({ logger, attempt: 1 }),
    wait: () => Promise.resolve(),
    runInChildContext: (_name, fn) => fn(mockContext()),
    waitForCondition: () => Promise.resolve(),
    map: async (_name, items, fn) =>
      batch(await Promise.all(items.map((item, index) => fn(mockContext(), item, index)))),
    parallel: async (_name, branches) =>
      batch(
        await Promise.all(
          branches.map((branch) =>
            typeof branch === 'function' ? branch(mockContext()) : branch.func(mockContext()),
          ),
        ),
      ),
    async waitForCallback(name, submitter, config) {
      callbackCalls.push({ name, config });
      await submitter('cb-1');
      return callbackOutcome();
    },
    ...(executionContext === undefined ? {} : { executionContext }),
  };
}

jest.mock(
  '@aws/durable-execution-sdk-js',
  () => ({
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) =>
      (event: { input: unknown; DurableExecutionArn: unknown }) => {
        const context = mockContext({ durableExecutionArn: event.DurableExecutionArn });
        return handler(event.input, mockContextTransform?.(context) ?? context);
      },
    StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' },
    createRetryStrategy: jest.fn(),
    createWaitStrategy: jest.fn(),
  }),
  { virtual: true },
);

function run<Result>(
  handler: DurableHandler<unknown, Result>,
  event?: Record<string, unknown>,
): Promise<unknown> {
  return durable(handler)({ input: {}, ...(event ?? { DurableExecutionArn: EXECUTION_ARN }) }, {});
}

const askToShip = (ctx: DurableContext) =>
  ctx.waitForApproval('ship-order', { title: 'Ship order 42?' });
const shipping: DurableHandler = (_input, ctx) => askToShip(ctx);
const registered = () => run(shipping);

const fetchMock = () => jest.mocked(globalThis.fetch);

// Settles with the rejection, so a test can move fake time before awaiting it.
const failureOf = (pending: Promise<unknown>): Promise<unknown> =>
  pending.then(
    () => {
      throw new Error('Expected the approval request to fail');
    },
    (error: unknown) => error,
  );

const registration = { id: 'apr-1', status: 'pending', expires_at: null };
const respond = (status: number, body?: unknown) => Response.json(body ?? registration, { status });

const decide = async (outcome: () => Promise<unknown>): Promise<unknown> => {
  callbackOutcome = outcome;
  let decision: unknown;
  await run(async (_input, ctx) => {
    decision = await askToShip(ctx);
  });
  return decision;
};

function requestAt(index: number): { url: unknown; init: RequestInit | undefined } {
  const call = fetchMock().mock.calls[index];
  if (call === undefined) {
    throw new Error(`Missing approval request ${String(index)}`);
  }
  return { url: call[0], init: call[1] };
}

function bodyAt(index: number): unknown {
  const { body } = requestAt(index).init ?? {};
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON body');
  }
  const value: unknown = JSON.parse(body);
  return value;
}

function onlyCallbackCall(): CallbackCall {
  expect(callbackCalls).toHaveLength(1);
  const [call] = callbackCalls;
  if (call === undefined) {
    throw new Error('Missing waitForCallback call');
  }
  return call;
}

beforeEach(() => {
  callbackCalls.length = 0;
  callbackOutcome = () => Promise.resolve(decided());
  mockContextTransform = undefined;
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockResolvedValue(respond(201));
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ctx.waitForApproval()', () => {
  it('registers the approval with Volcano and resolves with the decision', async () => {
    let decision: unknown;
    await run(async (_input, ctx) => {
      decision = await ctx.waitForApproval('ship-order', {
        title: 'Ship order 42?',
        description: 'Over the auto-ship limit',
        details: { order_id: 42, total: 1250 },
      });
    });

    expect(decision).toEqual({
      approved: true,
      status: 'approved',
      comment: 'Address checked',
      decidedBy: { id: 'user-1', email: 'owner@example.com' },
      decidedAt: '2026-10-06T12:05:00Z',
    });
    expect(onlyCallbackCall().name).toBe('ship-order');
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const { url, init } = requestAt(0);
    expect(url).toBe('https://api.test.com/durable-approvals');
    expect(init?.method).toBe('POST');
    // The route takes no credential: the callback id is what authorizes it.
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(bodyAt(0)).toEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'ship-order',
      title: 'Ship order 42?',
      description: 'Over the auto-ship limit',
      details: { order_id: 42, total: 1250 },
    });
  });

  it('leaves out what the caller did not set', async () => {
    await run(shipping);

    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'ship-order',
      title: 'Ship order 42?',
    });
    const { config } = onlyCallbackCall();
    expect(Object.keys(config)).toEqual(['retryStrategy']);
  });

  it('keeps a null details value and an empty description', async () => {
    await run((_input, ctx) =>
      ctx.waitForApproval('ship-order', { title: 'Ship?', description: '', details: null }),
    );

    expect(bodyAt(0)).toMatchObject({ description: '', details: null });
  });

  it('passes the timeout to the callback and leaves retries to the registration', async () => {
    await run((_input, ctx) =>
      ctx.waitForApproval('ship-order', { title: 'Ship?', timeout: { hours: 48 } }),
    );

    const { config } = onlyCallbackCall();
    expect(config['timeout']).toEqual({ hours: 48 });
    const retryStrategy = config['retryStrategy'];
    if (typeof retryStrategy !== 'function') {
      throw new TypeError('Expected a retry strategy');
    }
    expect(Reflect.apply(retryStrategy, undefined, [new Error('refused'), 1])).toEqual({
      shouldRetry: false,
    });
  });

  it('refuses a timeout outside the execution lifetime', async () => {
    await expect(
      run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', timeout: '367d' })),
    ).rejects.toThrow('timeout must be at most 31622400 seconds (366 days)');
    expect(callbackCalls).toHaveLength(0);
  });

  it('accepts the longest name, title, and description the platform stores', async () => {
    await run((_input, ctx) =>
      ctx.waitForApproval('n'.repeat(255), {
        title: 't'.repeat(200),
        description: 'd'.repeat(4000),
      }),
    );

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['an empty name', '', { title: 'Ship?' }, 'ctx.waitForApproval() requires a non-empty name'],
    ['a blank name', '  ', { title: 'Ship?' }, 'ctx.waitForApproval() requires a non-empty name'],
    [
      'a non-string name',
      42,
      { title: 'Ship?' },
      'ctx.waitForApproval() requires a non-empty name',
    ],
    [
      'a long name',
      'n'.repeat(256),
      { title: 'Ship?' },
      'ctx.waitForApproval() name must be at most 255 characters',
    ],
    ['no options', 'ship', undefined, 'ctx.waitForApproval() requires options with a title'],
    ['null options', 'ship', null, 'ctx.waitForApproval() requires options with a title'],
    ['no title', 'ship', {}, 'ctx.waitForApproval() requires a non-empty title'],
    [
      'a long title',
      'ship',
      { title: 't'.repeat(201) },
      'ctx.waitForApproval() title must be at most 200 characters',
    ],
    [
      'a non-string description',
      'ship',
      { title: 'Ship?', description: 7 },
      'ctx.waitForApproval() description must be a string',
    ],
    [
      'a long description',
      'ship',
      { title: 'Ship?', description: 'd'.repeat(4001) },
      'ctx.waitForApproval() description must be at most 4000 characters',
    ],
  ])('refuses %s before registering anything', async (_case, name, options, message) => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.waitForApproval.bind(ctx), undefined, [
          name,
          options,
        ]);
        return result instanceof Promise ? result : Promise.reject(new Error('Expected a promise'));
      }),
    ).rejects.toThrow(new TypeError(message));
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it.each([
    ['unset', undefined],
    ['blank', '   '],
  ])('explains that the platform URL is missing when it is %s', async (_case, value) => {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
    } else {
      process.env['VOLCANO_PLATFORM_API_URL'] = value;
    }

    await expect(run(shipping)).rejects.toThrow(
      'ctx.waitForApproval() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to request approvals.',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('trims the platform URL and its trailing slash', async () => {
    process.env['VOLCANO_PLATFORM_API_URL'] = ' http://localhost:8000/ ';

    await run(shipping);

    expect(requestAt(0).url).toBe('http://localhost:8000/durable-approvals');
  });

  it.each([
    ['absent', {}],
    ['empty', { DurableExecutionArn: '' }],
    ['not a string', { DurableExecutionArn: 42 }],
  ])('refuses when the execution ref is %s', async (_case, event) => {
    await expect(run(shipping, event)).rejects.toThrow(
      'ctx.waitForApproval() cannot tell which execution is running: the durable runtime did not report it',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('refuses when the runtime gives no execution metadata at all', async () => {
    mockContextTransform = (context) => {
      Reflect.deleteProperty(context, 'executionContext');
      return context;
    };

    await expect(run(shipping)).rejects.toThrow('cannot tell which execution is running');
  });

  it('refuses a runtime without callbacks', async () => {
    mockContextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCallback');
      return context;
    };

    await expect(run(shipping)).rejects.toThrow(
      new TypeError(
        'The durable runtime does not support approvals; redeploy the function so Volcano installs a current one',
      ),
    );
  });

  it('gives every nested context the root execution ref', async () => {
    await run(async (_input, ctx) => {
      await ctx.child('review', (child) => askToShip(child));
      await ctx.map('orders', [1], (_item, item) => askToShip(item));
      await ctx.parallel([
        (branch) => askToShip(branch),
        { name: 'named', run: (branch) => askToShip(branch) },
      ]);
      await ctx.child((outer) => outer.child((inner) => askToShip(inner)));
    });

    expect(fetchMock()).toHaveBeenCalledTimes(5);
    for (let index = 0; index < 5; index += 1) {
      expect(bodyAt(index)).toMatchObject({ execution_ref: EXECUTION_ARN });
    }
  });

  it('keeps each invocation on its own execution', async () => {
    const handler = durable((_input, ctx) => askToShip(ctx));

    await handler({ input: {}, DurableExecutionArn: 'arn:exec-a' }, {});
    await handler({ input: {}, DurableExecutionArn: 'arn:exec-b' }, {});

    expect(bodyAt(0)).toMatchObject({ execution_ref: 'arn:exec-a' });
    expect(bodyAt(1)).toMatchObject({ execution_ref: 'arn:exec-b' });
  });
});

describe('the decision', () => {
  it('resolves a denial rather than throwing', async () => {
    await expect(
      decide(() =>
        Promise.resolve(decided({ status: 'denied', approved: false, comment: 'Wrong address' })),
      ),
    ).resolves.toEqual({
      approved: false,
      status: 'denied',
      comment: 'Wrong address',
      decidedBy: { id: 'user-1', email: 'owner@example.com' },
      decidedAt: '2026-10-06T12:05:00Z',
    });
  });

  it('derives approved from the status, not the separate flag', async () => {
    await expect(
      decide(() => Promise.resolve(decided({ status: 'denied', approved: true }))),
    ).resolves.toMatchObject({ approved: false, status: 'denied' });
  });

  it('resolves an expired decision when the callback times out', async () => {
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(decide(() => Promise.reject(timeout))).resolves.toEqual({
      approved: false,
      status: 'expired',
      comment: '',
      decidedBy: null,
      decidedAt: null,
    });
  });

  it.each([
    ['another callback failure', Object.assign(new Error('boom'), { errorType: 'CallbackError' })],
    ['a plain error', new Error('boom')],
    ['a thrown string', 'boom'],
  ])('rethrows %s', async (_case, failure) => {
    await expect(decide(() => rejectWithForeignValue(failure))).rejects.toBe(failure);
  });

  it('fills in what the platform left out', async () => {
    await expect(
      decide(() =>
        Promise.resolve(JSON.stringify({ status: 'approved', decided_by: null, comment: 3 })),
      ),
    ).resolves.toEqual({
      approved: true,
      status: 'approved',
      comment: '',
      decidedBy: null,
      decidedAt: null,
    });
  });

  it.each([
    ['without an email', { id: 'user-1' }],
    ['without an id', { email: 'owner@example.com' }],
    ['as text', 'owner@example.com'],
  ])('drops a decider %s', async (_case, decidedBy) => {
    await expect(
      decide(() => Promise.resolve(decided({ decided_by: decidedBy }))),
    ).resolves.toMatchObject({ decidedBy: null });
  });

  it('accepts a decision the runtime already parsed', async () => {
    await expect(
      decide(() => Promise.resolve({ status: 'denied', comment: 'No' })),
    ).resolves.toMatchObject({ approved: false, status: 'denied', comment: 'No' });
  });

  it('keeps the parse error behind a decision that is not JSON', async () => {
    const failure = await decide(() => Promise.resolve('approved')).then(
      () => new Error('Expected the decision to be refused'),
      (error: unknown) => error,
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure instanceof Error ? failure.cause : undefined).toBeInstanceOf(SyntaxError);
  });

  it.each([
    ['text that is not JSON', 'approved'],
    ['a JSON scalar', '42'],
    ['JSON null', 'null'],
    ['an unknown status', decided({ status: 'expired' })],
    ['no status', JSON.stringify({ approved: true })],
    ['nothing', undefined],
  ])('refuses %s', async (_case, result) => {
    const failure = decide(() => Promise.resolve(result));
    await expect(failure).rejects.toBeInstanceOf(TypeError);
    await expect(failure).rejects.toThrow(
      'Volcano resumed the approval with a decision this SDK cannot read',
    );
  });
});

describe('approval registration', () => {
  it.each([200, 201])('treats %d as registered', async (status) => {
    fetchMock().mockResolvedValueOnce(respond(status));

    await registered();

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('bounds each attempt with a request timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');

    await registered();

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(requestAt(0).init?.signal).toBe(timeout.mock.results[0]?.value);
  });

  it('retries until the approval is ready, backing off from half a second', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const notReady = { error: 'execution is not ready', code: 'approval_not_ready' };
    fetchMock()
      .mockResolvedValueOnce(respond(409, notReady))
      .mockResolvedValueOnce(respond(409, notReady))
      .mockResolvedValueOnce(respond(201));

    const pending = registered();
    await jest.advanceTimersByTimeAsync(499);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(3);
    expect(bodyAt(2)).toEqual(bodyAt(0));
  });

  it.each([
    ['throttled', () => Promise.resolve(respond(429, { error: 'slow down' }))],
    ['failing', () => Promise.resolve(respond(500, { error: 'internal error' }))],
    ['unavailable', () => Promise.resolve(respond(503, { error: 'unavailable' }))],
    ['unreachable', () => Promise.reject(new TypeError('fetch failed'))],
  ])('retries while Volcano is %s', async (_case, failure) => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockImplementationOnce(failure).mockResolvedValueOnce(respond(201));

    const pending = registered();
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  // 0.5, 1, 2, and 4 seconds, then 5 seconds four times, and the 2.5 seconds
  // left of the budget: ten attempts across thirty seconds.
  it('gives up after about thirty seconds of retrying', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockImplementation(() =>
      Promise.resolve(respond(503, { error: 'unavailable', code: 'unavailable' })),
    );

    const failure = failureOf(registered());
    await jest.advanceTimersByTimeAsync(27_499);
    expect(fetchMock()).toHaveBeenCalledTimes(8);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock()).toHaveBeenCalledTimes(9);
    await jest.advanceTimersByTimeAsync(2499);
    expect(fetchMock()).toHaveBeenCalledTimes(9);
    await jest.advanceTimersByTimeAsync(1);
    expect(await failure).toMatchObject({
      status: 503,
      code: 'unavailable',
      message: 'Volcano refused the approval request (503): unavailable',
    });
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetchMock()).toHaveBeenCalledTimes(10);
  });

  it('succeeds on the last attempt the budget allows', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    for (let attempt = 0; attempt < 9; attempt += 1) {
      fetchMock().mockResolvedValueOnce(respond(503, { error: 'unavailable' }));
    }
    fetchMock().mockResolvedValueOnce(respond(201));

    const pending = registered();
    await jest.advanceTimersByTimeAsync(30_000);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(10);
  });

  it('reports an unreachable platform with its cause once retries run out', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const cause = new TypeError('fetch failed');
    fetchMock().mockImplementation(() => Promise.reject(cause));

    const failure = failureOf(registered());
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to request the approval',
      cause,
    });
  });

  it.each([
    [400, { error: 'title is required' }, undefined],
    [404, { error: 'callback not found' }, undefined],
    [409, { error: 'execution has ended', code: 'execution_ended' }, 'execution_ended'],
    [409, { error: 'approval was closed', code: 'approval_closed' }, 'approval_closed'],
    // Only a conflict means "not yet"; the same code on another status is final.
    [400, { error: 'not ready', code: 'approval_not_ready' }, 'approval_not_ready'],
    [413, { error: 'request too large' }, undefined],
  ])('fails at once on a %d refusal', async (status, body, code) => {
    fetchMock().mockResolvedValueOnce(respond(status, body));

    const failure = await failureOf(registered());

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      status,
      message: `Volcano refused the approval request (${String(status)}): ${body.error}`,
    });
    expect(failure instanceof Error ? Reflect.get(failure, 'code') : 'not an error').toBe(code);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('describes a refusal with no readable body', async () => {
    fetchMock().mockResolvedValueOnce(new Response('<html>', { status: 400 }));

    await expect(registered()).rejects.toThrow(
      'Volcano refused the approval request (400): Request failed',
    );
  });
});
