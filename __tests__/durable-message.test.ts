/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { durable } from '../src/durable.ts';
import type { DurableContext, DurableHandler, DurableLog } from '../src/durable-types.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

// As in durable-approval.test.ts, a double stands in for the optional runtime.
// Its waitForCallback runs the submitter once and then resolves the way the
// runtime would when Volcano completes the callback: with the session token
// for a messages session, and with the message for a wait.

interface CallbackCall {
  name: unknown;
  config: Record<string, unknown>;
}

interface StepCall {
  name: unknown;
  config: unknown;
}

type Submitter = (callbackId: string) => Promise<void>;
type Run = (context: FakeContext) => Promise<unknown>;

interface FakeContext {
  logger: DurableLog;
  configureLogger(): void;
  step(
    name: unknown,
    fn: (scope: { logger: DurableLog; attempt: number }) => unknown,
    config?: unknown,
  ): unknown;
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
const SESSION = 'volcano:messages-session';
const SESSION_TOKEN = 'vdms_session';
// SHA-256 of SESSION_TOKEN, hex encoded.
const SESSION_HASH = 'a2c7a36f61b2054a8a5dad91d7c330cf16b57dd4b6cd79de1c4d285ed825353f';

const callbackCalls: CallbackCall[] = [];
const stepCalls: StepCall[] = [];
let callbackOutcome: (name: unknown) => Promise<unknown>;
let sessionTokens: string[];
let mockContextTransform: ((context: FakeContext) => FakeContext) | undefined;

const sent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'msg-1',
  name: 'address-confirmed',
  data: { address_id: 'addr_19' },
  sender: { type: 'user', user_id: 'user-1' },
  sent_at: '2026-10-12T09:30:00Z',
  ...overrides,
});

const published = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'msg-2',
  execution_id: 'exec-1',
  direction: 'out',
  seq: 4,
  name: 'progress',
  data: { percent: 50 },
  sender: { type: 'execution', user_id: null },
  status: 'published',
  delivered_at: null,
  sent_at: '2026-10-12T09:31:00Z',
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
    step(name, fn, config) {
      stepCalls.push({ name, config });
      return fn({ logger, attempt: 1 });
    },
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
      await submitter(`cb-${String(callbackCalls.length)}`);
      return callbackOutcome(name);
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

const fetchMock = () => jest.mocked(globalThis.fetch);

const failureOf = (pending: Promise<unknown>): Promise<unknown> =>
  pending.then(
    () => {
      throw new Error('Expected the call to fail');
    },
    (error: unknown) => error,
  );

const ANSWERS: Record<string, unknown> = {
  [`${API_URL}/durable-messages/publish`]: published(),
  [`${API_URL}/durable-messages/sessions`]: { id: 'ses-1' },
  [`${API_URL}/durable-messages/waits`]: { id: 'wait-1', status: 'waiting', expires_at: null },
};

// A final refusal for any other URL, so a wrong one fails at once rather than
// retrying on real timers.
function answer(url: unknown): Response {
  const body = ANSWERS[String(url)];
  return body === undefined
    ? Response.json({ error: 'no such route' }, { status: 400 })
    : Response.json(body, { status: 201 });
}

