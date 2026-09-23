import type { DurableHandler, DurableOptions } from './durable-types.js';

export type {
  BatchCompletionReason,
  BatchFailure,
  BatchItem,
  BatchOptions,
  BatchResult,
  DurableContext,
  DurableDuration,
  DurableHandler,
  DurableLog,
  DurableOptions,
  DurableStepScope,
  ParallelBranch,
  Retry,
  RetryDecision,
  RetryOptions,
  StepOptions,
  WaitUntilOptions,
} from './durable-types.js';

/**
 * Wraps a handler so Volcano runs it as a durable execution.
 *
 * @example
 * ```javascript
 * const { durable } = require('@volcano.dev/sdk/durable');
 *
 * exports.handler = durable(async (input, ctx) => {
 *   const charge = await ctx.step('charge', () => chargeCard(input.order_id));
 *   await ctx.wait('settle', '30s');
 *   return { charged: charge.id };
 * });
 * ```
 */
export declare function durable<TInput = unknown, TResult = unknown>(
  handler: DurableHandler<TInput, TResult>,
  options?: DurableOptions,
): (event: unknown, functionContext: unknown) => Promise<unknown>;

/** Thrown on the first invocation when the durable runtime is not installed. */
export declare class DurableRuntimeMissingError extends Error {
  name: 'DurableRuntimeMissingError';
  cause?: unknown;
}
