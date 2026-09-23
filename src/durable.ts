import { batchResult, type EngineBatch } from './durable-batch-result.ts';
import { batchConfig, conditionConfig, stepConfig } from './durable-config.ts';
import { waitDuration } from './durable-duration.ts';
import { loadEngine } from './durable-engine.ts';
import { parallelBranches } from './durable-parallel-branches.ts';
import type {
  BatchOptions,
  DurableContext,
  DurableDuration,
  DurableHandler,
  DurableLog,
  DurableOptions,
  DurableStepScope,
  ParallelBranch,
  StepOptions,
  WaitUntilOptions,
} from './durable-types.ts';

type Engine = Awaited<ReturnType<typeof loadEngine>>;
type Operation<Result> = (context: DurableStepScope) => Promise<Result>;
type ChildOperation<Result> = (context: DurableContext) => Promise<Result>;
type Check<State> = (state: State, scope: DurableStepScope) => Promise<State>;
type Mapper<Item, Result> = (item: Item, context: DurableContext, index: number) => Promise<Result>;
type Branch<Result> = ((context: DurableContext) => Promise<Result>) | ParallelBranch<Result>;

interface EngineScope {
  logger: DurableLog;
  attempt: number;
}

interface EngineContext {
  logger: DurableLog;
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
  return (
    isRecord(value) &&
    ['info', 'warn', 'error', 'debug'].every((method) => typeof value[method] === 'function')
  );
}

/** The optional engine's callbacks are checked before the authoring facade uses them. */
function isEngineContext(value: unknown): value is EngineContext {
  if (!isRecord(value)) {
    return false;
  }
  const methods = [
    'configureLogger',
    'step',
    'wait',
    'runInChildContext',
    'waitForCondition',
    'map',
    'parallel',
  ];
  return (
    isLogger(value['logger']) && methods.every((method) => typeof value[method] === 'function')
  );
}

function engineContext(value: unknown): EngineContext {
  if (!isEngineContext(value)) {
    throw new TypeError('The durable runtime did not provide a durable context');
  }
  return value;
}

function optionEntries(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? { ...value } : {};
}

function namedFunction<Run extends (...args: never[]) => unknown, Options extends object>(
  nameOrRun: string | Run,
  runOrOptions: Run | Options | undefined,
  options: Options | undefined,
  operation: string,
): { name: string | undefined; run: Run; options: Record<string, unknown> } {
  const named = typeof nameOrRun === 'string';
  const candidate = named ? runOrOptions : nameOrRun;
  if (typeof candidate !== 'function') {
    throw new TypeError(`ctx.${operation}() requires a function to run`);
  }
  return {
    name: named ? nameOrRun : undefined,
    run: candidate,
    options: optionEntries(named ? options : runOrOptions),
  };
}

function mapParts<Item, Result>(
  nameOrItems: string | Item[],
  itemsOrRun: Item[] | Mapper<Item, Result>,
  runOrOptions: Mapper<Item, Result> | BatchOptions | undefined,
  options: BatchOptions | undefined,
): {
  name: string | undefined;
  items: Item[] | Mapper<Item, Result>;
  run: Item[] | Mapper<Item, Result> | BatchOptions | undefined;
  options: Record<string, unknown>;
} {
  if (typeof nameOrItems === 'string') {
    return {
      name: nameOrItems,
      items: itemsOrRun,
      run: runOrOptions,
      options: optionEntries(options),
    };
  }
  return {
    name: undefined,
    items: nameOrItems,
    run: itemsOrRun,
    options: optionEntries(runOrOptions),
  };
}

/** Wrap a handler without loading the optional peer until the first invocation. */
export function durable<Input = unknown, Result = unknown>(
  handler: DurableHandler<Input, Result>,
  options: DurableOptions = {},
): (event: unknown, functionContext: unknown) => Promise<unknown> {
  if (typeof handler !== 'function') {
    throw new TypeError('durable(handler) requires a handler function');
  }
  let wrapped: ((event: unknown, functionContext: unknown) => Promise<unknown>) | undefined;
  return async (event: unknown, functionContext: unknown): Promise<unknown> => {
    if (wrapped === undefined) {
      const engine = await loadEngine();
      wrapped = engine.withDurableExecution((input: Input, value: unknown): Promise<Result> => {
        const context = engineContext(value);
        if (options.logger !== undefined) {
          context.configureLogger({ customLogger: options.logger });
        }
        return handler(input, durableContext(context, engine));
      });
    }
    return wrapped(event, functionContext);
  };
}

