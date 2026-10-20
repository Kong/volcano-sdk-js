/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CallbackFailedError, durable } from '../src/durable.ts';
import type {
  CallbackSubmitter,
  DurableContext,
  DurableHandler,
  DurableLog,
} from '../src/durable-types.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

// As in durable-message.test.ts, a double stands in for the optional runtime.
// Its waitForCallback runs the submitter once and then settles the way the
// runtime would when the token's holder completes, fails, or lets the
// callback time out.

interface CallbackCall {
  name: unknown;
  config: Record<string, unknown>;
}

type Submitter = (callbackId: string) => Promise<void>;

interface FakeContext {
  logger: DurableLog;
  configureLogger(): void;
  step(): unknown;
  wait(): Promise<void>;
  runInChildContext(): Promise<unknown>;
  waitForCondition(): Promise<unknown>;
  map(): Promise<unknown>;
  parallel(): Promise<unknown>;
  waitForCallback?: (
    name: unknown,
    submitter: Submitter,
    config: Record<string, unknown>,
  ) => Promise<unknown>;
  executionContext?: { durableExecutionArn?: unknown };
}

const EXECUTION_ARN =
  'arn:aws:lambda:us-east-1:123456789012:function:payments:$LATEST/durable-execution/exec-1/abc';
const API_URL = 'https://api.test.com';
const TOKEN = 'vcb_Zm9yIHRoZSBwYXltZW50IHdvcmtmbG93IHRvIGNvbXBsZXRl';

const callbackCalls: CallbackCall[] = [];
const submitted: string[] = [];
let callbackOutcome: () => Promise<unknown>;
let runtimeHasCallbacks: boolean;

const record: CallbackSubmitter = (token) => {
  submitted.push(token);
};

function mockContext(executionContext?: FakeContext['executionContext']): FakeContext {
  const logger: DurableLog = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  };
  const context: FakeContext = {
    logger,
    configureLogger: jest.fn(),
    step: jest.fn(),
    wait: () => Promise.resolve(),
    runInChildContext: () => Promise.resolve(),
    waitForCondition: () => Promise.resolve(),
    map: () => Promise.resolve(),
    parallel: () => Promise.resolve(),
    ...(executionContext === undefined ? {} : { executionContext }),
  };
  if (runtimeHasCallbacks) {
    context.waitForCallback = async (name, submitter, config) => {
      callbackCalls.push({ name, config });
      await submitter(`cb-${String(callbackCalls.length)}`);
      return callbackOutcome();
    };
  }
  return context;
}

jest.mock(
  '@aws/durable-execution-sdk-js',
  () => ({
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) =>
      (event: { input: unknown; DurableExecutionArn: unknown }) =>
        handler(event.input, mockContext({ durableExecutionArn: event.DurableExecutionArn })),
    StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' },
    createRetryStrategy: jest.fn(),
    createWaitStrategy: jest.fn(),
  }),
  { virtual: true },
);

function run(handler: DurableHandler, event?: Record<string, unknown>): Promise<unknown> {
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

function onlyCallbackCall(): CallbackCall {
  expect(callbackCalls).toHaveLength(1);
  const [call] = callbackCalls;
  if (call === undefined) {
    throw new Error('Missing waitForCallback call');
  }
  return call;
}

function bodyAt(index: number): unknown {
  const body = fetchMock().mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON body');
  }
  const value: unknown = JSON.parse(body);
  return value;
}

function noRetry(config: Record<string, unknown>): void {
  const retryStrategy = config['retryStrategy'];
  if (typeof retryStrategy !== 'function') {
    throw new TypeError('Expected a retry strategy');
  }
  expect(Reflect.apply(retryStrategy, undefined, [new Error('refused'), 1])).toEqual({
    shouldRetry: false,
  });
}

function runtimeError(errorType: string, message: string, errorData?: string): Error {
  return Object.assign(new Error(message), { errorType, errorData });
}

const timedOut = () => runtimeError('CallbackTimeoutError', 'Callback timed out');

// Waits for the payment, handing the token to `submitter`.
const awaitPayment =
  (submitter: CallbackSubmitter, options?: Record<string, unknown>): DurableHandler =>
  (_input, ctx) =>
    ctx.waitForCallback('payment', submitter, options);

// Calls the way JavaScript can, past the TypeScript signature.
const callWith =
  (call: (ctx: DurableContext) => unknown): DurableHandler =>
  (_input, ctx) => {
    const result = call(ctx);
    return result instanceof Promise ? result : Promise.reject(new Error('Expected a promise'));
  };

beforeEach(() => {
  callbackCalls.length = 0;
  submitted.length = 0;
  runtimeHasCallbacks = true;
  callbackOutcome = () => Promise.resolve(JSON.stringify({ charge: 'ch_1042' }));
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockImplementation(() =>
    Promise.resolve(Response.json({ token: TOKEN, expires_at: null }, { status: 201 })),
  );
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
  jest.useRealTimers();
  jest.restoreAllMocks();
});

