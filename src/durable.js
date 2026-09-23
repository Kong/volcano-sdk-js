import { mapArgs, namedArgs, requireFunction } from './durable-arguments.ts';
import { batchResult } from './durable-batch-result.ts';
import { batchConfig, conditionConfig, stepConfig } from './durable-config.ts';
import { waitDuration } from './durable-duration.ts';
import { DurableRuntimeMissingError } from './durable-runtime-error.ts';

/**
 * Volcano SDK - Durable function authoring API
 *
 * A durable function checkpoints its progress as it runs, so one execution can
 * span many invocations and run for hours. This module is what the function
 * itself is written against; starting an execution and reading its result are
 * done through the API, the CLI, or the dashboard.
 *
 * @example
 * ```javascript
 * const { durable } = require('@volcano.dev/sdk/durable');
 *
 * exports.handler = durable(async (input, ctx) => {
 *   const charge = await ctx.step('charge', () => chargeCard(input.order_id));
 *   await ctx.wait('settle', '30s');
 *   const shipment = await ctx.step('ship', () => ship(charge.id));
 *   return { charged: charge.id, shipment };
 * });
 * ```
 *
 * Every context operation is checkpointed: what finished is recorded, and a
 * resumed execution replays those recorded outcomes instead of doing the work
 * again. That is also the one rule the handler has to respect — the code
 * between the operations runs again on every resume, so it has to reach the
 * same operations in the same order.
 */

/**
 * The runtime that does the checkpointing is installed by Volcano when it builds
 * a function deployed as durable, so nothing here appears in a function's own
 * dependencies. It is declared as an optional peer, which is what lets the SDK
 * resolve it under a strict node_modules layout, and loaded on the first
 * invocation rather than imported: the SDK also runs in browsers and in standard
 * functions, where a static import would break the bundle, and its absence is
 * worth a real error message instead of a module-resolution failure.
 */
const runtimeSpecifier = '@aws/durable-execution-sdk-js';

let enginePromise = null;

function loadEngine() {
  enginePromise ??= resolveEngine();
  return enginePromise;
}

async function resolveEngine() {
  try {
    // The runtime ships both module formats, so the loaded namespace is either
    // its own exports or, for the CommonJS build, those exports under `default`.
    const loaded = await import(runtimeSpecifier);
    return loaded.withDurableExecution ? loaded : loaded.default;
  } catch (cause) {
    throw new DurableRuntimeMissingError(cause);
  }
}

/**
 * Wraps a handler so Volcano runs it as a durable execution.
 *
 * The handler is called with the execution's input and a durable context, in
 * that order, matching a standard function's `(event, context)`.
 *
 * @template TInput, TResult
 * @param {(input: TInput, ctx: object) => Promise<TResult>} handler
 * @param {{ logger?: object }} [options]
 * @returns {(event: unknown, functionContext: unknown) => Promise<unknown>}
 */
function durable(handler, options = {}) {
  if (typeof handler !== 'function') {
    throw new TypeError('durable(handler) requires a handler function');
  }

  let wrapped = null;

  return async (event, functionContext) => {
    if (!wrapped) {
      const engine = await loadEngine();
      wrapped = engine.withDurableExecution((input, context) => {
        if (options.logger) {
          context.configureLogger({ customLogger: options.logger });
        }
        return handler(input, durableContext(context, engine));
      });
    }
    return wrapped(event, functionContext);
  };
}

/**
 * durableContext is the reason this module is a facade rather than a re-export.
 * It keeps the authoring surface to the operations Volcano supports, in
 * Volcano's vocabulary, and lets durations be written as `'30s'` rather than
 * `{ seconds: 30 }`.
 *
 * Callbacks are the deliberate omission. The engine can suspend on one, but
 * completing it is an AWS API call, and nothing in Volcano — not the function's
 * own role, not the API — can make it. Wait on your own state with
 * `ctx.waitUntil` instead.
 */
function durableContext(context, engine) {
  return {
    log: context.logger,

    step(name, fn, options) {
      const [stepName, stepFn, stepOptions] = namedArgs(name, fn, options);
      requireFunction(stepFn, 'step');
      return context.step(
        stepName,
        (stepContext) => stepFn(stepScope(stepContext)),
        stepConfig(stepOptions, engine),
      );
    },

    // One argument is always the duration: a name and a duration are both
    // strings, so `wait('30s')` would otherwise be ambiguous.
    wait(name, duration) {
      if (duration === undefined) {
        return context.wait(waitDuration(name));
      }
      // The engine decides which argument is which by testing the first for a
      // string, so anything else here is read as the duration and fails on a
      // shape it never had.
      if (typeof name !== 'string') {
        throw new TypeError('ctx.wait() takes a name and a duration, or a duration alone');
      }
      return context.wait(name, waitDuration(duration));
    },

    child(name, fn) {
      const [childName, childFn] = namedArgs(name, fn);
      requireFunction(childFn, 'child');
      return context.runInChildContext(childName, (childContext) =>
        childFn(durableContext(childContext, engine)),
      );
    },

    waitUntil(name, check, options) {
      const [conditionName, checkFn, conditionOptions] = namedArgs(name, check, options);
      requireFunction(checkFn, 'waitUntil');
      return context.waitForCondition(
        conditionName,
        (state, conditionContext) => checkFn(state, stepScope(conditionContext)),
        conditionConfig(conditionOptions, engine),
      );
    },

    map(name, items, fn, options) {
      const [mapName, mapItems, mapFn, mapOptions] = mapArgs(name, items, fn, options);
      requireFunction(mapFn, 'map');
      if (!Array.isArray(mapItems)) {
        throw new TypeError('ctx.map() requires an array of items');
      }
      return context
        .map(
          mapName,
          mapItems,
          (itemContext, item, index) => mapFn(item, durableContext(itemContext, engine), index),
          batchConfig(mapOptions),
        )
        .then(batchResult);
    },

    parallel(name, branches, options) {
      const [parallelName, branchList, parallelOptions] = namedArgs(name, branches, options);
      return context
        .parallel(parallelName, parallelBranches(branchList, engine), batchConfig(parallelOptions))
        .then(batchResult);
    },
  };
}

/**
 * A step gets a scope rather than a context on purpose: it is one atomic
 * operation and cannot contain durable operations of its own. Grouping belongs
 * in `ctx.child`, and handing something context-shaped to a step would invite
 * exactly the mistake the engine then rejects.
 */
function stepScope(scope) {
  return { log: scope.logger, attempt: scope.attempt };
}

function parallelBranches(branches, engine) {
  if (!Array.isArray(branches)) {
    throw new TypeError('ctx.parallel() requires an array of branches');
  }
  return branches.map((branch) => {
    if (typeof branch === 'function') {
      return (branchContext) => branch(durableContext(branchContext, engine));
    }
    if (typeof branch?.run !== 'function') {
      throw new TypeError('a parallel branch is a function, or { name, run }');
    }
    return {
      name: branch.name,
      func: (branchContext) => branch.run(durableContext(branchContext, engine)),
    };
  });
}

export { durable };
export { DurableRuntimeMissingError } from './durable-runtime-error.ts';
