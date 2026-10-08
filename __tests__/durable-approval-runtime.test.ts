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
import { durable } from '../src/durable.ts';
import type { DurableHandler } from '../src/durable-types.ts';

// durable-approval.test.ts stands a double in for the runtime. These run the
// same calls through the runtime Volcano installs and its local checkpoint
// service, so replay, callback timeouts, and the execution ARN behave as they
// do in a deployed function.
//
// The runtime's declarations do not compile under exactOptionalPropertyTypes,
// so tsconfig maps it to an opaque stub, and the test runner's declarations
// import it. The runner is loaded untyped and described by the parts used here.

type LambdaHandler = (event: unknown, context: unknown) => Promise<unknown>;

interface Operation {
  waitForData(status: 'SUBMITTED'): Promise<Operation>;
  sendCallbackSuccess(result: string): Promise<unknown>;
}

interface Runner {
  run(request: { payload: unknown }): Promise<{ getResult(): unknown }>;
  getOperation(name: string): Operation;
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

const LocalDurableTestRunner = localRunner();
const executionArns: unknown[] = [];

function runnerFor(handler: DurableHandler): Runner {
  const invoke = durable(handler);
  return new LocalDurableTestRunner({
    handlerFunction(event, context) {
      executionArns.push(
        typeof event === 'object' && event !== null
          ? Reflect.get(event, 'DurableExecutionArn')
          : undefined,
      );
      return invoke(event, context);
    },
  });
}

async function decideWith(runner: Runner, decision: Record<string, unknown>): Promise<unknown> {
  const execution = runner.run({ payload: {} });
  const approval = await runner.getOperation('ship-order').waitForData('SUBMITTED');
  await approval.sendCallbackSuccess(JSON.stringify(decision));
  const result = await execution;
  return result.getResult();
}

const fetchMock = () => jest.mocked(globalThis.fetch);

function bodyAt(index: number): unknown {
  const body = fetchMock().mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON body');
  }
  const value: unknown = JSON.parse(body);
  return value;
}

beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));

afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

beforeEach(() => {
  executionArns.length = 0;
  process.env['VOLCANO_PLATFORM_API_URL'] = 'https://api.test.com';
  fetchMock().mockImplementation(() =>
    Promise.resolve(
      Response.json({ id: 'apr-1', status: 'pending', expires_at: null }, { status: 201 }),
    ),
  );
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
});

describe('ctx.waitForApproval() on the durable runtime', () => {
  it('registers once, however often the execution replays', async () => {
    let invocations = 0;
    const runner = runnerFor(async (_input, ctx) => {
      invocations += 1;
      await ctx.step('check-stock', () => Promise.resolve(true));
      return ctx.waitForApproval('ship-order', { title: 'Ship order 42?' });
    });

    const decision = await decideWith(runner, {
      status: 'approved',
      approved: true,
      comment: 'Address checked',
      decided_by: { id: 'user-1', email: 'owner@example.com' },
      decided_at: '2026-10-06T12:05:00Z',
    });

    expect(decision).toEqual({
      approved: true,
      status: 'approved',
      comment: 'Address checked',
      decidedBy: { id: 'user-1', email: 'owner@example.com' },
      decidedAt: '2026-10-06T12:05:00Z',
    });
    expect(invocations).toBeGreaterThan(1);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  // The checkpoint service keeps callback timers in its own worker, out of
  // reach of skipTime, so this waits out the shortest timeout for real.
  it('resolves an expired decision when nobody decides in time', async () => {
    const runner = runnerFor((_input, ctx) =>
      ctx.waitForApproval('ship-order', { title: 'Ship order 42?', timeout: '1s' }),
    );

    const result = await runner.run({ payload: {} });

    expect(result.getResult()).toEqual({
      approved: false,
      status: 'expired',
      comment: '',
      decidedBy: null,
      decidedAt: null,
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('registers the approval under the execution the runtime is running', async () => {
    const runner = runnerFor((_input, ctx) =>
      ctx.waitForApproval('ship-order', { title: 'Ship order 42?' }),
    );

    await expect(decideWith(runner, { status: 'denied' })).resolves.toMatchObject({
      status: 'denied',
    });

    const [arn] = executionArns;
    expect(arn).toEqual(expect.stringMatching(/\S/));
    expect(bodyAt(0)).toMatchObject({ execution_ref: arn });
  });

  // The runtime records a failed submitter by message and rethrows its own
  // error, so the refusal's code survives only in the message.
  it('hands the handler a refusal it can recognize by message', async () => {
    fetchMock().mockImplementation(() =>
      Promise.resolve(
        Response.json(
          { error: 'too many pending approvals', code: 'too_many_pending_approvals' },
          { status: 409 },
        ),
      ),
    );
    const runner = runnerFor(async (_input, ctx) => {
      try {
        return await ctx.waitForApproval('ship-order', { title: 'Ship order 42?' });
      } catch (error) {
        return error instanceof Error ? { name: error.name, message: error.message } : error;
      }
    });

    const result = await runner.run({ payload: {} });

    expect(result.getResult()).toEqual({
      name: 'CallbackSubmitterError',
      message:
        'Volcano refused the approval request (409 too_many_pending_approvals): too many pending approvals',
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
});
