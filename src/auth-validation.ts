import type { JsonValue, User, UserMetadata } from './sdk-public-types.ts';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export interface CompleteSessionFields {
  access_token: string;
  refresh_token: string;
  user: User;
}

export interface AuthTokenFields {
  access_token: string;
  refresh_token?: string | undefined;
  expires_in: number;
  user: User;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function validateCredentials(session: Record<string, unknown>): TypeError | null {
  if (!isNonEmptyString(session['access_token'])) {
    return new TypeError('Session access_token must be a non-empty string');
  }
  if (!isNonEmptyString(session['refresh_token'])) {
    return new TypeError('Session refresh_token must be a non-empty string');
  }
  return null;
}

function validateUser(user: unknown): TypeError | null {
  if (!isObject(user)) {
    return new TypeError('Session user must be an object');
  }
  if (!isNonEmptyString(user['id'])) {
    return new TypeError('Session user ID must be a non-empty string');
  }
  return validateAuthUser(user);
}

function isUserStatus(value: unknown): value is User['status'] {
  return value === 'active' || value === 'banned' || value === 'deleted';
}

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  );
}

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  if (!isObject(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonScalar(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isJsonRecord(value) && Object.values(value).every(isJsonValue);
}

function isUserMetadata(value: unknown): value is UserMetadata {
  return isJsonRecord(value) && Object.values(value).every(isJsonValue);
}

function optionalStringError(user: Record<string, unknown>): TypeError | null {
  for (const name of ['project_id', 'avatar_url', 'last_sign_in_at', 'created_at', 'updated_at']) {
    if (Object.hasOwn(user, name) && typeof user[name] !== 'string') {
      return new TypeError(`Auth user ${name} must be a string`);
    }
  }
  return null;
}

function optionalMetadataError(user: Record<string, unknown>): TypeError | null {
  for (const name of ['user_metadata', 'app_metadata']) {
    if (Object.hasOwn(user, name) && !isUserMetadata(user[name])) {
      return new TypeError(`Auth user ${name} must be JSON metadata`);
    }
  }
  return null;
}

function optionalBooleanError(user: Record<string, unknown>): TypeError | null {
  if (Object.hasOwn(user, 'email_confirmed') && typeof user['email_confirmed'] !== 'boolean') {
    return new TypeError('Auth user email_confirmed must be a boolean');
  }
  return null;
}

function optionalNullableStringError(user: Record<string, unknown>): TypeError | null {
  if (
    Object.hasOwn(user, 'banned_until') &&
    user['banned_until'] !== null &&
    typeof user['banned_until'] !== 'string'
  ) {
    return new TypeError('Auth user banned_until must be a string or null');
  }
  return null;
}

function optionalUserError(user: Record<string, unknown>): TypeError | null {
  return (
    optionalBooleanError(user) ??
    optionalNullableStringError(user) ??
    optionalStringError(user) ??
    optionalMetadataError(user)
  );
}

export function validateAuthUser(user: unknown): TypeError | null {
  if (!isObject(user)) {
    return new TypeError('Auth user must be an object');
  }
  if (!isNonEmptyString(user['id'])) {
    return new TypeError('Auth user ID must be a non-empty string');
  }
  if (typeof user['email'] !== 'string') {
    return new TypeError('Auth user email must be a string');
  }
  if (!isUserStatus(user['status'])) {
    return new TypeError('Auth user status must be active, banned, or deleted');
  }
  return optionalUserError(user);
}

export function assertAuthUser(user: unknown): asserts user is User {
  const error = validateAuthUser(user);
  if (error !== null) {
    throw error;
  }
}

function assertOptionalRefreshToken(data: Record<string, unknown>): void {
  if (Object.hasOwn(data, 'refresh_token') && data['refresh_token'] !== undefined) {
    if (!isNonEmptyString(data['refresh_token'])) {
      throw new TypeError('Auth refresh_token must be a non-empty string');
    }
  }
}

function assertExpiresIn(data: Record<string, unknown>): void {
  if (typeof data['expires_in'] !== 'number' || !Number.isInteger(data['expires_in'])) {
    throw new TypeError('Auth expires_in must be an integer');
  }
}

export function assertAuthTokenResponse(data: unknown): asserts data is AuthTokenFields {
  if (!isObject(data)) {
    throw new TypeError('Auth token response must be an object');
  }
  if (!isNonEmptyString(data['access_token'])) {
    throw new TypeError('Auth access_token must be a non-empty string');
  }
  assertOptionalRefreshToken(data);
  assertExpiresIn(data);
  assertAuthUser(data['user']);
}

export function validateCompleteSession(session: unknown): TypeError | null {
  if (!isObject(session)) {
    return new TypeError('Session must be an object');
  }
  return validateCredentials(session) ?? validateUser(session['user']);
}

export function validateOAuthSession(session: unknown): TypeError | null {
  if (!isObject(session)) {
    return new TypeError('Session must be an object');
  }
  if (!isNonEmptyString(session['access_token'])) {
    return new TypeError('Session access_token must be a non-empty string');
  }
  const refreshToken = session['refresh_token'];
  if (refreshToken !== undefined && !isNonEmptyString(refreshToken)) {
    return new TypeError('Session refresh_token must be a non-empty string');
  }
  return validateUser(session['user']);
}

export function assertCompleteSession(session: unknown): asserts session is CompleteSessionFields {
  const error = validateCompleteSession(session);
  if (error !== null) {
    throw error;
  }
}

export function sanitizeProvider(provider: unknown): void {
  if (typeof provider !== 'string' || !/^[a-z0-9-]+$/.test(provider)) {
    throw new Error(
      'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
    );
  }
}
