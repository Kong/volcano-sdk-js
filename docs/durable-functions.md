---
title: 'Durable functions'
description: 'Write functions that checkpoint their progress and resume where they left off, so one execution can run for hours across many invocations.'
---

A durable function records its progress as it runs. When it suspends on a wait, or an attempt crashes, it resumes from the last completed operation instead of starting over — so one execution can run for up to 24 hours, far longer than a single invocation is allowed.

`@volcano.dev/sdk/durable` is what you write that function against, and `volcano.durable.start` is how an app starts one. Reading a result is owner-scoped, so it happens elsewhere: the [CLI](/cli/durable-functions), the API, or the dashboard.

```javascript
    10|const { durable } = require('@volcano.dev/sdk/durable');

exports.handler = durable(async (input, ctx) => {
  const charge = await ctx.step('charge', () => chargeCard(input.order_id));

  await ctx.wait('settle', '30s');

  const shipment = await ctx.step('ship', () => ship(charge.id));

  return { charged: charge.id, shipment: shipment.tracking };
    20|});
```

## Install

```bash
npm install @volcano.dev/sdk @aws/durable-execution-sdk-js
```

The second package is the durable runtime the platform's checkpointing protocol
30|is implemented by. It is an optional peer dependency, so only functions that
need it install it, and it must be a dependency of the function you deploy.

Deploy the result as a durable function — `volcano cloud durable deploy`, or
`kind: durable` in `volcano-config.yaml`. A durable handler deployed as a
standard function fails on its first invocation, because nothing is there to
checkpoint it.

## How a durable function runs

    40|Your handler runs more than once. Each time it is invoked it starts from the

top, and every operation it already completed returns its recorded result
immediately instead of running again. When it reaches an operation that has not
run, that one executes for real.

That gives one rule to write by: **reach the same operations in the same order
every time.** The code between operations re-runs, so it has to be reproducible.

```javascript
// ❌ A random branch, so a resumed run can take the other path and the
//    recorded operations no longer line up.
    50|if (Math.random() > 0.5) {
  await ctx.step('a', chargeCard);
}

// ✅ Decide inside a step, so the decision is recorded with everything else.
const branch = await ctx.step('pick', async () => (Math.random() > 0.5 ? 'a' : 'b'));
if (branch === 'a') {
  await ctx.step('a', chargeCard);
}
```

    60|Anything non-deterministic belongs inside a step: `Date.now()`, `Math.random()`,

a UUID, a database read whose answer you branch on. Everything a step returns
must survive `JSON.stringify` — it is stored and handed back on replay.