function requestAt(index: number): { url: unknown; init: RequestInit | undefined } {
  const call = fetchMock().mock.calls[index];
  if (call === undefined) {
    throw new Error(`Missing request ${String(index)}`);
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

function publishRequests(): { headers: unknown; body: unknown }[] {
  return fetchMock()
    .mock.calls.map((_call, index) => index)
    .filter((index) => requestAt(index).url === `${API_URL}/durable-messages/publish`)
    .map((index) => ({ headers: requestAt(index).init?.headers, body: bodyAt(index) }));
}

function circular(): Record<string, unknown> {
  const value: Record<string, unknown> = { step: 1 };
  value['self'] = value;
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

function noRetry(config: unknown): void {
  const retryStrategy: unknown =
    typeof config === 'object' && config !== null
      ? Reflect.get(config, 'retryStrategy')
      : undefined;
  if (typeof retryStrategy !== 'function') {
    throw new TypeError('Expected a retry strategy');
  }
  expect(Reflect.apply(retryStrategy, undefined, [new Error('refused'), 1])).toEqual({
    shouldRetry: false,
  });
}

const waitForAddress = (ctx: DurableContext) => ctx.waitForMessage('address-confirmed');
const waiting: DurableHandler = (_input, ctx) => waitForAddress(ctx);

const receive = async (outcome: () => Promise<unknown>): Promise<unknown> => {
  callbackOutcome = outcome;
  let message: unknown;
  await run(async (_input, ctx) => {
    message = await waitForAddress(ctx);
  });
  return message;
};

// Calls the way JavaScript can, past the TypeScript signature.
const callWith =
  (call: (ctx: DurableContext) => unknown): DurableHandler =>
  (_input, ctx) => {
    const result = call(ctx);
    return result instanceof Promise ? result : Promise.reject(new Error('Expected a promise'));
  };

beforeEach(() => {
  callbackCalls.length = 0;
  stepCalls.length = 0;
  sessionTokens = [SESSION_TOKEN];
  callbackOutcome = (name) => {
    if (name !== SESSION) {
      return Promise.resolve(JSON.stringify(sent()));
    }
    const token = sessionTokens.shift() ?? 'vdms_other';
    return Promise.resolve(JSON.stringify({ token }));
  };
  mockContextTransform = undefined;
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockImplementation((url) => Promise.resolve(answer(url)));
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ctx.waitForMessage()', () => {
  it('registers the wait with Volcano and resolves with the message', async () => {
    const message = await receive(() => Promise.resolve(JSON.stringify(sent())));

    expect(message).toEqual({
      id: 'msg-1',
      name: 'address-confirmed',
      data: { address_id: 'addr_19' },
      sender: { type: 'user', userId: 'user-1' },
      sentAt: '2026-10-12T09:30:00Z',
    });
    const { name, config } = onlyCallbackCall();
    expect(name).toBe('address-confirmed');
    expect(Object.keys(config)).toEqual(['retryStrategy']);
    noRetry(config);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const { url, init } = requestAt(0);
    expect(url).toBe('https://api.test.com/durable-messages/waits');
    expect(init?.method).toBe('POST');
    // The callback id is what authorizes the route.
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'address-confirmed',
    });
  });

  it('passes the timeout to the callback', async () => {
    await run((_input, ctx) => ctx.waitForMessage('address-confirmed', { timeout: { hours: 2 } }));

    expect(onlyCallbackCall().config['timeout']).toEqual({ hours: 2 });
  });

  it('resolves null when the wait times out', async () => {
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(receive(() => Promise.reject(timeout))).resolves.toBeNull();
  });

  it('treats a closed wait as registered and resolves the callback outcome', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'wait is no longer open', code: 'callback_closed' }, { status: 409 }),
    );
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(receive(() => Promise.reject(timeout))).resolves.toBeNull();
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('retries until Volcano sees the callback waiting', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'not ready', code: 'callback_not_ready' }, { status: 409 }),
    );

    const pending = receive(() => Promise.resolve(sent()));
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(bodyAt(1)).toEqual(bodyAt(0));
  });

  it('names the wait in a final refusal', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json(
        { error: 'too many open waits', code: 'too_many_message_waits' },
        { status: 409 },
      ),
    );

    await expect(failureOf(receive(() => Promise.resolve(sent())))).resolves.toMatchObject({
      status: 409,
      message: 'Volcano refused the message wait (409 too_many_message_waits): too many open waits',
    });
  });

  it('names the wait when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(receive(() => Promise.resolve(sent())));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to register the message wait: fetch failed',
    });
  });

  it.each([
    ['another callback failure', Object.assign(new Error('boom'), { errorType: 'CallbackError' })],
    ['a plain error', new Error('boom')],
    ['a thrown string', 'boom'],
  ])('rethrows %s', async (_case, failure) => {
    await expect(receive(() => rejectWithForeignValue(failure))).rejects.toBe(failure);
  });

  it('accepts a message the runtime already parsed', async () => {
    await expect(receive(() => Promise.resolve(sent({ data: [1, 2] })))).resolves.toMatchObject({
      data: [1, 2],
    });
  });

  it.each([
    ['left out', {}],
    ['sent as null', { data: null }],
  ])('resolves null data when it is %s', async (_case, overrides) => {
    const message = sent(overrides);
    if (!('data' in overrides)) {
      Reflect.deleteProperty(message, 'data');
    }

    await expect(receive(() => Promise.resolve(message))).resolves.toMatchObject({ data: null });
  });

  it.each([false, 0, ''])('keeps falsy data %p', async (data) => {
    await expect(receive(() => Promise.resolve(sent({ data })))).resolves.toMatchObject({ data });
  });

  it.each([
    ['null', { type: 'anon', user_id: null }, { type: 'anon', userId: null }],
    ['absent', { type: 'service_key' }, { type: 'service_key', userId: null }],
    ['not text', { type: 'user', user_id: 7 }, { type: 'user', userId: null }],
  ])('reports no sender user when the id is %s', async (_case, sender, expected) => {
    await expect(receive(() => Promise.resolve(sent({ sender })))).resolves.toMatchObject({
      sender: expected,
    });
  });

  it('keeps the parse error behind a message that is not JSON', async () => {
    const failure = await failureOf(receive(() => Promise.resolve('address-confirmed')));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure instanceof Error ? failure.cause : undefined).toBeInstanceOf(SyntaxError);
  });

  it.each([
    ['text that is not JSON', 'confirmed'],
    ['a JSON scalar', '42'],
    ['JSON null', 'null'],
    ['nothing', undefined],
    ['no sender', JSON.stringify(sent({ sender: undefined }))],
    ['a sender that is text', JSON.stringify(sent({ sender: 'user' }))],
    ['a sender without a type', JSON.stringify(sent({ sender: { user_id: 'user-1' } }))],
    ['no id', JSON.stringify(sent({ id: undefined }))],
    ['a numeric id', JSON.stringify(sent({ id: 1 }))],
    ['no name', JSON.stringify(sent({ name: undefined }))],
    ['no send time', JSON.stringify(sent({ sent_at: undefined }))],
  ])('refuses %s', async (_case, result) => {
    const failure = receive(() => Promise.resolve(result));
    await expect(failure).rejects.toBeInstanceOf(TypeError);
    await expect(failure).rejects.toThrow(
      'Volcano resumed the message wait with a message this SDK cannot read',
    );
  });

  it.each([
    ['an empty name', [''], 'ctx.waitForMessage() requires a non-empty name'],
    ['a blank name', [' \t'], 'ctx.waitForMessage() requires a non-empty name'],
    ['a non-string name', [42], 'ctx.waitForMessage() requires a non-empty name'],
    ['a long name', ['n'.repeat(238)], 'ctx.waitForMessage() name must be at most 237 characters'],
    ['a name outside ASCII', ['dirección'], 'ctx.waitForMessage() name must be printable ASCII'],
    ['a name with a tab', ['a\tb'], 'ctx.waitForMessage() name must be printable ASCII'],
    ['a name with DEL', ['a\u007F'], 'ctx.waitForMessage() name must be printable ASCII'],
    ['null options', ['ok', null], 'ctx.waitForMessage() options must be an object'],
    ['text options', ['ok', '1h'], 'ctx.waitForMessage() options must be an object'],
    [
      'a timeout outside the execution lifetime',
      ['ok', { timeout: '367d' }],
      'timeout must be at most 31622400 seconds (366 days)',
    ],
  ])('refuses %s before registering anything', async (_case, args, message) => {
    await expect(
      run(callWith((ctx) => Reflect.apply(ctx.waitForMessage.bind(ctx), undefined, args))),
    ).rejects.toThrow(message);
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('accepts the longest name the platform stores', async () => {
    const name = `${' ~'.repeat(118)}n`;

    await run((_input, ctx) => ctx.waitForMessage(name));

    expect(bodyAt(0)).toMatchObject({ name });
  });

  it('explains that the platform URL is missing', async () => {
    process.env['VOLCANO_PLATFORM_API_URL'] = ' ';

    await expect(run(waiting)).rejects.toThrow(
      'ctx.waitForMessage() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to wait for messages.',
    );
  });

  it('refuses when the runtime did not report the execution', async () => {
    await expect(run(waiting, {})).rejects.toThrow(
      'ctx.waitForMessage() cannot tell which execution is running: the durable runtime did not report it',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('refuses a runtime without callbacks', async () => {
    mockContextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCallback');
      return context;
    };

    await expect(run(waiting)).rejects.toThrow(
      new TypeError(
        'The durable runtime does not support messages; redeploy the function so Volcano installs a current one',
      ),
    );
  });

  it('gives every nested context the root execution ref', async () => {
    await run(async (_input, ctx) => {
      await ctx.child('review', (child) => waitForAddress(child));
      await ctx.map('orders', [1], (_item, item) => waitForAddress(item));
      await ctx.parallel([(branch) => waitForAddress(branch)]);
    });

    expect(fetchMock()).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 3; index += 1) {
      expect(bodyAt(index)).toMatchObject({ execution_ref: EXECUTION_ARN });
    }
  });
});

describe('ctx.publish()', () => {
  it('opens a session, then publishes in a step that carries its token and key', async () => {
    let result: unknown;
    await run(async (_input, ctx) => {
      result = await ctx.publish('progress', { percent: 50 });
    });

    expect(result).toStrictEqual({ id: 'msg-2', seq: 4 });
    const { name, config } = onlyCallbackCall();
    expect(name).toBe(SESSION);
    expect(Object.keys(config)).toEqual(['retryStrategy']);
    noRetry(config);
    expect(requestAt(0)).toEqual({
      url: 'https://api.test.com/durable-messages/sessions',
      init: expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    });
    expect(bodyAt(0)).toStrictEqual({ execution_ref: EXECUTION_ARN, callback_id: 'cb-1' });

    expect(stepCalls).toEqual([expect.objectContaining({ name: 'progress' })]);
    noRetry(stepCalls[0]?.config);
    expect(requestAt(1)).toEqual({
      url: 'https://api.test.com/durable-messages/publish',
      init: expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Volcano-Durable-Session': SESSION_TOKEN,
          'Idempotency-Key': `${SESSION_HASH}:1`,
        },
      }),
    });
    expect(bodyAt(1)).toStrictEqual({ name: 'progress', data: { percent: 50 } });
  });

  it('reuses the session and numbers each publish in the context', async () => {
    await run(async (_input, ctx) => {
      await ctx.publish('progress', 1);
      await Promise.all([ctx.publish('progress', 2), ctx.publish('done')]);
    });

    expect(onlyCallbackCall().name).toBe(SESSION);
    expect(publishRequests()).toEqual([
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': `${SESSION_HASH}:1` }),
        body: { name: 'progress', data: 1 },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': `${SESSION_HASH}:2` }),
        body: { name: 'progress', data: 2 },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': `${SESSION_HASH}:3` }),
        body: { name: 'done', data: null },
      }),
    ]);
    expect(stepCalls.map((call) => call.name)).toEqual(['progress', 'progress', 'done']);
  });

  it('opens one session for concurrent first publishes', async () => {
    await run(async (_input, ctx) => {
      await Promise.all([ctx.publish('a'), ctx.publish('b')]);
    });

    expect(onlyCallbackCall().name).toBe(SESSION);
    expect(publishRequests().map(({ body }) => body)).toEqual([
      { name: 'a', data: null },
      { name: 'b', data: null },
    ]);
  });

  it('gives each nested context its own session', async () => {
    sessionTokens = [SESSION_TOKEN, 'vdms_child'];

    await run(async (_input, ctx) => {
      await ctx.publish('root');
      await ctx.child('stage', (child) => child.publish('child'));
    });

    expect(callbackCalls.map((call) => call.name)).toEqual([SESSION, SESSION]);
    expect(publishRequests().map(({ headers }) => headers)).toEqual([
      expect.objectContaining({
        'X-Volcano-Durable-Session': SESSION_TOKEN,
        'Idempotency-Key': `${SESSION_HASH}:1`,
      }),
      expect.objectContaining({
        'X-Volcano-Durable-Session': 'vdms_child',
        'Idempotency-Key': 'db3f706c48bc5b4f102adfa6af7e6e537a584516b11460462993b47c342e5350:1',
      }),
    ]);
  });

  it('accepts a session token the runtime already parsed', async () => {
    callbackOutcome = () => Promise.resolve({ token: 'vdms_session' });

    await run((_input, ctx) => ctx.publish('progress'));

    expect(publishRequests()[0]?.headers).toMatchObject({
      'X-Volcano-Durable-Session': SESSION_TOKEN,
    });
  });

  it.each([200, 201])('resolves a %d answer', async (status) => {
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(published({ seq: 9 }), { status }));

    let result: unknown;
    await run(async (_input, ctx) => {
      result = await ctx.publish('progress');
    });
    expect(result).toEqual({ id: 'msg-2', seq: 9 });
  });

  it('sends the data it checked', async () => {
    let serialized = 0;
    const data = {
      toJSON() {
        serialized += 1;
        return serialized === 1 ? { percent: 50 } : 'x'.repeat(70_000);
      },
    };

    await run((_input, ctx) => ctx.publish('progress', data));

    expect(publishRequests()[0]?.body).toEqual({ name: 'progress', data: { percent: 50 } });
  });

  it.each([false, 0, '', null])('sends falsy data %p as it is', async (data) => {
    await run((_input, ctx) => ctx.publish('progress', data));

    expect(publishRequests()[0]?.body).toStrictEqual({ name: 'progress', data });
  });

  it('accepts data of exactly 64 KiB as JSON', async () => {
    // Two quotes around the string.
    await run((_input, ctx) => ctx.publish('progress', 'd'.repeat(64 * 1024 - 2)));

    expect(publishRequests()).toHaveLength(1);
  });

  it.each([
    ['one byte over', 'd'.repeat(64 * 1024 - 1)],
    ['over in UTF-8 but not in characters', 'é'.repeat(32 * 1024)],
  ])('refuses data %s 64 KiB', async (_case, data) => {
    await expect(run((_input, ctx) => ctx.publish('progress', data))).rejects.toThrow(
      new TypeError('ctx.publish() data must be at most 64 KiB as JSON'),
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it.each([
    ['with a BigInt', { total: 10n }, 'BigInt'],
    ['that are circular', circular(), 'circular structure'],
  ])('refuses data %s, keeping the reason', async (_case, data, reason) => {
    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress', data)));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'ctx.publish() data must be serializable as JSON',
      cause: expect.objectContaining({ message: expect.stringContaining(reason) }),
    });
    expect(callbackCalls).toHaveLength(0);
  });

  it.each([
    ['an empty name', [''], 'ctx.publish() requires a non-empty name'],
    ['a non-string name', [null], 'ctx.publish() requires a non-empty name'],
    ['a long name', ['n'.repeat(238)], 'ctx.publish() name must be at most 237 characters'],
    ['a name outside ASCII', ['progrès'], 'ctx.publish() name must be printable ASCII'],
    [
      'data that serializes to nothing',
      ['ok', () => 1],
      'ctx.publish() data must be serializable as JSON',
    ],
    ['a symbol', ['ok', Symbol('data')], 'ctx.publish() data must be serializable as JSON'],
  ])('refuses %s before opening a session', async (_case, args, message) => {
    await expect(
      run(callWith((ctx) => Reflect.apply(ctx.publish.bind(ctx), undefined, args))),
    ).rejects.toThrow(new TypeError(message));
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('explains that the platform URL is missing', async () => {
    Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');

    await expect(run((_input, ctx) => ctx.publish('progress'))).rejects.toThrow(
      'ctx.publish() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to publish messages.',
    );
  });

  it('refuses when the runtime did not report the execution', async () => {
    await expect(run((_input, ctx) => ctx.publish('progress'), {})).rejects.toThrow(
      'ctx.publish() cannot tell which execution is running: the durable runtime did not report it',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('refuses a runtime without callbacks', async () => {
    mockContextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCallback');
      return context;
    };

    await expect(run((_input, ctx) => ctx.publish('progress'))).rejects.toThrow(
      'The durable runtime does not support messages',
    );
  });

  it.each([
    ['text that is not JSON', 'vdms_session'],
    ['no token', JSON.stringify({})],
    ['an empty token', JSON.stringify({ token: '' })],
    ['a numeric token', JSON.stringify({ token: 7 })],
    ['JSON null', 'null'],
  ])('refuses a session resumed with %s', async (_case, result) => {
    callbackOutcome = () => Promise.resolve(result);

    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress')));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'Volcano opened the messages session with a token this SDK cannot read',
    });
    expect(stepCalls).toHaveLength(0);
  });

  it('keeps the parse error behind a session token that is not JSON', async () => {
    callbackOutcome = () => Promise.resolve('{');

    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress')));

    expect(failure instanceof Error ? failure.cause : undefined).toBeInstanceOf(SyntaxError);
  });

  it('names the session when Volcano refuses it', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'execution has ended', code: 'execution_ended' }, { status: 409 }),
    );

    await expect(failureOf(run((_input, ctx) => ctx.publish('progress')))).resolves.toMatchObject({
      message: 'Volcano refused the messages session (409 execution_ended): execution has ended',
    });
  });

  it('treats a closed session callback as opened and uses the runtime outcome', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'closed', code: 'callback_closed' }, { status: 409 }),
    );

    await run((_input, ctx) => ctx.publish('progress'));

    expect(publishRequests()).toHaveLength(1);
  });

  it('retries a session callback Volcano cannot see yet', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'not ready', code: 'callback_not_ready' }, { status: 409 }),
    );

    const pending = run((_input, ctx) => ctx.publish('progress'));
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(requestAt(1).url).toBe('https://api.test.com/durable-messages/sessions');
    expect(publishRequests()).toHaveLength(1);
  });

  it('names the session when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(run((_input, ctx) => ctx.publish('progress')));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to open the messages session: fetch failed',
    });
  });

  it.each([
    [
      401,
      { error: 'invalid durable session' },
      'Volcano refused the message (401): invalid durable session',
    ],
    [
      409,
      { error: 'execution is not running', code: 'execution_not_running' },
      'Volcano refused the message (409 execution_not_running): execution is not running',
    ],
    [
      409,
      { error: 'too many messages', code: 'too_many_published_messages' },
      'Volcano refused the message (409 too_many_published_messages): too many messages',
    ],
    // Publishing has no callback, so no conflict is worth retrying.
    [409, { error: 'conflict' }, 'Volcano refused the message (409): conflict'],
    [
      409,
      { error: 'not ready', code: 'callback_not_ready' },
      'Volcano refused the message (409 callback_not_ready): not ready',
    ],
  ])('fails the publish at once on a %d refusal', async (status, body, message) => {
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(body, { status }));

    await expect(failureOf(run((_input, ctx) => ctx.publish('progress')))).resolves.toMatchObject({
      status,
      message,
    });
    expect(publishRequests()).toHaveLength(1);
  });

  it('retries a publish Volcano could not answer, with the same key', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));

    const pending = run((_input, ctx) => ctx.publish('progress'));
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    const [first, second] = publishRequests();
    expect(second).toEqual(first);
  });

  it('names the message when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(run((_input, ctx) => ctx.publish('progress')));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to publish the message: fetch failed',
    });
  });

  it.each([
    ['no body', null],
    ['no id', published({ id: undefined })],
    ['a numeric id', published({ id: 2 })],
    ['no seq', published({ seq: undefined })],
    ['a textual seq', published({ seq: '4' })],
  ])('refuses an answer with %s', async (_case, body) => {
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(body, { status: 201 }));

    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress')));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'Volcano answered the publish with a message this SDK cannot read',
    });
  });
});
