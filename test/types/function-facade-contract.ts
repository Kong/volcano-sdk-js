import type {
  Durable,
  DurableExecution,
  FunctionInvokeResponse,
  Functions,
} from '../../src/index.js';

declare const functions: Functions;
declare const durable: Durable;

const invoked: Promise<FunctionInvokeResponse<{ accepted: boolean }>> = functions.invoke<
  { order_id: number },
  { accepted: boolean }
>('orders', { order_id: 1 });
const started: Promise<{ data: DurableExecution | null; status: number | null; error: Error | null }> =
  durable.start<{ order_id: number }>('orders', { order_id: 1 });

void [invoked, started];
