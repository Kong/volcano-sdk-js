import { type BatchResult, durable,type DurableContext, type DurableStepScope } from '../../src/durable.js';

interface OrderInput {
  order_id: number;
  items: string[];
}

interface Charge {
  id: string;
  amount: number;
}

export const handler = durable<OrderInput, { charge: string; shipped: number }>(
  async (input, ctx: DurableContext) => {
    const charge: Charge = await ctx.step(
      'charge',
      (scope: DurableStepScope) => {
        scope.log.info('charging', { attempt: scope.attempt });
        return Promise.resolve({ id: 'ch_1', amount: input.order_id });
      },
      { retry: { attempts: 5, initialDelay: '2s' } },
    );

    await ctx.wait('settle', '30s');
    await ctx.wait({ minutes: 1, seconds: 30 });

    const approved = await ctx.waitUntil(
      'approval',
      (state: { approved: boolean }) => Promise.resolve(state),
      { initialState: { approved: false }, until: (state) => state.approved, interval: 15 },
    );

    const shipped: BatchResult<string> = await ctx.map(
      'ship',
      input.items,
      (item, itemCtx, index) => itemCtx.step(`ship-${String(index)}`, () => Promise.resolve(item)),
      { concurrency: 4 },
    );
    shipped.throwIfFailed();
    // The stable parts of a batch result, which is all the facade exposes: the
    // in-flight items and the count the live run observed are not on it,
    // because a replay is not obliged to reproduce them.
    const completed =
      shipped.completionReason === 'min_successful_reached' ? shipped.completed : undefined;
    const failures = shipped.errors.map((failure) => `${failure.name}: ${failure.message}`);

    const checks = await ctx.parallel([
      (branch) => branch.step('fraud', () => Promise.resolve('clear')),
      { name: 'stock', run: () => Promise.resolve('in-stock') },
    ]);

    const grouped = await ctx.child('finalize', async (childCtx) => {
      await childCtx.wait('10s');
      return childCtx.step(() => Promise.resolve(checks.results.length));
    });

    return {
      charge: charge.id,
      shipped: shipped.succeeded,
      completed,
      failures,
      approved: approved.approved,
      grouped,
    };
  },
  { logger: console },
);