describe('ctx.waitForCallback()', () => {
  it('registers the callback, hands its token to the submitter, and resolves with the result', async () => {
    const result = await run(awaitPayment(record));

    expect(result).toEqual({ charge: 'ch_1042' });
    expect(submitted).toEqual([TOKEN]);
    const { name, config } = onlyCallbackCall();
    expect(name).toBe('payment');
    expect(Object.keys(config)).toEqual(['retryStrategy']);
    noRetry(config);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls[0]?.[0]).toBe('https://api.test.com/durable-callbacks');
    expect(fetchMock().mock.calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'payment',
    });
  });

  it('awaits an asynchronous submitter before waiting', async () => {
    const order: string[] = [];
    callbackOutcome = () => {
      order.push('waiting');
      return Promise.resolve('"done"');
    };

    await run(
      awaitPayment(async () => {
        await Promise.resolve();
        order.push('submitted');
      }),
    );

    expect(order).toEqual(['submitted', 'waiting']);
  });

  it('ignores what the submitter returns', async () => {
    const result = await run(
      awaitPayment(async (token) => {
        await Promise.resolve();
        return { queued: submitted.push(token) };
      }),
    );

    expect(result).toEqual({ charge: 'ch_1042' });
    expect(submitted).toEqual([TOKEN]);
  });

  it('passes the timeout and heartbeat timeout to the callback', async () => {
    await run(awaitPayment(record, { timeout: { hours: 2 }, heartbeatTimeout: { minutes: 5 } }));

    const { config } = onlyCallbackCall();
    expect(config['timeout']).toEqual({ hours: 2 });
    expect(config['heartbeatTimeout']).toEqual({ minutes: 5 });
  });

  it('resolves null when the callback times out', async () => {
    callbackOutcome = () => Promise.reject(timedOut());

    await expect(run(awaitPayment(record))).resolves.toBeNull();
  });

  it('throws CallbackFailedError with the type and message the callback failed with', async () => {
    const failure = runtimeError(
      'CallbackExternalError',
      'insufficient funds',
      JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' }),
    );
    callbackOutcome = () => Promise.reject(failure);

    const error = await failureOf(run(awaitPayment(record)));

    expect(error).toBeInstanceOf(CallbackFailedError);
    expect(error).toMatchObject({
      name: 'CallbackFailedError',
      type: 'CardDeclined',
      message: 'insufficient funds',
      cause: failure,
    });
  });

  it('keeps an empty failure message empty', async () => {
    callbackOutcome = () =>
      Promise.reject(
        runtimeError(
          'CallbackExternalError',
          'Callback failed',
          JSON.stringify({ type: 'Cancelled', message: '' }),
        ),
      );

    const error = await failureOf(run(awaitPayment(record)));

    expect(error).toMatchObject({ type: 'Cancelled', message: '' });
  });

  it.each([
    ['a missing message', { type: 'Cancelled' }],
    ['a message that is not text', { type: 'Cancelled', message: 42 }],
  ])('reads %s as an empty one', async (_case, data) => {
    callbackOutcome = () =>
      Promise.reject(
        runtimeError('CallbackExternalError', 'Callback failed', JSON.stringify(data)),
      );

    const error = await failureOf(run(awaitPayment(record)));

    expect(error).toBeInstanceOf(CallbackFailedError);
    expect(error).toMatchObject({ type: 'Cancelled', message: '' });
  });

  it.each([
    ['data that is not JSON', 'not json'],
    ['no data', undefined],
    ['data without a type', JSON.stringify({ message: 'insufficient funds' })],
    ['a type that is not text', JSON.stringify({ type: 7, message: 'insufficient funds' })],
  ])('rethrows a failure with %s as the runtime raised it', async (_case, data) => {
    const failure = runtimeError('CallbackExternalError', 'Callback failed', data);
    callbackOutcome = () => Promise.reject(failure);

    await expect(failureOf(run(awaitPayment(record)))).resolves.toBe(failure);
  });

  it('reads failure data only as JSON text', async () => {
    const failure = Object.assign(new Error('Callback failed'), {
      errorType: 'CallbackExternalError',
      errorData: [JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' })],
    });
    callbackOutcome = () => Promise.reject(failure);

    await expect(failureOf(run(awaitPayment(record)))).resolves.toBe(failure);
  });

  it.each([
    ['another runtime error', runtimeError('CallbackSubmitterError', 'the provider is down')],
    [
      'another runtime error carrying failure data',
      runtimeError(
        'CallbackSubmitterError',
        'the provider is down',
        JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' }),
      ),
    ],
    ['a thrown string', 'boom'],
    ['a thrown null', null],
  ])('rethrows %s', async (_case, failure) => {
    callbackOutcome = () => rejectWithForeignValue(failure);

    await expect(failureOf(run(awaitPayment(record)))).resolves.toBe(failure);
  });

  it('skips the submitter when the callback closed before it registered', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json(
        { error: 'callback is no longer open', code: 'callback_closed' },
        { status: 409 },
      ),
    );
    callbackOutcome = () => Promise.reject(timedOut());
    const submitter = jest.fn<CallbackSubmitter>();

    await expect(run(awaitPayment(submitter))).resolves.toBeNull();

    expect(submitter).not.toHaveBeenCalled();
  });

  it('fails without calling the submitter when Volcano refuses the registration', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'callback is registered', code: 'callback_taken' }, { status: 409 }),
    );
    callbackOutcome = () => Promise.resolve('"unreached"');
    const submitter = jest.fn<CallbackSubmitter>();

    const error = await failureOf(run(awaitPayment(submitter)));

    expect(error).toMatchObject({
      message: 'Volcano refused the callback (409 callback_taken): callback is registered',
    });
    expect(submitter).not.toHaveBeenCalled();
  });

  it('retries until Volcano sees the callback waiting', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'not ready', code: 'callback_not_ready' }, { status: 409 }),
    );

    const pending = run(awaitPayment(record));
    await jest.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toEqual({ charge: 'ch_1042' });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(bodyAt(1)).toEqual(bodyAt(0));
    expect(submitted).toEqual([TOKEN]);
  });

  it('names the registration when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(run(awaitPayment(record)));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to register the callback: fetch failed',
    });
    expect(submitted).toEqual([]);
  });

  it.each([
    ['without a token', { expires_at: null }],
    ['with an empty token', { token: '', expires_at: null }],
    ['with a token that is not text', { token: 42, expires_at: null }],
    ['with a bare token instead of an object', `vcb_${'A'.repeat(43)}`],
  ])('fails when Volcano answers %s', async (_case, answer) => {
    fetchMock().mockResolvedValueOnce(Response.json(answer, { status: 201 }));
    const submitter = jest.fn<CallbackSubmitter>();

    await expect(failureOf(run(awaitPayment(submitter)))).resolves.toThrow(
      'Volcano registered the callback with a token this SDK cannot read',
    );
    expect(submitter).not.toHaveBeenCalled();
  });

  it('propagates a submitter failure', async () => {
    const refused = new Error('the provider refused the charge');

    await expect(
      failureOf(
        run(
          awaitPayment(() => {
            throw refused;
          }),
        ),
      ),
    ).resolves.toBe(refused);
  });

  it('fails on a result that is not JSON', async () => {
    callbackOutcome = () => Promise.resolve('{not json');

    await expect(failureOf(run(awaitPayment(record)))).resolves.toThrow(
      'Volcano resumed the callback with a result this SDK cannot read',
    );
  });

  it.each([
    ['an empty name', [' ', record], 'ctx.waitForCallback() requires a non-empty name'],
    ['a non-string name', [42, record], 'ctx.waitForCallback() requires a non-empty name'],
    [
      'a long name',
      ['n'.repeat(238), record],
      'ctx.waitForCallback() name must be at most 237 characters',
    ],
    [
      'a name outside ASCII',
      ['paiement-réglé', record],
      'ctx.waitForCallback() name must be printable ASCII',
    ],
    ['no submitter', ['payment'], 'ctx.waitForCallback() requires a submitter function'],
    [
      'a submitter that is not a function',
      ['payment', 'https://payments.example.com'],
      'ctx.waitForCallback() requires a submitter function',
    ],
    ['text options', ['payment', record, '1h'], 'ctx.waitForCallback() options must be an object'],
    [
      'a heartbeat timeout under a second',
      ['payment', record, { heartbeatTimeout: 0 }],
      'heartbeatTimeout must be at least 1 second',
    ],
    [
      'a timeout outside the execution lifetime',
      ['payment', record, { timeout: '367d' }],
      'timeout must be at most 31622400 seconds (366 days)',
    ],
  ])('refuses %s before registering anything', async (_case, args, message) => {
    await expect(
      run(callWith((ctx) => Reflect.apply(ctx.waitForCallback.bind(ctx), undefined, args))),
    ).rejects.toThrow(message);
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('accepts a name of 237 characters', async () => {
    const name = 'n'.repeat(237);

    await run(callWith((ctx) => ctx.waitForCallback(name, record)));

    expect(onlyCallbackCall().name).toBe(name);
    expect(bodyAt(0)).toMatchObject({ name });
  });

  it('needs the platform API URL Volcano sets on durable functions', async () => {
    Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');

    await expect(failureOf(run(awaitPayment(record)))).resolves.toThrow(
      'ctx.waitForCallback() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to wait for callbacks.',
    );
  });

  it('needs the runtime to report the execution', async () => {
    await expect(failureOf(run(awaitPayment(record), {}))).resolves.toThrow(
      'ctx.waitForCallback() cannot tell which execution is running',
    );
  });

  it('asks for a redeploy on a runtime without callbacks', async () => {
    runtimeHasCallbacks = false;

    await expect(failureOf(run(awaitPayment(record)))).resolves.toThrow(
      'The durable runtime does not support callbacks; redeploy the function',
    );
  });
});
