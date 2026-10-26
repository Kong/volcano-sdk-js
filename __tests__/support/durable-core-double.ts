import { jest } from '@jest/globals';
import { durable } from '../../src/durable.ts';
import type { EngineBatch } from '../../src/durable-batch-result.ts';
import type { BatchResult, DurableContext, DurableHandler, DurableLog } from '../../src/durable-types.ts';

// The durable runtime is an optional peer dependency, so the durable-core tests
// stand a recording double in its place and assert on what the facade hands it. That is the contract worth pinning here: the
// translation from the Volcano authoring surface to the engine's own — argument
// order, duration form, config field names.
//
// A durable function written against this module is exercised for real by the
// hosting cloud E2E suite, which deploys one and runs an execution.

interface EngineCall {
  op: string;
  name?: unknown;
  config?: Record<string, unknown>;
  duration?: unknown;
  items?: unknown[];
  branches?: unknown[];
}

interface EngineBatchItem {
  index: number;
  status: 'SUCCEEDED' | 'FAILED' | 'STARTED';
  result?: unknown;
  error?: unknown;
}

interface EngineScope {
  logger: DurableLog;
  attempt: number;
}

type EngineBranch =
  | ((context: RecordingContext) => Promise<unknown>)
  | { name: unknown; func: (context: RecordingContext) => Promise<unknown> };

interface RecordingContext {
  logger: DurableLog;
  configureLogger: ReturnType<typeof jest.fn<(config: unknown) => void>>;
  step(name: unknown, fn: (scope: EngineScope) => Promise<unknown>, config: Record<string, unknown>): Promise<unknown>;
  wait(name: unknown, duration?: unknown): Promise<void>;
  runInChildContext(name: unknown, fn: (context: RecordingContext) => Promise<unknown>): Promise<unknown>;
  waitForCondition(
    name: unknown,
    checkFn: (state: unknown, scope: EngineScope) => Promise<unknown>,
    config: { initialState: unknown },
  ): Promise<unknown>;
  map(
    name: unknown,
    items: unknown[],
    mapFn: (context: RecordingContext, item: unknown, index: number, items: unknown[]) => Promise<unknown>,
    config: Record<string, unknown>,
  ): Promise<EngineBatch<unknown>>;
  parallel(name: unknown, branches: EngineBranch[], config: Record<string, unknown>): Promise<EngineBatch<unknown>>;
}

const engineCalls: EngineCall[] = [];

export const fakeStepSemantics = {
  AtMostOncePerRetry: 'AT_MOST_ONCE_PER_RETRY',
  AtLeastOncePerRetry: 'AT_LEAST_ONCE_PER_RETRY',
};

// The engine's own batch result: methods and upper-case statuses, which the
// facade flattens.
// The engine settles every item and reports failures in the batch rather than
// rejecting, so the double does the same: a branch that throws is a failed item.
const fakeBatchItem = (settled: PromiseSettledResult<unknown>, index: number): EngineBatchItem =>
  settled.status === 'fulfilled'
    ? { index, status: 'SUCCEEDED', result: settled.value }
    : { index, status: 'FAILED', error: settled.reason };

interface FakeBatch extends EngineBatch<unknown> {
  startedCount: number;
  totalCount: number;
}

export const fakeBatch = (items: EngineBatchItem[], completionReason = 'ALL_COMPLETED'): FakeBatch => ({
  all: items,
  getResults: () => items.filter((item) => item.status === 'SUCCEEDED').map((item) => item.result),
  getErrors: () => items.filter((item) => item.error !== undefined).map((item) => item.error),
  successCount: items.filter((item) => item.status === 'SUCCEEDED').length,
  failureCount: items.filter((item) => item.status === 'FAILED').length,
  startedCount: items.filter((item) => item.status === 'STARTED').length,
  totalCount: items.length,
  completionReason,
  throwIfError() {
    engineCalls.push({ op: 'throwIfError' });
  },
});

// A batch the test hands back verbatim, for the shapes the double cannot reach
// by running mappers: an early completion with items still in flight, and the
// same batch as the engine rebuilds it on a replay.
let stagedBatch: EngineBatch<unknown> | null = null;
export const stageBatch = (batch: EngineBatch<unknown>): void => {
  stagedBatch = batch;
};
const takeStagedBatch = (): EngineBatch<unknown> | null => {
  const batch = stagedBatch;
  stagedBatch = null;
  return batch;
};

export const lastContext: { value?: RecordingContext } = {};

// What a test changes about the context the double hands the facade.
export const engineDouble: { contextTransform: ((context: RecordingContext) => unknown) | undefined } = {
  contextTransform: undefined,
};

