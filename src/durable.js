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
 * The durable protocol is implemented by `@aws/durable-execution-sdk-js`, an
 * optional peer dependency a durable function installs alongside the SDK. It
 * is loaded on the first invocation rather than imported, for two reasons: the
 * SDK also runs in browsers and in standard functions, where a static import
 * would break the bundle or the install, and a missing engine is worth a real
 * error message instead of a module-resolution failure.
 */
const engineSpecifier = '@aws/durable-execution-sdk-js';

let enginePromise = null;

function loadEngine() {
  // The engine ships both formats, so the loaded namespace is either its own
  // exports or, for the CommonJS build, those exports under `default`.
  enginePromise ??= import(engineSpecifier).then(
    (loaded) => (loaded.withDurableExecution ? loaded : loaded.default),
    (cause) => {
      throw new DurableRuntimeMissingError(cause);
    },
  );
  return enginePromise;
}

/**
 * Thrown when the durable runtime is not installed, which is also what happens
 * when this handler is running somewhere durable execution does not exist: a
 * standard function, a browser, or a local script.
 */
class DurableRuntimeMissingError extends Error {
  constructor(cause) {
    super(
      `Durable functions need the durable runtime: install it with \`npm install ${engineSpecifier}\` ` +
        'and deploy the function as durable (`volcano cloud durable deploy`, or `kind: durable` in ' +
        'volcano-config.yaml). Durable execution is a cloud capability and does not run locally.',
    );
    this.name = 'DurableRuntimeMissingError';
    this.cause = cause;
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
        return context.wait(toDuration(name, 'wait'));
      }
      // The engine decides which argument is which by testing the first for a
      // string, so anything else here is read as the duration and fails on a
      // shape it never had.
      if (typeof name !== 'string') {
        throw new TypeError('ctx.wait() takes a name and a duration, or a duration alone');
      }
      return context.wait(name, toDuration(duration, 'wait'));
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

/**
 * The engine's batch result carries methods and enum-valued statuses. Reduce it
 * to plain data: it is usually inspected, logged, and returned from the
 * handler, and a result that survives `JSON.stringify` is worth more here than
 * the convenience methods.
 */
function batchResult(batch) {
  const items = batch.all.map((item) => ({
    index: item.index,
    status: item.status.toLowerCase(),
    result: item.result,
    error: item.error,
  }));

  return {
    items,
    results: batch.getResults(),
    errors: batch.getErrors(),
    succeeded: batch.successCount,
    failed: batch.failureCount,
    total: batch.totalCount,
    throwIfFailed: () => batch.throwIfError(),
  };
}

/**
 * Every operation takes both forms, named and unnamed. The name is what the
 * operation is recorded under, so it is worth encouraging, but a single obvious
 * operation reads better without one.
 */
function namedArgs(name, operand, options) {
  if (typeof name === 'string' || name === undefined) {
    return [name, operand, options ?? {}];
  }
  return [undefined, name, operand ?? {}];
}

function mapArgs(name, items, fn, options) {
  if (Array.isArray(name)) {
    return [undefined, name, items, fn ?? {}];
  }
  return [name, items, fn, options ?? {}];
}

function requireFunction(fn, operation) {
  if (typeof fn !== 'function') {
    throw new TypeError(`ctx.${operation}() requires a function to run`);
  }
}

function stepConfig(options, engine) {
  const config = {};
  if (options.atMostOnce) {
    config.semantics = engine.StepSemantics.AtMostOncePerRetry;
  }
  const retryStrategy = toRetryStrategy(options.retry, engine);
  if (retryStrategy) {
    config.retryStrategy = retryStrategy;
  }
  return config;
}

/**
 * A condition is a poll loop the platform runs: the check returns the state the
 * next check receives, `until` decides when that state is good enough, and the
 * interval between checks is suspended rather than slept through.
 */
function conditionConfig(options, engine) {
  if (typeof options.until !== 'function') {
    throw new TypeError('ctx.waitUntil() requires an `until` predicate in its options');
  }
  // The engine requires it — it is the value `until` is first asked about — and
  // refuses the wait with a message naming its own config shape rather than
  // this one. Caught here so the error names the option the caller writes, and
  // before the step is registered.
  if (options.initialState === undefined) {
    throw new TypeError(
      'ctx.waitUntil() requires an `initialState` in its options, which is what `until` is given until the state changes',
    );
  }
  // A condition is bounded by how many times it is checked, not by a deadline:
  // the platform holds the wait between checks and has no clock to compare
  // against when it resumes. Refused rather than ignored, because a wait that
  // was meant to give up after an hour would otherwise poll until the
  // execution's own ceiling.
  if (options.timeout !== undefined) {
    throw new TypeError(
      'ctx.waitUntil() has no `timeout`: bound the wait with `maxAttempts`, `interval` and `maxInterval`',
    );
  }

  return {
    initialState: options.initialState,
    waitStrategy: engine.createWaitStrategy(
      engineConfig({
        shouldContinuePolling: (state) => !options.until(state),
        maxAttempts: options.maxAttempts,
        initialDelay: optionalDuration(options.interval, 'interval'),
        maxDelay: optionalDuration(options.maxInterval, 'maxInterval'),
        backoffRate: options.backoffRate,
      }),
    ),
  };
}

function batchConfig(options = {}) {
  const config = {};
  if (options.concurrency !== undefined) {
    config.maxConcurrency = options.concurrency;
  }
  if (options.minSucceeded !== undefined) {
    config.completionConfig = { minSuccessful: options.minSucceeded };
  }
  return config;
}

/**
 * `retry: false` means "fail on the first error", which is not the same as
 * leaving retry unset: the engine retries by default, and a step that is not
 * safe to repeat wants the opposite.
 */
function toRetryStrategy(retry, engine) {
  if (retry === undefined || retry === null) {
    return null;
  }
  if (retry === false) {
    return () => ({ shouldRetry: false });
  }
  if (typeof retry === 'function') {
    return retry;
  }
  if (typeof retry !== 'object') {
    throw new TypeError('retry must be false, a function, or an options object');
  }

  return engine.createRetryStrategy(
    engineConfig({
      maxAttempts: retry.attempts,
      initialDelay: optionalDuration(retry.initialDelay, 'initialDelay'),
      maxDelay: optionalDuration(retry.maxDelay, 'maxDelay'),
      backoffRate: retry.backoffRate,
      retryableErrors: retry.retryOn,
      retryableErrorTypes: retry.retryOnTypes,
    }),
  );
}

/**
 * The engine merges a config over its defaults with a spread, so a key that is
 * present with an undefined value wins over the default instead of falling back
 * to it — and an absent delay is then read for a unit it does not have, which
 * throws. What the caller left out has to be left out here too.
 */
function engineConfig(entries) {
  return Object.fromEntries(Object.entries(entries).filter(([, value]) => value !== undefined));
}

// No `ms`: a durable duration is held by the platform between invocations, and
// the shape the engine takes carries whole seconds, so a millisecond value
// could only be rounded. It read as a supported unit and turned '400ms' into no
// wait at all, so it is refused instead — parseDurationText names the units it
// takes.
const durationUnits = {
  s: 1,
  m: 60,
  h: 3600,
  d: 86400,
};

const durationFields = ['days', 'hours', 'minutes', 'seconds'];

function optionalDuration(value, field) {
  return value === undefined ? undefined : toDuration(value, field);
}

/**
 * Durations are accepted as `'30s'`, `'2h'`, a number of seconds, or the
 * `{ hours, minutes, seconds }` form the engine wants, and always reach it as
 * the last one. A bare number is seconds: every durable duration is a wait the
 * platform holds, not a timer this process keeps, so milliseconds would be a
 * misleading unit to default to.
 *
 * A duration object is checked and forwarded as it stands rather than
 * recomposed, so `{ minutes: 90 }` stays what the caller wrote.
 */
function toDuration(value, field) {
  if (typeof value === 'object' && value !== null) {
    return checkedDurationObject(value, field);
  }
  return secondsToDuration(toSeconds(value, field));
}

/**
 * Unknown keys are the reason this exists: the object form reached the engine
 * unread, so `{ milliseconds: 500 }` was a duration of nothing and the engine
 * was left to fail on it somewhere further in.
 */
function checkedDurationObject(value, field) {
  const unknown = Object.keys(value).filter((key) => !durationFields.includes(key));
  if (unknown.length > 0) {
    throw new TypeError(
      `${field} duration takes ${durationFields.join(', ')} (got ${unknown.join(', ')})`,
    );
  }
  if (!durationFields.some((key) => value[key] !== undefined)) {
    throw new TypeError(`${field} duration needs one of ${durationFields.join(', ')}`);
  }
  for (const key of durationFields) {
    const part = value[key];
    if (part === undefined) {
      continue;
    }
    if (!Number.isInteger(part) || part < 0) {
      throw new TypeError(`${field} duration ${key} must be a non-negative whole number`);
    }
  }
  return value;
}

function toSeconds(value, field) {
  if (typeof value === 'number') {
    // Whole seconds, because that is all the engine's duration can carry: a
    // fraction would silently become a different wait than the one asked for.
    if (!Number.isInteger(value) || value < 0) {
      throw new TypeError(`${field} must be a non-negative whole number of seconds`);
    }
    return value;
  }
  if (typeof value === 'object' && value !== null) {
    checkedDurationObject(value, field);
    return (
      (value.days ?? 0) * 86400 +
      (value.hours ?? 0) * 3600 +
      (value.minutes ?? 0) * 60 +
      (value.seconds ?? 0)
    );
  }
  if (typeof value !== 'string') {
    throw new TypeError(
      `${field} must be a duration string, a number of seconds, or a duration object`,
    );
  }

  return parseDurationText(value.trim(), field);
}

const isDigit = (character) => character >= '0' && character <= '9';
const isLowerLetter = (character) => character >= 'a' && character <= 'z';

/**
 * Scanned by hand rather than matched: the grammar is a whole number, a unit,
 * repeated, and every pattern for that is either unreadable or the kind with
 * adjacent quantifiers that backtracks on a hostile string. Whole numbers only
 * — '90m' says what '1.5h' would.
 */
function parseDurationText(text, field) {
  let seconds = 0;
  let segments = 0;
  let at = 0;

  while (at < text.length) {
    if (text[at] === ' ') {
      at += 1;
      continue;
    }
    const numberEnd = scanWhile(text, at, isDigit);
    const unitEnd = scanWhile(text, numberEnd, isLowerLetter);
    const unit = text.slice(numberEnd, unitEnd);
    if (numberEnd === at || !Object.hasOwn(durationUnits, unit)) {
      break;
    }
    seconds += Number(text.slice(at, numberEnd)) * durationUnits[unit];
    segments += 1;
    at = unitEnd;
  }

  if (segments === 0 || at !== text.length) {
    throw new TypeError(
      `${field} must be a duration in whole seconds, such as '30s', '5m', '2h', '1d' or '1m30s' (got '${text}')`,
    );
  }
  return seconds;
}

function scanWhile(text, from, accept) {
  let at = from;
  while (at < text.length && accept(text[at])) {
    at += 1;
  }
  return at;
}

// Every caller has already established whole seconds, so nothing is rounded
// here: a rounding step is what made '400ms' a wait of zero.
function secondsToDuration(whole) {
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;

  if (days > 0) {
    return { days, hours, minutes, seconds };
  }
  if (hours > 0) {
    return { hours, minutes, seconds };
  }
  if (minutes > 0) {
    return { minutes, seconds };
  }
  return { seconds };
}

export { durable, DurableRuntimeMissingError };
