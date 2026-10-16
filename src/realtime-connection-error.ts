/** A terminal transport disconnection before realtime becomes connected. */
export class RealtimeConnectionError extends Error {
  declare readonly name: 'RealtimeConnectionError';
  /** Numeric disconnect code, when supplied by the transport. */
  declare readonly code?: number;

  constructor(message: string, code?: number) {
    super(message);
    if (code !== undefined) {
      Object.defineProperty(this, 'code', { value: code });
    }
  }

  /** Narrow an unknown error, including one from another copy of the SDK. */
  static is(error: unknown): error is RealtimeConnectionError {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    return (
      Reflect.get(error, 'name') === 'RealtimeConnectionError' &&
      typeof Reflect.get(error, 'message') === 'string' &&
      isOptionalDisconnectCode(Reflect.get(error, 'code'))
    );
  }
}
Object.assign(RealtimeConnectionError.prototype, { name: 'RealtimeConnectionError' });

function isOptionalDisconnectCode(code: unknown): code is number | undefined {
  return code === undefined || typeof code === 'number';
}