A step is not retried once it has succeeded, but it is retried when it fails,
and an interrupted attempt can run it twice. Make the work idempotent, or read
[`atMostOnce`](#stepoptions).

## `durable(handler, options?)`

    70|Wraps a handler so Volcano runs it as a durable execution. The handler is

called with the execution's input and a durable context, matching a standard
function's `(event, context)`.

```javascript
exports.handler = durable(async (input, ctx) => {
  /* ... */
});
```

| Option | Type | Description |
80|| -------- | -------- | ----------------------------------------------- |
| `logger` | `object` | Replaces the default logger behind `ctx.log`. |

Whatever the handler returns becomes the execution's `result`, so it has to be
JSON-serializable. Throwing fails the execution and records the error.

## Durations

Anywhere a duration is taken, these forms all work:

    90|```javascript

await ctx.wait('30s'); // string, with ms/s/m/h/d units
await ctx.wait('1m30s'); // compound
await ctx.wait(90); // a number is seconds
await ctx.wait({ minutes: 1, seconds: 30 }); // explicit

````

A bare number is **seconds**, not milliseconds: a durable wait is time the
platform holds, not a timer your process keeps.

   100|## `ctx.step(name?, fn, options?)`

Runs one atomic operation and records its result.

```javascript
const user = await ctx.step('load-user', async () => db.users.find(input.user_id));

const charge = await ctx.step(
  'charge',
  async (scope) => {
   110|    scope.log.info('charging', { attempt: scope.attempt });
    return stripe.charges.create({ amount: user.total });
  },
  { retry: { attempts: 5, initialDelay: '2s' }, atMostOnce: true }
);
````

The function receives a scope, not a context: a step is a single operation and
cannot contain durable operations. Use [`ctx.child`](#ctxchildname-fn) to group
those.

| 120       |          | Scope                             | Type | Description |
| --------- | -------- | --------------------------------- | ---- | ----------- |
| `log`     | logger   | Logs, suppressed while replaying. |
| `attempt` | `number` | 1 on the first attempt.           |

The name is what the operation is recorded under, and is worth giving; omit it
for a single obvious step. Names are per context and do not have to be unique
across replays of a loop — `ctx.map` names its items for you.

### StepOptions

130|
| Option | Type | Description |
| ------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `retry` | `false` \| object \| function | `false` fails on the first error. An object configures backoff. A function decides per attempt. Unset means the default: 3 attempts with backoff. |
| `atMostOnce` | `boolean` | Checkpoint before running instead of after, so an attempt interrupted mid-flight is not repeated on replay. |

`atMostOnce` is per attempt, so pair it with `retry: false` for work that must
never run twice — a charge, an outbound payment, a one-shot email.

140|```javascript
await ctx.step('pay-out', () => bank.transfer(input), { atMostOnce: true, retry: false });

````

### Retry options

| Option          | Type                       | Default   | Description                                    |
| --------------- | -------------------------- | --------- | ---------------------------------------------- |
| `attempts`      | `number`                   | `3`       | Total attempts, including the first.           |
| `initialDelay`  | duration                   | `5s`      | Delay before the first retry.                  |
   150|| `maxDelay`      | duration                   | `5m`      | Ceiling for the backoff delay.                 |
| `backoffRate`   | `number`                   | `2`       | Multiplier applied after each attempt.         |
| `retryOn`       | `Array<string \| RegExp>`  | all       | Retry only errors whose message matches.       |
| `retryOnTypes`  | `Array<ErrorClass>`        | all       | Retry only errors of these types.              |

```javascript
await ctx.step('call-flaky-api', () => fetch(url), {
  retry: { attempts: 8, initialDelay: '5s', maxDelay: '2m', retryOn: [/timeout/i, '502'] },
});

   160|// Or decide yourself.
await ctx.step('call-flaky-api', () => fetch(url), {
  retry: (error, attempt) =>
    attempt < 4 && error.name === 'TimeoutError'
      ? { shouldRetry: true, delay: { seconds: attempt * 10 } }
      : { shouldRetry: false },
});
````

A step that exhausts its retries fails the execution, unless you catch it:
170|

```javascript
let receipt = null;
try {
  receipt = await ctx.step('receipt', () => sendReceipt(charge), { retry: { attempts: 2 } });
} catch (error) {
  ctx.log.warn('receipt failed, continuing', { message: error.message });
}
```

180|Catching is itself part of the replayed path, so keep the `catch` as
deterministic as the rest of the handler.

## `ctx.wait(name?, duration)`

Suspends the execution for a duration. The execution is not running while it
waits, and a wait can outlast any single invocation.

````javascript
await ctx.wait('cool-off', '15m');
await ctx.wait('1d'); // one argument is always the duration
   190|```

## `ctx.child(name?, fn)`

Groups operations under one recorded context. The function is given a durable
context of its own, so it can run steps, waits, and further children.

```javascript
const total = await ctx.child('fulfil', async (childCtx) => {
  const pack = await childCtx.step('pack', () => packOrder(input));
   200|  await childCtx.wait('label', '5s');
  return childCtx.step('label', () => printLabel(pack));
});
````

Reach for it to keep a long handler readable, to reuse a sub-workflow as a
function of its own, or to give `map` and `parallel` branches somewhere to run.

## `ctx.waitUntil(name?, check, options)`

210|Polls until a condition holds, suspending between checks rather than sleeping.
The check returns the state the next check receives, and `until` decides when to
stop.

```javascript
const approval = await ctx.waitUntil(
  'await-approval',
  async (state) => {
    const row = await db.approvals.find(input.order_id);
    return { ...state, status: row?.status ?? 'pending', checks: state.checks + 1 };
   220|  },
  {
    initialState: { status: 'pending', checks: 0 },
    until: (state) => state.status !== 'pending',
    interval: '30s',
    maxInterval: '10m',
    timeout: '12h',
  }
);
```

| 230            |          | Option | Type                                               | Default | Description |
| -------------- | -------- | ------ | -------------------------------------------------- | ------- | ----------- |
| `until`        | function | —      | Required. Stop once it returns true for the state. |
| `initialState` | any      | —      | The state the first check receives.                |
| `interval`     | duration | `5s`   | Delay before the second check.                     |
| `maxInterval`  | duration | `5m`   | Ceiling for the backoff delay between checks.      |
| `backoffRate`  | `number` | `2`    | Multiplier applied after each check.               |
| `maxAttempts`  | `number` | —      | Give up after this many checks.                    |
| `timeout`      | duration | —      | Give up after this long.                           |

240|This is how a durable function waits on the outside world: an approval, a
third-party job, a file that has to land. Whatever signals it — a webhook, an
endpoint of yours, another function — writes somewhere the check can read.

## `ctx.map(name?, items, fn, options?)`

Runs the same work over every item, each item in its own child context.

````javascript
const shipped = await ctx.map(
  'ship-items',
   250|  input.items,
  async (item, itemCtx, index) => {
    const label = await itemCtx.step('label', () => printLabel(item));
    return { sku: item.sku, label, index };
  },
  { concurrency: 5 }
);

ctx.log.info('shipping done', { ok: shipped.succeeded, failed: shipped.failed });
shipped.throwIfFailed();
   260|```

The item comes first and its context second, so the common case reads well and
the context is there when an item needs operations of its own.

## `ctx.parallel(name?, branches, options?)`

Runs different branches at the same time, each in its own child context. A
branch is a function, or `{ name, run }` to name it in the execution history.

   270|```javascript
const checks = await ctx.parallel(
  'pre-flight',
  [
    (branch) => branch.step('fraud', () => scoreFraud(input)),
    { name: 'stock', run: (branch) => branch.step('stock', () => reserveStock(input)) },
  ],
  { minSucceeded: 2 }
);
````

280|### BatchOptions

| Option         | Type     | Description                                                   |
| -------------- | -------- | ------------------------------------------------------------- |
| `concurrency`  | `number` | How many items or branches run at once. Unlimited by default. |
| `minSucceeded` | `number` | Finish as soon as this many have succeeded.                   |

### BatchResult

`map` and `parallel` both resolve to the same plain object, so it logs and
290|returns cleanly:

| Field       | Type     | Description                                                              |
| ----------- | -------- | ------------------------------------------------------------------------ | -------- | ------------------------------------------- |
| `items`     | array    | Every item in input order: `{ index, status, result, error }`.           |
| `results`   | array    | The results that succeeded, so not aligned with the input if any failed. |
| `errors`    | array    | The failures.                                                            |
| `succeeded` | `number` | How many succeeded.                                                      |
| `failed`    | `number` | How many failed.                                                         |
| `total`     | `number` | How many were in the batch.                                              |
| 300         |          | `throwIfFailed()`                                                        | function | Throws the first failure, if there was one. |

An item's `status` is `succeeded`, `failed`, or `started` — the last one only
appears when `minSucceeded` finished the batch while others were still running.

## `ctx.log`

Logs through the durable logger, which suppresses output while an operation is
being replayed, so a resumed execution does not re-log what it already did.

310|```javascript
ctx.log.info('order received', { order_id: input.order_id });
ctx.log.error('shipping failed', error, { order_id: input.order_id });

````

`console.log` still works, and still reaches [function logs](/platform/functions/logs) — it just repeats on every replay.

## A complete function

An order pipeline: charge, fan out over the items, wait for a human, then
   320|finish. Every operation is recorded, so an interrupted execution picks up where
it stopped rather than charging the card twice.

```javascript
const { durable } = require('@volcano.dev/sdk/durable');
const { Client } = require('pg');
const { databaseConnectionString } = require('@volcano.dev/sdk');

exports.handler = durable(async (input, ctx) => {
  const order = await ctx.step('load-order', () => withDb((db) => loadOrder(db, input.order_id)));
   330|
  const charge = await ctx.step('charge', () => chargeCard(order), {
    atMostOnce: true,
    retry: false,
  });

  const packed = await ctx.map(
    'pack',
    order.items,
    (item, itemCtx) => itemCtx.step('pack-item', () => packItem(item)),
   340|    { concurrency: 5 }
  );
  packed.throwIfFailed();

  const review = await ctx.waitUntil(
    'await-review',
    async () => withDb((db) => reviewStatus(db, order.id)),
    { initialState: 'pending', until: (status) => status !== 'pending', interval: '1m', timeout: '24h' }
  );

   350|  if (review === 'rejected') {
    await ctx.step('refund', () => refundCharge(charge.id), { atMostOnce: true, retry: false });
    return { order_id: order.id, outcome: 'refunded' };
  }

  await ctx.step('dispatch', () => dispatch(order, packed.results));
  return { order_id: order.id, outcome: 'shipped', charge_id: charge.id };
});

async function withDb(fn) {
   360|  const client = new Client({
    connectionString: databaseConnectionString(process.env.DATABASE_URL),
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}
````

370|

A worked, deployable version of this — manifest, migration, and the endpoints
that start and read executions — is in
[`examples/durable-order-pipeline`](https://github.com/Kong/volcano-sdk-js/tree/main/examples/durable-order-pipeline).

## Starting and reading executions

Nothing in this module starts an execution. `volcano.durable.start` does, from
another function, a backend holding a service key, or a browser holding an anon
key for a public durable function:

```javascript
const { data, error } = await volcano.durable.start(
  'order-pipeline',
  { order_id: orderId },
  { executionName: `order-${orderId}` },
);

if (error) {
  throw error;
}
console.log(data.id, data.status); // 'running'
```

The execution name is the idempotency key: starting again under the same name
returns the execution that already exists rather than beginning a second one,
and is charged once.

`start` resolves rather than throws when the platform refuses. `status` carries
why — `403` for a durable function that is not public, `429` for a project with
too many executions in flight for its plan, `404` for a name that is not a
durable function in this project.

Starting is the only durable operation an application credential can perform.
Reading a result or stopping an execution is owner-scoped and takes a platform
token, because an anon key is shared by everyone who loads the page and an
execution is addressed by id alone. A function that has to report back writes
what it produced where the app can read it — a table, a bucket — or the owner
polls the execution. See
[Durable functions](/platform/functions/durable-functions) for the full API and
[the CLI reference](/cli/durable-functions) for `volcano cloud durable`.

## Limits

| Limit                             | Free  | Pro   |
| --------------------------------- | ----- | ----- |
| Step timeout                      | 300 s | 900 s |
| Execution timeout                 | 24 h  | 24 h  |
| Concurrent executions per project | 10    | 100   |

410|The step timeout bounds one attempt between checkpoints, not the execution. A
step that needs longer than that has to be split, or moved behind
`ctx.waitUntil` so the waiting happens between operations instead of inside one.

## Not available yet

- **Callbacks.** The runtime can suspend on an externally-completed callback,
  but nothing in Volcano can complete one, so the facade leaves it out. Wait on
  your own state with `ctx.waitUntil` instead.
- **Durable invoke.** Call another function from inside a step —
  420| `ctx.step('sync', () => volcano.functions.invoke('sync', payload))` — rather
  than chaining durable executions.
- **Local development.** Durable execution is a cloud capability; deploying a
  durable function against a local project is refused rather than emulated.

## Next steps

- [Functions](./functions.md) — standard functions, invocation, and user context
- [Durable functions on the platform](/platform/functions/durable-functions) — the API, limits, and billing
- [CLI](/cli/durable-functions) — deploy, start, and inspect executions

```

```
