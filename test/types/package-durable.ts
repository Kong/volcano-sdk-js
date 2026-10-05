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
    return input.orderId;
  },
);
