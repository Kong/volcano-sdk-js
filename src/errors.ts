import { type AuthErrorOptions, hasValue } from './errors-brand.ts';

export { AuthSessionChangedError } from './errors-session-changed.ts';
export { VolcanoSystemError } from './errors-system.ts';

/** A refresh completed after another auth operation replaced or cleared the session. */
export class AuthRefreshDiscardedError extends Error {
  declare readonly name: 'AuthRefreshDiscardedError';
  declare readonly code: 'auth_refresh_discarded';
  declare readonly status: 409;
  constructor(message?: string, options?: AuthErrorOptions);
  constructor() {
    super('Refresh result discarded because the auth session changed');
    Object.defineProperty(this, 'code', { value: 'auth_refresh_discarded' });
    Object.defineProperty(this, 'status', { value: 409 });
  }

  static is(error: unknown): error is AuthRefreshDiscardedError {
    return (
      hasValue(error, 'name', 'AuthRefreshDiscardedError') &&
      hasValue(error, 'code', 'auth_refresh_discarded') &&
      hasValue(error, 'status', 409)
    );
  }
}
Object.assign(AuthRefreshDiscardedError.prototype, { name: 'AuthRefreshDiscardedError' });
