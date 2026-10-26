import type { EngineBatch } from './durable-batch-result.ts';
import type { CallbackContext } from './durable-callback.ts';
import type { parallelBranches } from './durable-parallel-branches.ts';
import type { DurableLog } from './durable-types.ts';

export interface EngineScope {
  logger: DurableLog;
  attempt: number;
}

export interface EngineContext extends CallbackContext {
  logger: DurableLog;
  executionContext?: { durableExecutionArn?: unknown };
  configureLogger(config: { customLogger: DurableLog }): void;
  step<Result>(
    name: string | undefined,
    run: (scope: EngineScope) => Promise<Result>,
    config: Record<string, unknown>,
  ): Promise<Result>;
  wait(nameOrDuration: string | object, duration?: object): Promise<void>;
  runInChildContext<Result>(
    name: string | undefined,
    run: (context: EngineContext) => Promise<Result>,
  ): Promise<Result>;
  waitForCondition<State>(
    name: string | undefined,
    check: (state: State, context: EngineScope) => Promise<State>,
    config: { initialState: unknown; waitStrategy: unknown },
  ): Promise<State>;
  map<Item, Result>(
    name: string | undefined,
    items: Item[],
    run: (context: EngineContext, item: Item, index: number) => Promise<Result>,
    config: Record<string, unknown>,
  ): Promise<EngineBatch<Result>>;
  parallel<Result>(
    name: string | undefined,
    branches: ReturnType<typeof parallelBranches>,
    config: Record<string, unknown>,
  ): Promise<EngineBatch<Result>>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isLogger(value: unknown): value is DurableLog {
  return isRecord(value) && ['info', 'warn', 'error', 'debug'].every((method) => typeof value[method] === 'function');
}

/** The optional engine's callbacks are checked before the authoring facade uses them. */
function isEngineContext(value: unknown): value is EngineContext {
  if (!isRecord(value)) {
    return false;
  }
  const methods = ['configureLogger', 'step', 'wait', 'runInChildContext', 'waitForCondition', 'map', 'parallel'];
  return isLogger(value['logger']) && methods.every((method) => typeof value[method] === 'function');
}

export function engineContext(value: unknown): EngineContext {
  if (!isEngineContext(value)) {
    throw new TypeError('The durable runtime did not provide a durable context');
  }
  return value;
}
