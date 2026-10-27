import { durableContext } from './durable-context.ts';
import { loadEngine } from './durable-engine.ts';
import { type EngineContext, engineContext } from './durable-engine-context.ts';
import type { DurableHandler, DurableOptions } from './durable-types.ts';

/** Wrap a handler without loading the optional peer until the first invocation. */
export function durable<Input = unknown, Result = unknown>(
  handler: DurableHandler<Input, Result>,
  options: DurableOptions = {},
): (event: unknown, functionContext: unknown) => Promise<unknown> {
  if (typeof handler !== 'function') {
    throw new TypeError('durable(handler) requires a handler function');
  }
  let wrapped: ((event: unknown, functionContext: unknown) => Promise<unknown>) | undefined;
  return async (event: unknown, functionContext: unknown): Promise<unknown> => {
    if (wrapped === undefined) {
      const engine = await loadEngine();
      wrapped = engine.withDurableExecution((input: Input, value: unknown): Promise<Result> => {
        const context = engineContext(value);
        if (options.logger !== undefined) {
          context.configureLogger({ customLogger: options.logger });
        }
        return handler(input, durableContext(context, engine, executionRef(context)));
      });
    }
    return wrapped(event, functionContext);
  };
}

// The runtime copies the invocation event's DurableExecutionArn here verbatim.
// Reading it per invocation from the root context, rather than from the event
// in the cached wrapper, keeps concurrent invocations from sharing a value.
function executionRef(context: EngineContext): string | undefined {
  const arn = context.executionContext?.durableExecutionArn;
  return typeof arn === 'string' && arn !== '' ? arn : undefined;
}

export { CallbackFailedError } from './durable-callback-error.ts';
export { DurableRuntimeMissingError } from './durable-runtime-error.ts';
export type {
  ApprovalDecider,
  ApprovalDecision,
  BatchCompletionReason,
  BatchFailure,
  BatchItem,
  BatchOptions,
  BatchResult,
  CallbackSubmitter,
  DurableContext,
  DurableDuration,
  DurableHandler,
  DurableLog,
  DurableOptions,
  DurableStepScope,
  MessageSender,
  ParallelBranch,
  PublishedMessage,
  ReceivedMessage,
  Retry,
  RetryDecision,
  RetryOptions,
  StepOptions,
  WaitForApprovalOptions,
  WaitForCallbackOptions,
  WaitForMessageOptions,
  WaitUntilOptions,
} from './durable-types.ts';
