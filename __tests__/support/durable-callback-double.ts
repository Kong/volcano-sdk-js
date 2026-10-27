import { expect, jest } from '@jest/globals';
import { durable } from '../../src/durable.ts';
import type { CallbackSubmitter, DurableContext, DurableHandler, DurableLog } from '../../src/durable-types.ts';
import { mockDurableLog } from './durable-log.ts';

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
  waitForCallback?: (name: unknown, submitter: Submitter, config: Record<string, unknown>) => Promise<unknown>;
  executionContext?: { durableExecutionArn?: unknown };
  peekStepId?: () => string;
  _executionContext?: { getStepData(stepId: string): unknown };
}

// The runtime's private step cursor and checkpoint, which a replayed
// registration reads to name the callback's operation.
export interface RuntimeSteps {
  next?: string;
  checkpointed?: string[];
}

export const EXECUTION_ARN =
  'arn:aws:lambda:us-east-1:123456789012:function:payments:$LATEST/durable-execution/exec-1/abc';
const API_URL = 'https://api.test.com';
export const TOKEN = 'vcb_Zm9yIHRoZSBwYXltZW50IHdvcmtmbG93IHRvIGNvbXBsZXRl';

export const callbackCalls: CallbackCall[] = [];
export const submitted: string[] = [];

// How the double's runtime behaves; each test starts from resetCallbackDouble.
export const callbackDouble: {
  outcome: () => Promise<unknown>;
  hasCallbacks: boolean;
  steps: RuntimeSteps | undefined;
} = {
  outcome: () => Promise.resolve(JSON.stringify({ charge: 'ch_1042' })),
  hasCallbacks: true,
  steps: undefined,
};

export const record: CallbackSubmitter = (token) => {
  submitted.push(token);
};

function runtimeInternals({ next, checkpointed }: RuntimeSteps): Partial<FakeContext> {
  return {
    // The runtime's takes no arguments.
    ...(next === undefined ? {} : { peekStepId: (...args: unknown[]) => (args.length === 0 ? next : 'unexpected') }),
    ...(checkpointed === undefined
      ? {}
      : {
          _executionContext: {
            getStepData: (stepId: string) => (checkpointed.includes(stepId) ? { Id: stepId } : undefined),
          },
        }),
  };
}

function mockContext(executionContext?: FakeContext['executionContext']): FakeContext {
  const logger = mockDurableLog();
  const context: FakeContext = {
    logger,
    configureLogger: jest.fn<FakeContext['configureLogger']>(),
    step: jest.fn(),
    wait: () => Promise.resolve(),
    runInChildContext: () => Promise.resolve(),
    waitForCondition: () => Promise.resolve(),
    map: () => Promise.resolve(),
    parallel: () => Promise.resolve(),
    ...(executionContext === undefined ? {} : { executionContext }),
    ...runtimeInternals(callbackDouble.steps ?? {}),
  };
  if (callbackDouble.hasCallbacks) {
    context.waitForCallback = async (name, submitter, config) => {
      callbackCalls.push({ name, config });
      await submitter(`cb-${String(callbackCalls.length)}`);
      return callbackDouble.outcome();
    };
  }
  return context;
}

// The module a test file installs with jest.mock in place of the runtime.
export function mockCallbackRuntime(): Record<string, unknown> {
  return {
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) =>
      (event: { input: unknown; DurableExecutionArn: unknown }) =>
        handler(event.input, mockContext({ durableExecutionArn: event.DurableExecutionArn })),
    StepSemantics: { AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY' },
    createRetryStrategy: jest.fn(),
    createWaitStrategy: jest.fn(),
  };
}

export function run(handler: DurableHandler, event?: Record<string, unknown>): Promise<unknown> {
  return durable(handler)({ input: {}, ...(event ?? { DurableExecutionArn: EXECUTION_ARN }) }, {});
}

export const fetchMock = (): jest.MockedFunction<typeof fetch> => jest.mocked(globalThis.fetch);

export const failureOf = (pending: Promise<unknown>): Promise<unknown> =>
  pending.then(
    () => {
      throw new Error('Expected the call to fail');
    },
    (error: unknown) => error,
  );

export function onlyCallbackCall(): CallbackCall {
  expect(callbackCalls).toHaveLength(1);
  const [call] = callbackCalls;
  if (call === undefined) {
    throw new Error('Missing waitForCallback call');
  }
  return call;
}

export function bodyAt(index: number): unknown {
  const body = fetchMock().mock.calls[index]?.[1]?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Expected a JSON body');
  }
  const value: unknown = JSON.parse(body);
  return value;
}

export function noRetry(config: Record<string, unknown>): void {
  const retryStrategy = config['retryStrategy'];
  if (typeof retryStrategy !== 'function') {
    throw new TypeError('Expected a retry strategy');
  }
  expect(Reflect.apply(retryStrategy, undefined, [new Error('refused'), 1])).toEqual({
    shouldRetry: false,
  });
}

export function runtimeError(errorType: string, message: string, errorData?: string): Error {
  return Object.assign(new Error(message), { errorType, errorData });
}

export const timedOut = (): Error => runtimeError('CallbackTimeoutError', 'Callback timed out');

// Waits for the payment, handing the token to `submitter`.
export const awaitPayment =
  (submitter: CallbackSubmitter, options?: Record<string, unknown>): DurableHandler =>
  (_input, ctx) =>
    ctx.waitForCallback('payment', submitter, options);

// Calls the way JavaScript can, past the TypeScript signature.
export const callWith =
  (call: (ctx: DurableContext) => unknown): DurableHandler =>
  (_input, ctx) => {
    const result = call(ctx);
    return result instanceof Promise ? result : Promise.reject(new Error('Expected a promise'));
  };

export function resetCallbackDouble(): void {
  callbackCalls.length = 0;
  submitted.length = 0;
  callbackDouble.hasCallbacks = true;
  callbackDouble.steps = undefined;
  callbackDouble.outcome = () => Promise.resolve(JSON.stringify({ charge: 'ch_1042' }));
  process.env['VOLCANO_PLATFORM_API_URL'] = API_URL;
  fetchMock().mockImplementation(() =>
    Promise.resolve(Response.json({ token: TOKEN, expires_at: null }, { status: 201 })),
  );
}

export function restoreCallbackDouble(): void {
  Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
  jest.useRealTimers();
  jest.restoreAllMocks();
}
