/**
 * Error Normalization
 *
 * A catch clause receives `unknown`. The app stores and shows errors as Error.
 */

/**
 * Return a caught value as an Error, wrapping anything that is not one
 */
export function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}
