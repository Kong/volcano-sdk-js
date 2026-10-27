import { waitDuration } from './durable-duration.ts';

export type Submitter = (callbackId: string) => Promise<void>;
type WaitForCallback = (name: string, submitter: Submitter, config: Record<string, unknown>) => Promise<unknown>;

export interface CallbackContext {
  waitForCallback?: WaitForCallback;
}

// The name is also the runtime's operation name, which allows 256 printable
// ASCII characters. The runtimes add suffixes of up to 19 characters to it, and
// every SDK holds names to the same limit.
export const MAX_NAME_LENGTH = 237;
export const OPERATION_NAME = /^[\u0020-\u007E]+$/u;

/** Requires value to be a name operation can open a callback with. */
export function checkedName(operation: string, value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TypeError(`${operation} requires a non-empty name`);
  }
  if (value.length > MAX_NAME_LENGTH) {
    throw new TypeError(`${operation} name must be at most ${String(MAX_NAME_LENGTH)} characters`);
  }
  if (!OPERATION_NAME.test(value)) {
    throw new TypeError(`${operation} name must be printable ASCII`);
  }
  return value;
}

/**
 * The runtime's `waitForCallback`, bound to its context. Runtimes installed
 * before callbacks were available lack it.
 */
export function callbacks(context: CallbackContext, feature: string): WaitForCallback {
  const waitForCallback = context.waitForCallback;
  if (typeof waitForCallback !== 'function') {
    throw new TypeError(
      `The durable runtime does not support ${feature}; redeploy the function so Volcano installs a current one`,
    );
  }
  return (name, submitter, config) => Reflect.apply(waitForCallback, context, [name, submitter, config]);
}

// The submitter retries what is worth retrying. Left unset, the engine would
// also retry a refusal that cannot succeed.
export function callbackConfig(timeout?: unknown): Record<string, unknown> {
  const config: Record<string, unknown> = { retryStrategy: () => ({ shouldRetry: false }) };
  if (timeout !== undefined) {
    config['timeout'] = waitDuration(timeout, 'timeout');
  }
  return config;
}

export function platformApiUrl(operation: string, purpose: string): string {
  const url = process.env['VOLCANO_PLATFORM_API_URL']?.trim() ?? '';
  if (url === '') {
    throw new Error(
      `${operation} needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to ${purpose}.`,
    );
  }
  return url;
}

export function requiredExecutionRef(operation: string, executionRef: string | undefined): string {
  if (executionRef === undefined) {
    throw new Error(`${operation} cannot tell which execution is running: the durable runtime did not report it`);
  }
  return executionRef;
}

// The runtime rebuilds its errors from their recorded type on replay, so the
// type name is what identifies a timeout both live and replayed.
export function isCallbackTimeout(error: unknown): boolean {
  return isRecord(error) && error['errorType'] === 'CallbackTimeoutError';
}

/** A callback result, which the runtime hands back as JSON text or already parsed. */
export function callbackResult(result: unknown, unreadable: (options?: ErrorOptions) => Error): unknown {
  if (typeof result !== 'string') {
    return result;
  }
  try {
    const value: unknown = JSON.parse(result);
    return value;
  } catch (cause) {
    throw unreadable({ cause });
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
