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
import { settledRun } from './support/settled-run.ts';

// durable-message.test.ts stands a double in for the runtime. These run the
// same calls through the runtime Volcano installs and its local checkpoint
// service, so the session a context opens, and the keys its publishes carry,
// survive replay as they do in a deployed function. The runner is loaded
// untyped, as in durable-approval-runtime.test.ts.

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
const API_URL = 'https://api.test.com';
const SESSION = 'volcano:messages-session';
// SHA-256 of "vdms_session", hex encoded.
const SESSION_HASH = 'a2c7a36f61b2054a8a5dad91d7c330cf16b57dd4b6cd79de1c4d285ed825353f';

let invocations = 0;

function runnerFor(handler: DurableHandler): Runner {
  const invoke = durable(handler);
  return new LocalDurableTestRunner({
    handlerFunction(event, context) {
      invocations += 1;
      return invoke(event, context);
    },
  });
}

async function complete(runner: Runner, name: string, result: unknown): Promise<void> {
  const operation = await runner.getOperation(name).waitForData('SUBMITTED');
  await operation.sendCallbackSuccess(JSON.stringify(result));
}

const fetchMock = () => jest.mocked(globalThis.fetch);

function requests(path: string): { headers: unknown; body: unknown }[] {
  return fetchMock()
    .mock.calls.filter(([url]) => url === `${API_URL}${path}`)
    .map(([, init]) => {
      const body = init?.body;
      if (typeof body !== 'string') {
        throw new TypeError('Expected a JSON body');
      }
      const value: unknown = JSON.parse(body);
      return { headers: init?.headers, body: value };
    });
}

let seq = 0;

function answer(url: unknown): Response {
  if (url === `${API_URL}/durable-messages/publish`) {
    seq += 1;
    return Response.json({ id: `msg-${String(seq)}`, seq }, { status: 201 });
  }
  return Response.json({ id: 'registered' }, { status: 201 });
}

beforeAll(() => LocalDurableTestRunner.setupTestEnvironment({ skipTime: true }));

afterAll(() => LocalDurableTestRunner.teardownTestEnvironment());

beforeEach(() => {
  invocations = 0;
  seq = 0;
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockImplementation((url) => Promise.resolve(answer(url)));
});

afterEach(() => {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
});

describe('durable messages on the durable runtime', () => {
  it('opens one session and publishes each message once, however often the execution replays', async () => {
    const runner = runnerFor(async (_input, ctx) => {
      const started = await ctx.publish('started', { step: 1 });
      const go = await ctx.waitForMessage('go');
      const done = await ctx.publish('done', { step: 2 });
      return { started, go, done };
    });

    const result = await settledRun(
      runner.run({ payload: {} }),
      complete(runner, SESSION, { token: 'vdms_session' }).then(() =>
        complete(runner, 'go', {
          id: 'msg-in',
          name: 'go',
          data: { approved: true },
          sender: { type: 'service_key', user_id: null },
          sent_at: '2026-10-12T09:30:00Z',
        }),
      ),
    );

    expect(result.getResult()).toEqual({
      started: { id: 'msg-1', seq: 1 },
      go: {
        id: 'msg-in',
        name: 'go',
        data: { approved: true },
        sender: { type: 'service_key', userId: null },
        sentAt: '2026-10-12T09:30:00Z',
      },
      done: { id: 'msg-2', seq: 2 },
    });
    expect(invocations).toBeGreaterThan(1);
    expect(requests('/durable-messages/sessions')).toHaveLength(1);
    expect(requests('/durable-messages/waits')).toEqual([
      { headers: expect.anything(), body: expect.objectContaining({ name: 'go' }) },
    ]);
    expect(requests('/durable-messages/publish')).toEqual([
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Volcano-Durable-Session': 'vdms_session',
          'Idempotency-Key': `${SESSION_HASH}:1`,
        },
        body: { name: 'started', data: { step: 1 } },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Volcano-Durable-Session': 'vdms_session',
          'Idempotency-Key': `${SESSION_HASH}:2`,
        },
        body: { name: 'done', data: { step: 2 } },
      },
    ]);
  });

  // The checkpoint service keeps callback timers in its own worker, out of
  // reach of skipTime, so this waits out the shortest timeout for real.
  it('resolves null when no message arrives in time', async () => {
    const runner = runnerFor((_input, ctx) => ctx.waitForMessage('go', { timeout: '1s' }));

    const result = await runner.run({ payload: {} });

    expect(result.getResult()).toBeNull();
    expect(requests('/durable-messages/waits')).toHaveLength(1);
  });

  it('fails the publish on a refusal, without retrying it', async () => {
    fetchMock().mockImplementation((url) =>
      Promise.resolve(
        url === `${API_URL}/durable-messages/publish`
          ? Response.json(
              { error: 'execution is not running', code: 'execution_not_running' },
              { status: 409 },
            )
          : answer(url),
      ),
    );
    const runner = runnerFor(async (_input, ctx) => {
      try {
        return await ctx.publish('started');
      } catch (error) {
        return error instanceof Error ? error.message : error;
      }
    });

    const result = await settledRun(
      runner.run({ payload: {} }),
      complete(runner, SESSION, { token: 'vdms_session' }),
    );

    expect(result.getResult()).toBe(
      'Volcano refused the message (409 execution_not_running): execution is not running',
    );
    expect(requests('/durable-messages/publish')).toHaveLength(1);
  });

  it('replays a publish that failed to open the session without reading it again', async () => {
    fetchMock().mockImplementation((url) =>
      Promise.resolve(
        url === `${API_URL}/durable-messages/sessions`
          ? Response.json(
              { error: 'execution is not running', code: 'execution_not_running' },
              { status: 409 },
            )
          : answer(url),
      ),
    );
    const runner = runnerFor(async (_input, ctx) => {
      const failure = await ctx.publish('started').then(
        () => 'published',
        (error: unknown) => (error instanceof Error ? error.message : error),
      );
      await ctx.wait('1s');
      return failure;
    });

    const result = await runner.run({ payload: {} });

    expect(result.getResult()).toEqual(expect.stringContaining('execution_not_running'));
    expect(invocations).toBeGreaterThan(1);
    expect(requests('/durable-messages/sessions')).toHaveLength(1);
    expect(requests('/durable-messages/publish')).toHaveLength(0);
  });

  // Live, `second` starts while the session waits for Volcano. On replay the
  // session is already answered, so it resolves before `second` starts.
  it('keeps a publish in its place among steps that start while its session opens', async () => {
    const runner = runnerFor(async (_input, ctx) => {
      const published = ctx.publish('started');
      const steps = ctx
        .step('first', () => Promise.resolve(1))
        .then(async () => {
          for (let turn = 0; turn < 50; turn += 1) {
            await Promise.resolve();
          }
          return ctx.step('second', () => Promise.resolve(2));
        });
      return { published: await published, second: await steps };
    });

    const result = await settledRun(
      runner.run({ payload: {} }),
      complete(runner, SESSION, { token: 'vdms_session' }),
    );

    expect(result.getResult()).toEqual({ published: { id: 'msg-1', seq: 1 }, second: 2 });
    expect(requests('/durable-messages/publish')).toHaveLength(1);
  });
});
