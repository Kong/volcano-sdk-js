// The durable function. One execution charges the card, packs every item,
// waits for a human to review the order — for as long as that takes — and then
// dispatches it.
//
// Nothing here holds a request open. The execution suspends while it waits and
// resumes when there is something to do, so the review can arrive tomorrow and
// the card is still only charged once.
const { durable } = require('@volcano.dev/sdk/durable');

const { db } = require('./db');

exports.handler = durable(async (input, ctx) => {
  const order = await ctx.step('load-order', () => db.loadOrder(input.order_id));
  if (!order) {
    // Throwing fails the execution and records the error, which is what a bad
    // input deserves: there is nothing to retry.
    throw new Error(`order ${input.order_id} does not exist`);
  }

  // A charge must not happen twice, so it checkpoints before it runs and never
  // retries. Everything after it can be repeated safely.
  const charge = await ctx.step('charge', () => db.charge(order), {
    atMostOnce: true,
    retry: false,
  });
  await ctx.step('mark-charged', () => db.setStatus(order.id, 'charged'));

  const packed = await ctx.map(
    'pack',
    order.items,
    (item, itemCtx) => itemCtx.step('pack-item', () => db.packItem(order.id, item)),
    { concurrency: 5 },
  );
  packed.throwIfFailed();

  // How a durable function waits on the outside world: poll your own state,
  // suspended between checks. `orders-api` flips the row when a reviewer acts.
  const review = await ctx.waitUntil('await-review', () => db.reviewStatus(order.id), {
    initialState: 'pending',
    until: (status) => status !== 'pending',
    interval: '30s',
    maxInterval: '10m',
    // Checks, not a deadline: at these intervals this is most of a day.
    maxAttempts: 200,
  });

  if (review === 'rejected') {
    await ctx.step('refund', () => db.refund(charge.id), { atMostOnce: true, retry: false });
    await ctx.step('mark-refunded', () => db.setStatus(order.id, 'refunded'));
    return { order_id: order.id, outcome: 'refunded', charge_id: charge.id };
  }

  // A carrier that rejects the request is worth retrying; a durable execution
  // can afford to back off for minutes.
  const dispatch = await ctx.step('dispatch', () => db.dispatch(order, packed.results), {
    retry: { attempts: 6, initialDelay: '10s', maxDelay: '5m' },
  });

  await ctx.step('mark-shipped', () => db.setStatus(order.id, 'shipped'));
  ctx.log.info('order shipped', { order_id: order.id, tracking: dispatch.tracking });

  return {
    order_id: order.id,
    outcome: 'shipped',
    charge_id: charge.id,
    tracking: dispatch.tracking,
    packed: packed.succeeded,
  };
});
