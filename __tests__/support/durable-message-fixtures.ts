import { expect, jest } from '@jest/globals';
import { durable } from '../../src/durable.ts';
import type { DurableContext, DurableHandler, DurableLog, ReceivedMessage } from '../../src/durable-types.ts';

// As in support/durable-approval-double.ts, a double stands in for the optional runtime.
// Its waitForCallback runs the submitter once and then resolves the way the
// runtime would when Volcano completes the callback: with the session token
// for a messages session, and with the message for a wait.

interface CallbackCall {
  name: unknown;
  config: Record<string, unknown>;
}

type Submitter = (callbackId: string) => Promise<void>;
type Run = (context: FakeContext) => Promise<unknown>;

interface FakeContext {
  logger: DurableLog;
  configureLogger(): void;
  step(name: unknown, fn: (scope: { logger: DurableLog; attempt: number }) => unknown, config?: unknown): unknown;
  wait(): Promise<void>;
  runInChildContext(name: unknown, fn: Run): Promise<unknown>;
  waitForCondition(): Promise<unknown>;
  map(
    name: unknown,
    items: unknown[],
    fn: (context: FakeContext, item: unknown, index: number) => Promise<unknown>,
  ): Promise<unknown>;
  parallel(name: unknown, branches: (Run | { func: Run })[]): Promise<unknown>;
  waitForCallback?: (name: unknown, submitter: Submitter, config: Record<string, unknown>) => Promise<unknown>;
  executionContext?: { durableExecutionArn?: unknown };
}

export const EXECUTION_ARN =
  'arn:aws:lambda:us-east-1:123456789012:function:order-pipeline:$LATEST/durable-execution/exec-1/abc';
const API_URL = 'https://api.test.com';
export const SESSION = 'volcano:messages-session';
export const SESSION_TOKEN = 'vdms_session';
// SHA-256 of SESSION_TOKEN, hex encoded.
export const SESSION_HASH = 'a2c7a36f61b2054a8a5dad91d7c330cf16b57dd4b6cd79de1c4d285ed825353f';

export const callbackCalls: CallbackCall[] = [];
export const childCalls: unknown[] = [];

export const sent = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: 'msg-1',
  name: 'address-confirmed',
  data: { address_id: 'addr_19' },
  sender: { type: 'user', user_id: 'user-1' },
  sent_at: '2026-10-12T09:30:00Z',
  ...overrides,
});

export const published = (overrides: Record<string, unknown> = {}): Record<string, unknown> => ({
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

interface RuntimeDouble {
  callbackOutcome: (name: unknown) => Promise<unknown>;
  sessionTokens: string[];
  contextTransform: ((context: FakeContext) => FakeContext) | undefined;
}

export const runtimeDouble: RuntimeDouble = {
  callbackOutcome: defaultOutcome,
  sessionTokens: [SESSION_TOKEN],
  contextTransform: undefined,
};

function defaultOutcome(name: unknown): Promise<unknown> {
  if (name !== SESSION) {
    return Promise.resolve(JSON.stringify(sent()));
  }
  const token = runtimeDouble.sessionTokens.shift() ?? 'vdms_other';
  return Promise.resolve(JSON.stringify({ token }));
}

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
    runInChildContext(name, fn) {
      childCalls.push(name);
      return fn(mockContext());
    },
    waitForCondition: () => Promise.resolve(),
    map: async (_name, items, fn) =>
      batch(await Promise.all(items.map((item, index) => fn(mockContext(), item, index)))),
    parallel: async (_name, branches) =>
      batch(
        await Promise.all(
          branches.map((branch) => (typeof branch === 'function' ? branch(mockContext()) : branch.func(mockContext()))),
        ),
      ),
    async waitForCallback(name, submitter, config) {
      callbackCalls.push({ name, config });
      await submitter(`cb-${String(callbackCalls.length)}`);
      return runtimeDouble.callbackOutcome(name);
    },
    ...(executionContext === undefined ? {} : { executionContext }),
  };
}