/** Expose only Volcano's supported checkpoint operations to a handler. */
function durableContext(context: EngineContext, engine: Engine): DurableContext {
  return {
    log: context.logger,

    step<Result>(
      nameOrRun: string | Operation<Result>,
      runOrOptions?: Operation<Result> | StepOptions,
      options?: StepOptions,
    ): Promise<Result> {
      const call = namedFunction(nameOrRun, runOrOptions, options, 'step');
      return context.step(
        call.name,
        (scope) => call.run(stepScope(scope)),
        stepConfig(call.options, engine),
      );
    },

    wait(nameOrDuration: string | DurableDuration, duration?: DurableDuration): Promise<void> {
      if (duration === undefined) {
        return context.wait(waitDuration(nameOrDuration));
      }
      if (typeof nameOrDuration !== 'string') {
        throw new TypeError('ctx.wait() takes a name and a duration, or a duration alone');
      }
      return context.wait(nameOrDuration, waitDuration(duration));
    },

    child<Result>(
      nameOrRun: string | ChildOperation<Result>,
      maybeRun?: ChildOperation<Result>,
    ): Promise<Result> {
      const name = typeof nameOrRun === 'string' ? nameOrRun : undefined;
      const run = typeof nameOrRun === 'string' ? maybeRun : nameOrRun;
      if (typeof run !== 'function') {
        throw new TypeError('ctx.child() requires a function to run');
      }
      return context.runInChildContext(name, (child) => run(durableContext(child, engine)));
    },

    waitUntil<State>(
      nameOrCheck: string | Check<State>,
      checkOrOptions: Check<State> | WaitUntilOptions<State>,
      options?: WaitUntilOptions<State>,
    ): Promise<State> {
      const call = namedFunction(nameOrCheck, checkOrOptions, options, 'waitUntil');
      return context.waitForCondition<State>(
        call.name,
        (state, scope) => call.run(state, stepScope(scope)),
        conditionConfig(call.options, engine),
      );
    },

    map<Item, Result>(
      nameOrItems: string | Item[],
      itemsOrRun: Item[] | Mapper<Item, Result>,
      runOrOptions?: Mapper<Item, Result> | BatchOptions,
      options?: BatchOptions,
    ): Promise<ReturnType<typeof batchResult<Result>>> {
      const call = mapParts(nameOrItems, itemsOrRun, runOrOptions, options);
      if (typeof call.run !== 'function') {
        throw new TypeError('ctx.map() requires a function to run');
      }
      if (!Array.isArray(call.items)) {
        throw new TypeError('ctx.map() requires an array of items');
      }
      const run = call.run;
      return context
        .map<
          Item,
          Result
        >(call.name, call.items, (child, item, index) => run(item, durableContext(child, engine), index), batchConfig(call.options))
        .then(batchResult);
    },

    parallel<Result>(
      nameOrBranches: string | Branch<Result>[],
      branchesOrOptions?: Branch<Result>[] | BatchOptions,
      options?: BatchOptions,
    ): Promise<ReturnType<typeof batchResult<Result>>> {
      const named = typeof nameOrBranches === 'string';
      const name = named ? nameOrBranches : undefined;
      const branches = named ? branchesOrOptions : nameOrBranches;
      const config = optionEntries(named ? options : branchesOrOptions);
      return context
        .parallel<Result>(
          name,
          parallelBranches(branches, (child) => durableContext(engineContext(child), engine)),
          batchConfig(config),
        )
        .then(batchResult);
    },
  };
}

function stepScope(scope: EngineScope): DurableStepScope {
  return { log: scope.logger, attempt: scope.attempt };
}

export { DurableRuntimeMissingError } from './durable-runtime-error.ts';
export type {
  BatchCompletionReason,
  BatchFailure,
  BatchItem,
  BatchOptions,
  BatchResult,
  DurableContext,
  DurableDuration,
  DurableHandler,
  DurableLog,
  DurableOptions,
  DurableStepScope,
  ParallelBranch,
  Retry,
  RetryDecision,
  RetryOptions,
  StepOptions,
  WaitUntilOptions,
} from './durable-types.ts';
