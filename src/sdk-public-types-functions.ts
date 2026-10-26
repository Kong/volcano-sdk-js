import type { FunctionInvokeResponse } from './function-invoke.ts';
import type { JsonValue } from './sdk-public-types-json.ts';

/** Error metadata from function resolution, invocation, or authentication recovery. */
export interface FunctionError extends Error {
  status?: number | null;
  code?: string;
  retryAfter?: number;
}

export interface Functions {
  /**
   * Invoke a serverless function.
   *
   * Pass the function name. The SDK handles invocation routing transparently.
   *
   * @param functionName - Function name.
   * @param payload - Optional JSON-serializable payload to send to the function.
   * @returns Raw function response data, HTTP status, headers, and version metadata.
   *          `version` mirrors `X-Volcano-Version` (`<version>` in production, `<env>-<version>` otherwise).
   *
   * @example
   * ```typescript
   * const { data, error } = await volcano.functions.invoke('my-function', { action: 'process' });
   * if (error) {
   *   console.error('Function failed:', error);
   * } else {
   *   console.log('Result:', data);
   * }
   * ```
   */
  invoke<TPayload = JsonValue, TResult = unknown>(
    functionName: string,
    payload?: TPayload,
  ): Promise<FunctionInvokeResponse<TResult>>;
}
