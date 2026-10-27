import { type AuthErrorOptions, hasValue } from './errors-brand.ts';

/** A stale auth operation completed after another logical session won. */
export class AuthSessionChangedError extends Error {
  declare readonly name: 'AuthSessionChangedError';
  declare readonly code: 'auth_session_changed';
  declare readonly status: 409;
  constructor(message?: string, options?: AuthErrorOptions);
  constructor() {
    super('Auth operation discarded because the session changed');
    Object.defineProperty(this, 'code', { value: 'auth_session_changed' });
    Object.defineProperty(this, 'status', { value: 409 });
  }

  static is(error: unknown): error is AuthSessionChangedError {
    return (
      hasValue(error, 'name', 'AuthSessionChangedError') &&
      hasValue(error, 'code', 'auth_session_changed') &&
      hasValue(error, 'status', 409)
    );
  }
}
Object.assign(AuthSessionChangedError.prototype, { name: 'AuthSessionChangedError' });
