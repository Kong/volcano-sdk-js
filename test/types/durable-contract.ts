import {
  type ApprovalDecision,
  type BatchResult,
  CallbackFailedError,
  type CallbackSubmitter,
  durable,
  type DurableContext,
  type DurableStepScope,
  type PublishedMessage,
  type ReceivedMessage,
  type WaitForApprovalOptions,
  type WaitForCallbackOptions,
  type WaitForMessageOptions,
} from '../../src/durable.js';

interface OrderInput {
  order_id: number;
  items: string[];
}

interface Charge {
  id: string;
  amount: number;
}

async function exchangeMessages(ctx: DurableContext) {
  const progress: PublishedMessage = await ctx.publish('progress', { percent: 50 });
  await ctx.publish('started');
  const waitFor: WaitForMessageOptions = { timeout: { hours: 2 } };
  const confirmation: ReceivedMessage | null = await ctx.waitForMessage('confirm', waitFor);
  await ctx.waitForMessage('confirm');
  // @ts-expect-error a message needs a name
  void ctx.publish();
  if (confirmation === null) {
    return { published: progress.seq, confirmedBy: null, confirmedData: null };
  }
  const confirmedBy: string | null = confirmation.sender.userId;
  const confirmedData: unknown = confirmation.data;
  return { published: progress.seq, confirmedBy, confirmedData };
}

const tokens: string[] = [];

const submit: CallbackSubmitter = async (token: string) => {
  tokens.push(token);
  await Promise.resolve();
};

async function awaitPayment(ctx: DurableContext) {
  const waitFor: WaitForCallbackOptions = { timeout: '1h', heartbeatTimeout: { minutes: 5 } };
  try {
    const result: unknown = await ctx.waitForCallback('payment', submit, waitFor);
    await ctx.waitForCallback('payment', (token) => {
      tokens.push(token);
    });
    // A submitter's result is ignored, so one that returns what it started fits.
    await ctx.waitForCallback('payment', (token) => tokens.push(token));
    await ctx.waitForCallback('payment', async (token): Promise<Charge> => {
      await Promise.resolve(token);
      return { id: token, amount: 1 };
    });
    // @ts-expect-error a callback needs a submitter
    void ctx.waitForCallback('payment');
    return result ?? `timed out after ${String(tokens.length)} hand-offs`;
  } catch (error) {
    if (error instanceof CallbackFailedError) {
      const failure: { type: string; message: string } = error;
      return failure.type;
    }
    throw error;
  }
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

    const request: WaitForApprovalOptions = {
      title: `Ship order ${String(input.order_id)}?`,
      description: 'Over the auto-ship limit',
      details: { items: input.items },
      timeout: '2d',
    };
    const decision: ApprovalDecision = await ctx.waitForApproval('ship-order', request);
    const decidedBy: string | null = decision.decidedBy?.email ?? null;
    const outcome: 'approved' | 'denied' | 'expired' = decision.status;
    const reviewed = decision.approved ? decision.comment : decision.decidedAt;
    // @ts-expect-error a title is required
    void ctx.waitForApproval('untitled', {});
    const confirmation = await exchangeMessages(ctx);
    const payment = await awaitPayment(ctx);

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
      decidedBy,
      outcome,
      reviewed,
      grouped,
      confirmation,
      payment,
    };
  },
  { logger: console },
);
