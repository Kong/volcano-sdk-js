import { expect, test } from '@jest/globals';
import {
  assertAuthTokenResponse,
  assertAuthUser,
  assertCompleteSession,
  sanitizeProvider,
  validateAuthUser,
  validateOAuthSession,
} from '../src/auth-validation.ts';
import type { User } from '../src/sdk-public-types.ts';

const user: User = { id: 'user-1', email: '', status: 'active' };
const token = {
  access_token: 'access',
  refresh_token: 'refresh',
  expires_in: 3600,
  user,
};

test('accepts the required wire user shape without optional timestamps', () => {
  expect(validateAuthUser(user)).toBeNull();
  expect(() => {
    assertAuthUser(user);
  }).not.toThrow();
  expect(() => {
    assertCompleteSession(token);
  }).not.toThrow();
  expect(validateOAuthSession({ access_token: 'access', user })).toBeNull();
});

test.each([
  [null, 'Auth user must be an object'],
  [[], 'Auth user must be an object'],
  [{ ...user, id: '' }, 'Auth user ID must be a non-empty string'],
  [{ ...user, email: null }, 'Auth user email must be a string'],
  [{ ...user, status: 'pending' }, 'Auth user status must be active, banned, or deleted'],
])('rejects a malformed wire user: %p', (candidate, message) => {
  expect(validateAuthUser(candidate)).toEqual(new TypeError(message));
  expect(() => {
    assertAuthUser(candidate);
  }).toThrow(message);
});

test.each(['project_id', 'avatar_url', 'last_sign_in_at', 'created_at', 'updated_at'])(
  'checks optional %s when present',
  (field) => {
    expect(validateAuthUser({ ...user, [field]: 'value' })).toBeNull();
    expect(validateAuthUser({ ...user, [field]: undefined })).toEqual(
      new TypeError(`Auth user ${field} must be a string`),
    );
  },
);

test('checks optional booleans, nullable strings, and JSON metadata', () => {
  expect(
    validateAuthUser({
      ...user,
      email_confirmed: false,
      banned_until: null,
      user_metadata: { nested: { values: [null, true, 2, 'text'] } },
      app_metadata: { role: 'member' },
    }),
  ).toBeNull();
  expect(validateAuthUser({ ...user, banned_until: 'tomorrow' })).toBeNull();
  expect(validateAuthUser({ ...user, email_confirmed: 'yes' })).toEqual(
    new TypeError('Auth user email_confirmed must be a boolean'),
  );
  expect(validateAuthUser({ ...user, banned_until: false })).toEqual(
    new TypeError('Auth user banned_until must be a string or null'),
  );
  expect(validateAuthUser({ ...user, user_metadata: [] })).toEqual(
    new TypeError('Auth user user_metadata must be JSON metadata'),
  );
  expect(validateAuthUser({ ...user, app_metadata: { invalid: Number.NaN } })).toEqual(
    new TypeError('Auth user app_metadata must be JSON metadata'),
  );
  expect(validateAuthUser({ ...user, user_metadata: { invalid: new Date() } })).toEqual(
    new TypeError('Auth user user_metadata must be JSON metadata'),
  );
  const nullPrototype: unknown = Object.setPrototypeOf({ note: 'valid' }, null);
  expect(validateAuthUser({ ...user, user_metadata: nullPrototype })).toBeNull();
});

test('accepts cookie-mode token responses with an absent or undefined refresh token', () => {
  const cookieToken = { access_token: 'access', expires_in: 3600, user };
  expect(() => {
    assertAuthTokenResponse(cookieToken);
  }).not.toThrow();
  expect(() => {
    assertAuthTokenResponse({ ...cookieToken, refresh_token: undefined });
  }).not.toThrow();
  expect(() => {
    assertAuthTokenResponse(token);
  }).not.toThrow();
});

test.each([
  [null, 'Auth token response must be an object'],
  [{ ...token, access_token: '' }, 'Auth access_token must be a non-empty string'],
  [{ ...token, refresh_token: null }, 'Auth refresh_token must be a non-empty string'],
  [{ ...token, expires_in: '3600' }, 'Auth expires_in must be an integer'],
  [{ ...token, expires_in: 1.5 }, 'Auth expires_in must be an integer'],
  [{ ...token, user: { id: 'user-1' } }, 'Auth user email must be a string'],
])('rejects malformed token responses: %p', (candidate, message) => {
  expect(() => {
    assertAuthTokenResponse(candidate);
  }).toThrow(message);
});

test('complete and OAuth sessions require the public user shape', () => {
  expect(() => {
    assertCompleteSession({ ...token, user: { id: 'user-1' } });
  }).toThrow('Auth user email must be a string');
  expect(validateOAuthSession({ access_token: 'access', user: { ...user, status: null } })).toEqual(
    new TypeError('Auth user status must be active, banned, or deleted'),
  );
});

test.each([
  [null, 'Session must be an object'],
  [{ user }, 'Session access_token must be a non-empty string'],
  [
    { access_token: 'access', refresh_token: '', user },
    'Session refresh_token must be a non-empty string',
  ],
])('rejects malformed OAuth sessions: %p', (candidate, message) => {
  expect(validateOAuthSession(candidate)).toEqual(new TypeError(message));
});

test('provider names contain only lowercase URL-safe characters', () => {
  expect(() => {
    sanitizeProvider('google-2');
  }).not.toThrow();
  expect(() => {
    sanitizeProvider(null);
  }).toThrow('Provider must be a non-empty string');
  expect(() => {
    sanitizeProvider('Google');
  }).toThrow('Provider must be a non-empty string');
});
