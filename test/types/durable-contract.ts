import type { BatchResult, DurableContext, DurableStepScope } from '../../src/durable.js';
import { durable } from '../../src/durable.js';

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
      async (scope: DurableStepScope) => {
        scope.log.info('charging', { attempt: scope.attempt });
        return { id: 'ch_1', amount: input.order_id };
      },
      { retry: { attempts: 5, initialDelay: '2s' } },
    );

    await ctx.wait('settle', '30s');
    await ctx.wait({ minutes: 1, seconds: 30 });

    const approved = await ctx.waitUntil(
      'approval',
      async (state: { approved: boolean }) => state,
      { initialState: { approved: false }, until: (state) => state.approved, interval: 15 },
    );

    const shipped: BatchResult<string> = await ctx.map(
      'ship',
      input.items,
      async (item, itemCtx, index) => itemCtx.step(`ship-${index}`, async () => item),
      { concurrency: 4 },
    );
    shipped.throwIfFailed();

    const checks = await ctx.parallel([
      (branch) => branch.step('fraud', async () => 'clear'),
      { name: 'stock', run: async () => 'in-stock' },
    ]);

    const grouped = await ctx.child('finalize', async (childCtx) => {
      await childCtx.wait('10s');
      return childCtx.step(async () => checks.results.length);
    });

    void [approved.approved, grouped];
    return { charge: charge.id, shipped: shipped.succeeded };
  },
  { logger: console },
);