const fakeContext = (): RecordingContext => {
  const context: RecordingContext = {
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
    configureLogger: jest.fn<(config: unknown) => void>(),

    step(name, fn, config) {
      engineCalls.push({ op: 'step', name, config });
      return Promise.resolve(fn({ logger: context.logger, attempt: 2 }));
    },

    wait(name, duration) {
      engineCalls.push({ op: 'wait', name, duration });
      return Promise.resolve();
    },

    runInChildContext(name, fn) {
      engineCalls.push({ op: 'child', name });
      return Promise.resolve(fn(context));
    },

    waitForCondition(name, checkFn, config) {
      engineCalls.push({ op: 'waitForCondition', name, config });
      return Promise.resolve(checkFn(config.initialState, { logger: context.logger, attempt: 1 }));
    },

    map(name, items, mapFn, config) {
      engineCalls.push({ op: 'map', name, items, config });
      const staged = takeStagedBatch();
      if (staged !== null) {
        return Promise.resolve(staged);
      }
      return Promise.allSettled(items.map((item, index) => mapFn(context, item, index, items))).then((settled) =>
        fakeBatch(settled.map((item, index) => fakeBatchItem(item, index))),
      );
    },

    parallel(name, branches, config) {
      engineCalls.push({ op: 'parallel', name, branches, config });
      return Promise.allSettled(
        branches.map((branch) => (typeof branch === 'function' ? branch(context) : branch.func(context))),
      ).then((settled) => fakeBatch(settled.map((item, index) => fakeBatchItem(item, index))));
    },
  };
  lastContext.value = context;
  return context;
};

// The engine merges a strategy config over its own defaults with a spread, so a
// key present with an undefined value replaces the default instead of falling
// back to it — and an absent delay is then read for a unit it does not have,
// which throws on the first failure. The double holds the facade to that: a
// config carrying a key the caller never set fails here.
const engineStrategyConfig = (op: string, config: Record<string, unknown>): Record<string, unknown> => {
  const unset = Object.keys(config).filter((key) => config[key] === undefined);
  if (unset.length > 0) {
    throw new TypeError(`${op} was given undefined ${unset.join(', ')}, which clobbers a default`);
  }
  return config;
};

const neverRetry = (): { shouldRetry: false } => ({ shouldRetry: false });
const neverContinue = (): { shouldContinue: false } => ({ shouldContinue: false });

// The module a test file installs with jest.mock in place of the runtime.
export function mockDurableRuntime(): Record<string, unknown> {
  return {
    withDurableExecution:
      (handler: (input: unknown, context: unknown) => Promise<unknown>) => (event: { input: unknown }) => {
        const context = fakeContext();
        return handler(event.input, engineDouble.contextTransform?.(context) ?? context);
      },
    StepSemantics: fakeStepSemantics,
    createRetryStrategy(config: Record<string, unknown>) {
      engineCalls.push({
        op: 'createRetryStrategy',
        config: engineStrategyConfig('retry', config),
      });
      return neverRetry;
    },
    createWaitStrategy(config: Record<string, unknown>) {
      engineCalls.push({ op: 'createWaitStrategy', config: engineStrategyConfig('wait', config) });
      return neverContinue;
    },
  };
}

export function resetEngineDouble(): void {
  engineCalls.length = 0;
  stagedBatch = null;
  engineDouble.contextTransform = undefined;
}

export async function run<Input = Record<string, never>, Result = unknown>(
  handler: DurableHandler<Input, Result>,
  input?: Input,
): Promise<Result> {
  const completion: { result?: { value: Result } } = {};
  await durable(async (value: Input, context: DurableContext) => {
    const result = await handler(value, context);
    completion.result = { value: result };
    return result;
  })({ input: input ?? {} }, {});
  if (completion.result === undefined) {
    throw new Error('Durable handler did not complete');
  }
  return completion.result.value;
}

export const callsOf = (op: string): EngineCall[] => engineCalls.filter((call) => call.op === op);

export function firstCall(op: string): EngineCall {
  const call = callsOf(op)[0];
  if (call === undefined) {
    throw new Error(`Missing ${op} engine call`);
  }
  return call;
}

export function configOf(op: string): Record<string, unknown> {
  const config = firstCall(op).config;
  if (config === undefined) {
    throw new Error(`Missing ${op} engine config`);
  }
  return config;
}

export function required<Value>(value: Value | null | undefined, name: string): Value {
  if (value === null || value === undefined) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function invoke(value: unknown, args: unknown[]): unknown {
  if (typeof value !== 'function') {
    throw new TypeError('Expected engine callback');
  }
  const result: unknown = Reflect.apply(value, undefined, args);
  return result;
}

export const retryOnce = (): { shouldRetry: true; delay: { seconds: 1 } } => ({
  shouldRetry: true,
  delay: { seconds: 1 },
});

export const shipped = (batch: EngineBatch<unknown>): Promise<BatchResult<string>> => {
  stageBatch(batch);
  return run((_input, ctx) => ctx.map('ship', ['a', 'b', 'c'], (item) => Promise.resolve(item), { minSucceeded: 2 }));
};
