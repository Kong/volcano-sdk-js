/** @jest-environment ./__tests__/node-environment.cjs */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import { CallbackFailedError, durable } from '../src/durable.ts';
import { callbackOperationId } from '../src/durable-callback-token.ts';
import type { CallbackSubmitter, DurableHandler } from '../src/durable-types.ts';
import { settledRun } from './support/settled-run.ts';

// durable-callback-token.test.ts stands a double in for the runtime. These run
// the same calls through the runtime Volcano installs and its local
// checkpoint service, so a failure keeps its type across replay, as it does
// in a deployed function. The runner is loaded untyped, as in
// durable-message-runtime.test.ts.

type LambdaHandler = (event: unknown, context: unknown) => Promise<unknown>;

interface ErrorObject {
  ErrorType?: string;
  ErrorMessage?: string;
  ErrorData?: string;
}

interface Operation {
  waitForData(status: 'SUBMITTED'): Promise<Operation>;
  sendCallbackSuccess(result: string): Promise<unknown>;
  sendCallbackFailure(error: ErrorObject): Promise<unknown>;
  sendCallbackHeartbeat(): Promise<unknown>;
}

interface Runner {
  run(request: { payload: unknown }): Promise<{ getResult(): unknown }>;
  getOperation(name: string): Operation;
  getOperationById(id: string): { getType(): string | undefined };
}

interface RunnerClass {
  new (params: { handlerFunction: LambdaHandler }): Runner;
  setupTestEnvironment(params: { skipTime: boolean }): Promise<void>;
  teardownTestEnvironment(): Promise<void>;
}

function isRunnerClass(value: unknown): value is RunnerClass {
  return (
    typeof value === 'function' &&
    typeof Reflect.get(value, 'setupTestEnvironment') === 'function' &&
    typeof Reflect.get(value, 'teardownTestEnvironment') === 'function'
  );
}

function localRunner(): RunnerClass {
  const testing = jest.requireActual(require.resolve('@aws/durable-execution-sdk-js-testing'));
  const runner: unknown =
    typeof testing === 'object' && testing !== null
      ? Reflect.get(testing, 'LocalDurableTestRunner')
      : undefined;
  if (!isRunnerClass(runner)) {
    throw new TypeError('The durable test runner does not expose LocalDurableTestRunner');
  }
  return runner;
}

type WithDurableExecution = (
  handler: (input: unknown, context: unknown) => Promise<unknown>,
) => LambdaHandler;

function isWithDurableExecution(value: unknown): value is WithDurableExecution {
  return typeof value === 'function';
}

// The runtime itself, for a handler that inspects the context Volcano wraps.
function withDurableExecution(): WithDurableExecution {
  const runtime = jest.requireActual(require.resolve('@aws/durable-execution-sdk-js'));
  const wrap: unknown =
    typeof runtime === 'object' && runtime !== null
      ? Reflect.get(runtime, 'withDurableExecution')
      : undefined;
  if (!isWithDurableExecution(wrap)) {
    throw new TypeError('The durable runtime does not expose withDurableExecution');
  }
  return wrap;
}

const LocalDurableTestRunner = localRunner();

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null ? Reflect.get(value, key) : undefined;
}
const API_URL = 'https://api.test.com';
const TOKEN = 'vcb_Zm9yIHRoZSBwYXltZW50IHdvcmtmbG93IHRvIGNvbXBsZXRl';

let invocations = 0;
const submitted: string[] = [];

function runnerFor(handler: DurableHandler): Runner {
  const invoke = durable(handler);
  return new LocalDurableTestRunner({
    handlerFunction(event, context) {
      invocations += 1;
      return invoke(event, context);
    },
  });
}

async function settlePayment(
  runner: Runner,
  settle: (operation: Operation) => Promise<unknown>,
): Promise<{ getResult(): unknown }> {
  return settledRun(
    runner.run({ payload: {} }),
    runner.getOperation('payment').waitForData('SUBMITTED').then(settle),
  );
}

const fetchMock = () => jest.mocked(globalThis.fetch);

