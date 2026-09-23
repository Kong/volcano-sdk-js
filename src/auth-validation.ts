function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface CompleteSessionFields {
  access_token: string;
  refresh_token: string;
  user: { id: string };
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
  return null;
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