export function mockDurableRuntime(): Record<string, unknown> {
  return {
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) =>
      (event: { input: unknown; DurableExecutionArn: unknown }) => {
        const context = mockContext({ durableExecutionArn: event.DurableExecutionArn });
        return handler(event.input, runtimeDouble.contextTransform?.(context) ?? context);
      },
    StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' },
    createRetryStrategy: jest.fn(),
    createWaitStrategy: jest.fn(),
  };
}

export function run<Result>(
  handler: DurableHandler<unknown, Result>,
  event?: Record<string, unknown>,
): Promise<unknown> {
  return durable(handler)({ input: {}, ...(event ?? { DurableExecutionArn: EXECUTION_ARN }) }, {});
}

const fetchMock = () => jest.mocked(globalThis.fetch);

export const failureOf = (pending: Promise<unknown>): Promise<unknown> =>
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

// A response whose body fails partway, as one does when the request times out
// while reading it.
export function unreadable(status: number): Response {
  const body = new ReadableStream({
    pull(controller) {
      controller.error(new DOMException('The operation timed out', 'TimeoutError'));
    },
  });
  return new Response(body, { status });
}

export function requestAt(index: number): { url: unknown; init: RequestInit | undefined } {
  const call = fetchMock().mock.calls[index];
  if (call === undefined) {
    throw new Error(`Missing request ${String(index)}`);
  }
  return { url: call[0], init: call[1] };
}

export function bodyAt(index: number): unknown {
  const { body } = requestAt(index).init ?? {};
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON body');
  }
  const value: unknown = JSON.parse(body);
  return value;
}

export function publishRequests(): { headers: unknown; body: unknown }[] {
  return fetchMock()
    .mock.calls.map((_call, index) => index)
    .filter((index) => requestAt(index).url === `${API_URL}/durable-messages/publish`)
    .map((index) => ({ headers: requestAt(index).init?.headers, body: bodyAt(index) }));
}

export function circular(): Record<string, unknown> {
  const value: Record<string, unknown> = { step: 1 };
  value['self'] = value;
  return value;
}

export function onlyCallbackCall(): CallbackCall {
  expect(callbackCalls).toHaveLength(1);
  const [call] = callbackCalls;
  if (call === undefined) {
    throw new Error('Missing waitForCallback call');
  }
  return call;
}

export function noRetry(config: unknown): void {
  const retryStrategy: unknown =
    typeof config === 'object' && config !== null ? Reflect.get(config, 'retryStrategy') : undefined;
  if (typeof retryStrategy !== 'function') {
    throw new TypeError('Expected a retry strategy');
  }
  expect(Reflect.apply(retryStrategy, undefined, [new Error('refused'), 1])).toEqual({
    shouldRetry: false,
  });
}

export const waitForAddress = (ctx: DurableContext): Promise<ReceivedMessage | null> =>
  ctx.waitForMessage('address-confirmed');
export const waiting: DurableHandler = (_input, ctx) => waitForAddress(ctx);

export const receive = async (outcome: () => Promise<unknown>): Promise<unknown> => {
  runtimeDouble.callbackOutcome = outcome;
  let message: unknown;
  await run(async (_input, ctx) => {
    message = await waitForAddress(ctx);
  });
  return message;
};

// Calls the way JavaScript can, past the TypeScript signature.
export const callWith =
  (call: (ctx: DurableContext) => unknown): DurableHandler =>
  (_input, ctx) => {
    const result = call(ctx);
    return result instanceof Promise ? result : Promise.reject(new Error('Expected a promise'));
  };

export function resetRuntimeDouble(): void {
  callbackCalls.length = 0;
  childCalls.length = 0;
  runtimeDouble.sessionTokens = [SESSION_TOKEN];
  runtimeDouble.callbackOutcome = defaultOutcome;
  runtimeDouble.contextTransform = undefined;
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockImplementation((url) => Promise.resolve(answer(url)));
}

export function restoreRuntimeDouble(): void {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
  jest.useRealTimers();
  jest.restoreAllMocks();
}