function registrations(): unknown[] {
  return fetchMock()
    .mock.calls.filter(([url]) => url === `${API_URL}/durable-callbacks`)
    .map(([, init]) => {
      const body = init?.body;
      if (typeof body !== 'string') {
        throw new TypeError('Expected a JSON body');
      }
      const value: unknown = JSON.parse(body);
      return value;
    });
}

const record: CallbackSubmitter = (token) => {
  submitted.push(token);
};

const awaitPayment: DurableHandler = async (_input, ctx) => {
  const result = await ctx.waitForCallback('payment', record);
  await ctx.wait('1s');
  return result;
};

beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));

afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

beforeEach(() => {
  invocations = 0;
  submitted.length = 0;
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockImplementation(() =>
    Promise.resolve(Response.json({ token: TOKEN, expires_at: null }, { status: 201 })),
  );
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
});

describe('durable callbacks on the durable runtime', () => {
  it('registers once and resolves with the result, however often the execution replays', async () => {
    const runner = runnerFor(awaitPayment);

    const result = await settlePayment(runner, (operation) =>
      operation.sendCallbackSuccess(JSON.stringify({ charge: 'ch_1042' })),
    );

    expect(result.getResult()).toEqual({ charge: 'ch_1042' });
    expect(invocations).toBeGreaterThan(1);
    expect(registrations()).toEqual([
      { execution_ref: expect.any(String), callback_id: expect.any(String), name: 'payment' },
    ]);
    expect(submitted).toEqual([TOKEN]);
    expect(runner.getOperationById(callbackOperationId('1-1')).getType()).toBe('CALLBACK');
  });

  // A replayed registration names its callback's operation from these. They are
  // private to the runtime, so an upgrade that drops them shows up here rather
  // than as replays that read only recent history.
  it('exposes the step cursor and checkpoint a replayed registration reads', async () => {
    let members: string[] = [];
    const runner = new LocalDurableTestRunner({
      handlerFunction: withDurableExecution()((_input, context) => {
        members = [
          typeof field(context, 'peekStepId'),
          typeof field(field(context, '_executionContext'), 'getStepData'),
        ];
        return Promise.resolve(null);
      }),
    });

    await runner.run({ payload: {} });

    expect(members).toEqual(['function', 'function']);
  });

  it('raises the failure with its type, and raises it again on replay', async () => {
    const runner = runnerFor(async (_input, ctx) => {
      const failure = await ctx.waitForCallback('payment', record).then(
        () => null,
        (error: unknown) =>
          error instanceof CallbackFailedError
            ? { type: error.type, message: error.message }
            : String(error),
      );
      await ctx.wait('1s');
      return failure;
    });

    const result = await settlePayment(runner, (operation) =>
      operation.sendCallbackFailure({
        ErrorType: 'CardDeclined',
        ErrorMessage: 'insufficient funds',
        ErrorData: JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' }),
      }),
    );

    expect(result.getResult()).toEqual({ type: 'CardDeclined', message: 'insufficient funds' });
    expect(invocations).toBeGreaterThan(1);
  });

  it('keeps waiting through heartbeats', async () => {
    const runner = runnerFor((_input, ctx) =>
      ctx.waitForCallback('payment', record, { heartbeatTimeout: '1m' }),
    );

    const result = await settlePayment(runner, async (operation) => {
      await operation.sendCallbackHeartbeat();
      await operation.sendCallbackSuccess('"settled"');
    });

    expect(result.getResult()).toBe('settled');
  });

  // The checkpoint service keeps callback timers in its own worker, out of
  // reach of skipTime, so these wait out the shortest timeout for real.
  it('resolves null when the callback times out', async () => {
    const runner = runnerFor((_input, ctx) =>
      ctx.waitForCallback('payment', record, { timeout: '1s' }),
    );

    const result = await runner.run({ payload: {} });

    expect(result.getResult()).toBeNull();
    expect(registrations()).toHaveLength(1);
  });

  it('resolves null when no heartbeat arrives in time', async () => {
    const runner = runnerFor((_input, ctx) =>
      ctx.waitForCallback('payment', record, { timeout: '1h', heartbeatTimeout: '1s' }),
    );

    const result = await runner.run({ payload: {} });

    expect(result.getResult()).toBeNull();
  });
});
