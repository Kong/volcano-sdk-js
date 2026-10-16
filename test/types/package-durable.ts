import {
  durable as esmDurable,
  type DurableContext as EsmContext,
} from '../../dist/durable.esm.mjs';
import { durable as cjsDurable, type DurableContext as CjsContext } from '../../dist/durable.js';

export const cjsHandler = cjsDurable<{ orderId: number }, number>(
  async (input, context: CjsContext) => {
    await context.wait('1s');
    return input.orderId;
  },
);

export const esmHandler = esmDurable<{ orderId: number }, number>(
  async (input, context: EsmContext) => {
    await context.wait('1s');
    const decision = await context.waitForApproval('ship', { title: 'Ship it?' });
    await context.publish('decided', { approved: decision.approved });
    const confirmed = await context.waitForMessage('confirmed', { timeout: '1h' });
    return decision.approved && confirmed !== null ? input.orderId : 0;
  },
);
