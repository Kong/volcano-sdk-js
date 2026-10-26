import { createHash } from 'node:crypto';
import {
  callbackConfig,
  type CallbackContext,
  callbackResult,
  callbacks,
  checkedName,
  isCallbackTimeout,
  isRecord,
  platformApiUrl,
  requiredExecutionRef,
  type Submitter,
} from './durable-callback.ts';
import { CallbackFailedError } from './durable-callback-error.ts';
import { waitDuration } from './durable-duration.ts';
import { postToPlatform } from './durable-platform-request.ts';
import type { CallbackSubmitter } from './durable-types.ts';

const OPERATION = 'ctx.waitForCallback()';

/**
 * Open a callback, register it with Volcano for a token, and hand the token to
 * the submitter. Resolves with the result the token's holder succeeds the
 * callback with, or null once a timeout passes. Registration runs inside the
 * runtime's checkpointed submitter, so a replay never registers it twice, and
 * a retried submitter receives the same token.
 */
export async function waitForCallback(
  context: CallbackContext,
  executionRef: string | undefined,
  name: unknown,
  submitter: unknown,
  options: unknown = {},
): Promise<unknown> {
  const callbackName = checkedName(OPERATION, name);
  if (!isSubmitter(submitter)) {
    throw new TypeError(`${OPERATION} requires a submitter function that receives the token`);
  }
  const config = waitConfig(options);
  const apiUrl = platformApiUrl(OPERATION, 'wait for callbacks');
  const execution = requiredExecutionRef(OPERATION, executionRef);
  const waitForCallback = callbacks(context, 'callbacks');
  const submit = registering(apiUrl, execution, callbackName, submitter, replayedOperation(context));
  try {
    return callbackResult(await waitForCallback(callbackName, submit, config), unreadableResult);
  } catch (error) {
    return timedOut(error);
  }
}

// A timeout resolves the wait with null; anything else is thrown.
function timedOut(error: unknown): null {
  if (isCallbackTimeout(error)) {
    return null;
  }
  throw failedCallback(error) ?? error;
}

/**
 * The operation an earlier invocation opened this wait's callback under, or
 * undefined when this invocation opens it. Volcano then reads back to the
 * callback rather than only through recent history. Call it just before the
 * runtime's `waitForCallback`: the wait runs in a child context named by the
 * step about to be taken, and opens the callback as that context's first step.
 * Neither the step cursor nor the checkpoint is public, so a runtime without
 * them names no operation and the registration reads as a first run's does.
 */
function replayedOperation(context: CallbackContext): string | undefined {
  const peekStepId: unknown = Reflect.get(context, 'peekStepId');
  const execution: unknown = Reflect.get(context, '_executionContext');
  const getStepData = isRecord(execution) ? execution['getStepData'] : undefined;
  if (typeof peekStepId !== 'function' || typeof getStepData !== 'function') {
    return undefined;
  }
  const stepId = `${String(Reflect.apply(peekStepId, context, []))}-1`;
  if (Reflect.apply(getStepData, execution, [stepId]) === undefined) {
    return undefined;
  }
  return callbackOperationId(stepId);
}

/** The id the runtime checkpoints the step stepId under. */
export function callbackOperationId(stepId: string): string {
  return createHash('md5').update(stepId).digest('hex').slice(0, 16);
}

// The runtime's submitter: registers the callback, then hands its token on.
function registering(
  apiUrl: string,
  execution: string,
  name: string,
  submitter: CallbackSubmitter,
  operationId: string | undefined,
): Submitter {
  // JSON leaves out an undefined operation, as a first run sends.
  const body = { name, execution_ref: execution, operation_id: operationId };
  return async (callbackId) => {
    const token = registeredToken(
      await postToPlatform(apiUrl, {
        path: '/durable-callbacks',
        body: { ...body, callback_id: callbackId },
        action: 'register the callback',
        subject: 'the callback',
        notReadyCode: 'callback_not_ready',
        closedCode: 'callback_closed',
        readsAnswer: true,
      }),
    );
    // A closed callback already timed out or was answered, and the wait
    // resolves as it did.
    if (token !== undefined) {
      await submitter(token);
    }
  };
}

function isSubmitter(value: unknown): value is CallbackSubmitter {
  return typeof value === 'function';
}

function waitConfig(options: unknown): Record<string, unknown> {
  if (!isRecord(options)) {
    throw new TypeError(`${OPERATION} options must be an object`);
  }
  const config = callbackConfig(options['timeout']);
  if (options['heartbeatTimeout'] !== undefined) {
    config['heartbeatTimeout'] = waitDuration(options['heartbeatTimeout'], 'heartbeatTimeout');
  }
  return config;
}

function registeredToken(body: unknown): string | undefined {
  if (body === undefined) {
    return undefined;
  }
  const token = isRecord(body) ? body['token'] : undefined;
  if (typeof token !== 'string' || token === '') {
    throw new TypeError('Volcano registered the callback with a token this SDK cannot read');
  }
  return token;
}

function unreadableResult(options?: ErrorOptions): TypeError {
  return new TypeError('Volcano resumed the callback with a result this SDK cannot read', options);
}

// Volcano sends the failure's type and message as the error's data too: on
// replay the runtime rebuilds the error from its data and message alone.
function failedCallback(error: unknown): CallbackFailedError | undefined {
  if (!isRecord(error) || error['errorType'] !== 'CallbackExternalError') {
    return undefined;
  }
  const failure = failureData(error['errorData']);
  if (failure === undefined) {
    return undefined;
  }
  return new CallbackFailedError(failure.type, failure.message, error);
}

function failureData(data: unknown): { type: string; message: string } | undefined {
  const value = typeof data === 'string' ? parsed(data) : undefined;
  if (!isRecord(value) || typeof value['type'] !== 'string') {
    return undefined;
  }
  const message = value['message'];
  return { type: value['type'], message: typeof message === 'string' ? message : '' };
}

function parsed(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not JSON, so not a failure Volcano sent.
  }
  return value;
}
