import { hasValue } from './errors-brand.ts';

interface SystemErrorOptions {
  status?: number | null;
  code?: string;
  retryAfter?: number;
  cause?: unknown;
}

/**
 * Error raised when a function *invocation* fails at the platform layer rather
 * than inside the function's own code — the call reached (or tried to reach)
 * the invocation gateway but was never served: the deploy is failed/provisioning,
 * the gateway is unavailable (a non-2xx response with no `x-volcano-version`
 * header), or the network call itself failed (timeout/DNS/offline).
 *
 * Detect it with `VolcanoSystemError.is(error)` (or `error?.isSystemError ===
 * true`). Prefer either over `error instanceof VolcanoSystemError`, which can be
 * `false` when an app bundles more than one copy of the SDK (class identities
 * differ). `.status` is the blocked HTTP status, or `null` for transport
 * failures.
 *
 * NOT a system error, and therefore a plain `Error` (or not an error at all):
 * a running function's own non-2xx response (surfaced as `data` with `error`
 * null), and pre-flight / name-resolution failures — invalid function name,
 * misconfigured `apiUrl`, function-not-found — which stay plain `Error`s since
 * they are caller/config issues, not platform outages.
 */
export class VolcanoSystemError extends Error {
  declare readonly name: 'VolcanoSystemError';
  declare readonly isSystemError: true;
  /** HTTP status of the blocked invocation, or null for transport failures. */
  declare readonly status: number | null;
  /** Platform error code, when supplied by the server. */
  declare readonly code?: string;
  /** Retry-After delay in seconds, when supplied by the server. */
  declare readonly retryAfter?: number;
  /** Underlying transport error, when supplied. */
  declare readonly cause?: unknown;

  constructor(message: string, options: SystemErrorOptions = {}) {
    super(message, errorCause(options));
    // Non-enumerable (like native Error's own props) so `JSON.stringify(err)`
    // stays `{}` and consumer log/redaction/snapshot pipelines don't suddenly
    // see new keys. Still read normally: `err.isSystemError`, `err.status`.
    Object.defineProperty(this, 'isSystemError', { value: true });
    Object.defineProperty(this, 'status', { value: options.status ?? null });
    if (options.code !== undefined) {
      Object.defineProperty(this, 'code', { value: options.code });
    }
    if (options.retryAfter !== undefined) {
      Object.defineProperty(this, 'retryAfter', { value: options.retryAfter });
    }
  }

  /**
   * Type guard: true when `err` is a platform-layer invocation failure. Prefer
   * this over `instanceof` — it duck-types on the `isSystemError` brand, so it
   * holds across duplicate SDK copies in a bundle.
   * @param {unknown} err
   * @returns {boolean}
   */
  static is(err: unknown): err is VolcanoSystemError {
    return hasValue(err, 'isSystemError', true);
  }
}
// Keep the name inherited so it stays out of JSON.stringify output.
Object.assign(VolcanoSystemError.prototype, { name: 'VolcanoSystemError' });

function errorCause(options: SystemErrorOptions): ErrorOptions | undefined {
  return options.cause === undefined ? undefined : { cause: options.cause };
}
