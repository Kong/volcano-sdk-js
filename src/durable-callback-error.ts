/**
 * Thrown by `ctx.waitForCallback` when the system holding the token fails the
 * callback. `type` and `message` are what it sent.
 */
export class CallbackFailedError extends Error {
  override name = 'CallbackFailedError' as const;
  /** The error type the callback was failed with, such as `CardDeclined`. */
  readonly type: string;
  override cause: unknown;

  constructor(type: string, message: string, cause?: unknown) {
    super(message);
    this.type = type;
    this.cause = cause;
  }
}
