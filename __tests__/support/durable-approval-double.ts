import { expect, jest } from '@jest/globals';
import { durable } from '../../src/durable.ts';
import type { ApprovalDecision, DurableContext, DurableHandler, DurableLog } from '../../src/durable-types.ts';
import { mockDurableLog } from './durable-log.ts';

// Like durable-core-double.ts, a double stands in for the optional runtime. Its
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
  waitForCallback?: (name: unknown, submitter: Submitter, config: Record<string, unknown>) => Promise<unknown>;
  executionContext?: { durableExecutionArn?: unknown };
}

export const EXECUTION_ARN =
  'arn:aws:lambda:us-east-1:123456789012:function:order-pipeline:$LATEST/durable-execution/exec-1/abc';
const API_URL = 'https://api.test.com';

export const callbackCalls: CallbackCall[] = [];
let callbackOutcome: () => Promise<unknown>;

// What a test changes about the context the double hands the facade.
export const approvalDouble: { contextTransform: ((context: FakeContext) => FakeContext) | undefined } = {
  contextTransform: undefined,
};

export const decided = (overrides: Record<string, unknown> = {}): string =>
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
  const logger = mockDurableLog();
  return {
    logger,
    configureLogger: jest.fn<FakeContext['configureLogger']>(),
    step: (_name, fn) => fn({ logger, attempt: 1 }),
    wait: () => Promise.resolve(),
    runInChildContext: (_name, fn) => fn(mockContext()),
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
      await submitter('cb-1');
      return callbackOutcome();
    },
    ...(executionContext === undefined ? {} : { executionContext }),
  };
}

// The module a test file installs with jest.mock in place of the runtime.
export function mockApprovalRuntime(): Record<string, unknown> {
  return {
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) =>
      (event: { input: unknown; DurableExecutionArn: unknown }) => {
        const context = mockContext({ durableExecutionArn: event.DurableExecutionArn });
        return handler(event.input, approvalDouble.contextTransform?.(context) ?? context);
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

export const askToShip = (ctx: DurableContext): Promise<ApprovalDecision> =>
  ctx.waitForApproval('ship-order', { title: 'Ship order 42?' });
export const shipping: DurableHandler = (_input, ctx) => askToShip(ctx);
export const registered = (): Promise<unknown> => run(shipping);

export const fetchMock = (): jest.MockedFunction<typeof fetch> => jest.mocked(globalThis.fetch);

// Settles with the rejection, so a test can move fake time before awaiting it.
export const failureOf = (pending: Promise<unknown>): Promise<unknown> =>
  pending.then(
    () => {
      throw new Error('Expected the approval request to fail');
    },
    (error: unknown) => error,
  );

const registration = { id: 'apr-1', status: 'pending', expires_at: null };
export const respond = (status: number, body?: unknown): Response => Response.json(body ?? registration, { status });

export const decide = async (outcome: () => Promise<unknown>): Promise<unknown> => {
  callbackOutcome = outcome;
  let decision: unknown;
  await run(async (_input, ctx) => {
    decision = await askToShip(ctx);
  });
  return decision;
};

export function requestAt(index: number): { url: unknown; init: RequestInit | undefined } {
  const call = fetchMock().mock.calls[index];
  if (call === undefined) {
    throw new Error(`Missing approval request ${String(index)}`);
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

// AbortSignal.timeout keeps real time even under fake timers, so stand in one
// that keeps fake time, and record what each attempt was given.
export function hangUntilTimedOut(): number[] {
  const timeouts: number[] = [];
  jest.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    timeouts.push(ms);
    const controller = new AbortController();
    setTimeout(() => {
      controller.abort();
    }, ms);
    return controller.signal;
  });
  fetchMock().mockImplementation(hang);
  return timeouts;
}

export function hang(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(new DOMException('The operation timed out', 'TimeoutError'));
    });
  });
}

export function circular(): Record<string, unknown> {
  const value: Record<string, unknown> = { order_id: 42 };
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

export function resetApprovalDouble(): void {
  callbackCalls.length = 0;
  callbackOutcome = () => Promise.resolve(decided());
  approvalDouble.contextTransform = undefined;
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockResolvedValue(respond(201));
}

export function restoreApprovalDouble(): void {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
  jest.useRealTimers();
  jest.restoreAllMocks();
}
