# Durable order pipeline

A deployable Volcano project showing what `@volcano.dev/sdk/durable` is for: an
order pipeline that charges a card, packs every item, waits for a human to
review the order, and dispatches it — as **one execution** that survives the
wait, however long it takes.

The review is the point. No request could stay open for it, and a standard
function would have to be split into a chain of jobs with its own state
machine. Here it is four lines in the middle of the handler.

## What's in it

| File                                        | What it is                                                                       |
| ------------------------------------------- | -------------------------------------------------------------------------------- |
| `volcano/functions/order-pipeline/index.js` | The durable function: the workflow, and where each operation is checkpointed.    |
| `volcano/functions/order-pipeline/db.js`    | The work each step does, behind one object, so the handler reads as a flow.      |
| `volcano/functions/orders-api/index.js`     | A standard function that starts executions, reports status, and records reviews. |
| `volcano/migrations/001_orders.sql`         | `orders`, `order_items`, `charges`, with RLS so a user sees only their own.      |
| `volcano/volcano-config.yaml`               | Declares `order-pipeline` as `kind: durable`.                                    |

## The pipeline

```javascript
const charge = await ctx.step('charge', () => db.charge(order), {
  atMostOnce: true,
  retry: false,
});

const packed = await ctx.map('pack', order.items, (item, itemCtx) =>
  itemCtx.step('pack-item', () => db.packItem(order.id, item)),
);

const review = await ctx.waitUntil('await-review', () => db.reviewStatus(order.id), {
  initialState: 'pending',
  until: (status) => status !== 'pending',
  interval: '30s',
  timeout: '24h',
});
```

Three things this demonstrates:

- **The charge happens once.** `atMostOnce` checkpoints before the call rather
  than after, and `retry: false` stops the engine from trying again, so an
  interrupted attempt cannot double-charge.
- **The wait is free.** While `waitUntil` polls, the execution is suspended: it
  is not running, not holding a connection, and not billed for the time.
- **A resumed execution skips what finished.** Every completed step returns its
  recorded result, so the pipeline picks up at the first operation that never
  ran.

## Deploy it

Needs the [Volcano CLI](https://volcano.dev/cli), a project, and `volcano login`
plus `volcano use <project>`.

```bash
# 1. Variables first, so the handlers have them on their first run.
cp volcano/volcano.env.example volcano/volcano.env   # then fill it in
volcano cloud variables deploy

# 2. The durable function. Its own package.json pulls in the durable runtime.
volcano cloud durable deploy order-pipeline

# 3. Record the id it printed, and redeploy variables so orders-api has it.
#    `volcano cloud durable list` prints it again if you lose it.
echo "DURABLE_FUNCTION_ID=<the id>" >> volcano/volcano.env
volcano cloud variables deploy

# 4. The standard function. --all skips order-pipeline, because the manifest
#    declares it durable.
volcano cloud functions deploy --all

# 5. Visibility, then the schema.
volcano cloud config deploy
volcano cloud migrations deploy --all -d app
```

## Run it

Submit an order as a signed-in user:

```bash
volcano cloud functions invoke orders-api --payload '{
  "action": "submit",
  "items": [
    { "sku": "VOL-1", "quantity": 2, "price_cents": 1999 },
    { "sku": "VOL-2", "quantity": 1, "price_cents": 4500 }
  ]
}'
```

```json
{
  "order_id": "9c1f…",
  "execution_id": "3a7b…",
  "status": "running"
}
```

The execution charges and packs, then parks on the review. Watch it:

```bash
volcano cloud durable executions list order-pipeline
volcano cloud durable executions get order-pipeline <execution-id>
```

Approve the order, and the same execution resumes and dispatches it:

```bash
volcano cloud functions invoke orders-api --payload '{
  "action": "review", "order_id": "9c1f…", "decision": "approved"
}'

# Within the polling interval:
volcano cloud durable executions get order-pipeline <execution-id>
```

```json
{
  "status": "succeeded",
  "result": {
    "order_id": "9c1f…",
    "outcome": "shipped",
    "tracking": "TRK-9C1F…",
    "packed": 2
  }
}
```

Reject it instead and the execution refunds the charge and ends as `refunded` —
the same execution, taking the other branch, with the refund guarded by
`atMostOnce` the same way the charge is.

## Things worth copying

- **The order id is the execution name.** `orders-api` starts with
  `X-Volcano-Execution-Name: order-<id>`, so a client that retries the submit
  resolves to the execution that already exists rather than starting a second
  pipeline.
- **The platform token never leaves the backend.** Starting an execution is
  allowed with a service key; reading one is owner-scoped. The browser calls
  `orders-api`, which reads the order row the pipeline keeps up to date.
- **The signal is a row, not a callback.** A reviewer writes `review_status`, and
  the execution's `waitUntil` notices on its next check. Nothing has to reach
  into the execution.

## Further reading

- [Durable functions in the SDK](../../docs/durable-functions.md) — the authoring API in full
- [Durable functions on the platform](https://volcano.dev/platform/functions/durable-functions) — limits, billing, and the API
