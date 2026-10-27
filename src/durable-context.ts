import { waitForApproval } from './durable-approval.ts';
import { batchResult } from './durable-batch-result.ts';
import { waitForCallback } from './durable-callback-token.ts';
import { batchConfig, conditionConfig, stepConfig } from './durable-config.ts';
import { waitDuration } from './durable-duration.ts';
import type { loadEngine } from './durable-engine.ts';
import { type EngineContext, type EngineScope, engineContext } from './durable-engine-context.ts';
import { messagePublisher, type Publish, waitForMessage } from './durable-message.ts';
import { parallelBranches } from './durable-parallel-branches.ts';
import type {
  BatchOptions,
  CallbackSubmitter,
  DurableContext,
  DurableDuration,
  DurableStepScope,
  ParallelBranch,
  StepOptions,
  WaitForApprovalOptions,
  WaitForCallbackOptions,
  WaitForMessageOptions,
  WaitUntilOptions,
} from './durable-types.ts';

type Engine = Awaited<ReturnType<typeof loadEngine>>;
type Operation<Result> = (context: DurableStepScope) => Promise<Result>;
type ChildOperation<Result> = (context: DurableContext) => Promise<Result>;
type Check<State> = (state: State, scope: DurableStepScope) => Promise<State>;
type Mapper<Item, Result> = (item: Item, context: DurableContext, index: number) => Promise<Result>;
type Branch<Result> = ((context: DurableContext) => Promise<Result>) | ParallelBranch<Result>;

function optionEntries(value: unknown): Record<string, unknown> {
  return Array.isArray(value) ? {} : Object.assign({}, value);
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

/** Expose only Volcano's supported checkpoint operations to a handler. */
export function durableContext(context: EngineContext, engine: Engine, ref: string | undefined): DurableContext {
  const publisher = messagePublisher(context, ref);
  return {
    log: context.logger,

    step<Result>(
      nameOrRun: string | Operation<Result>,
      runOrOptions?: Operation<Result> | StepOptions,
      options?: StepOptions,
    ): Promise<Result> {
      const call = namedFunction(nameOrRun, runOrOptions, options, 'step');
      return context.step(call.name, (scope) => call.run(stepScope(scope)), stepConfig(call.options, engine));
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

    child<Result>(nameOrRun: string | ChildOperation<Result>, maybeRun?: ChildOperation<Result>): Promise<Result> {
      const name = typeof nameOrRun === 'string' ? nameOrRun : undefined;
      const run = typeof nameOrRun === 'string' ? maybeRun : nameOrRun;
      if (typeof run !== 'function') {
        throw new TypeError('ctx.child() requires a function to run');
      }
      return context.runInChildContext(name, (child) => run(durableContext(child, engine, ref)));
    },

    ...callbackOperations(context, ref, publisher),
    ...conditionOperations(context, engine),
    ...batchOperations(context, engine, ref),
  };
}

function callbackOperations(
  context: EngineContext,
  ref: string | undefined,
  publisher: Publish,
): Pick<DurableContext, 'waitForApproval' | 'waitForMessage' | 'waitForCallback' | 'publish'> {
  return {
    waitForApproval(name: string, options: WaitForApprovalOptions) {
      return waitForApproval(context, ref, name, options);
    },

    waitForMessage(name: string, options?: WaitForMessageOptions) {
      return waitForMessage(context, ref, name, options);
    },

    waitForCallback(name: string, submitter: CallbackSubmitter, options?: WaitForCallbackOptions) {
      return waitForCallback(context, ref, name, submitter, options);
    },

    publish(name: string, data?: unknown) {
      return publisher(name, data);
    },
  };
}

function conditionOperations(context: EngineContext, engine: Engine): Pick<DurableContext, 'waitUntil'> {
  return {
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
  };
}

function batchOperations(
  context: EngineContext,
  engine: Engine,
  ref: string | undefined,
): Pick<DurableContext, 'map' | 'parallel'> {
  return {
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
        .map<Item, Result>(
          call.name,
          call.items,
          (child, item, index) => run(item, durableContext(child, engine, ref), index),
          batchConfig(call.options),
        )
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
          parallelBranches(branches, (child) => durableContext(engineContext(child), engine, ref)),
          batchConfig(config),
        )
        .then(batchResult);
    },
  };
}

function stepScope(scope: EngineScope): DurableStepScope {
  return { log: scope.logger, attempt: scope.attempt };
}
