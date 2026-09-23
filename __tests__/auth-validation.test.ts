import { describe, expect, test } from '@jest/globals';
import {
  sanitizeProvider,
  validateCompleteSession,
  validateOAuthSession,
} from '../src/auth-validation.ts';

const credentials = { access_token: 'access', refresh_token: 'refresh' };
const invalidObjects: readonly unknown[] = [
  null,
  undefined,
  false,
  0,
  'session',
  [],
  () => 'not a session',
];
const invalidStrings: readonly unknown[] = [null, undefined, false, 0, {}, [], '', ' \n\t '];

describe('session validation', () => {
  test.each(invalidObjects)('rejects a non-object session: %p', (session) => {
    expect(validateCompleteSession(session)).toEqual(new TypeError('Session must be an object'));
  });

  test.each(invalidStrings)('rejects invalid access tokens: %p', (accessToken) => {
    expect(validateCompleteSession({ ...credentials, access_token: accessToken })).toEqual(
      new TypeError('Session access_token must be a non-empty string'),
    );
  });

  test.each(invalidStrings)('rejects invalid refresh tokens: %p', (refreshToken) => {
    expect(validateCompleteSession({ ...credentials, refresh_token: refreshToken })).toEqual(
      new TypeError('Session refresh_token must be a non-empty string'),
    );
  });

  test.each(invalidObjects)('rejects a non-object user: %p', (user) => {
    expect(validateCompleteSession({ ...credentials, user })).toEqual(
      new TypeError('Session user must be an object'),
    );
  });

  test.each(invalidStrings)('rejects invalid user IDs: %p', (id) => {
    expect(validateCompleteSession({ ...credentials, user: { id } })).toEqual(
      new TypeError('Session user ID must be a non-empty string'),
    );
  });

  test('accepts non-empty fields without changing whitespace or requiring extra user properties', () => {
    const session = {
      access_token: ' access ',
      refresh_token: ' refresh ',
      user: { id: ' user ' },
    };
    expect(validateCompleteSession(session)).toBeNull();
    expect(session).toEqual({
      access_token: ' access ',
      refresh_token: ' refresh ',
      user: { id: ' user ' },
    });
  });

  test('reports the first invalid boundary', () => {
    expect(validateCompleteSession({})).toEqual(
      new TypeError('Session access_token must be a non-empty string'),
    );
    expect(validateCompleteSession({ access_token: 'access' })).toEqual(
      new TypeError('Session refresh_token must be a non-empty string'),
    );
    expect(validateCompleteSession(credentials)).toEqual(
      new TypeError('Session user must be an object'),
    );
  });
});

describe('OAuth token response validation', () => {
  const response = { access_token: 'access', user: { id: 'user-1' } };

  test.each([response, { ...response, refresh_token: 'refresh' }])(
    'accepts a valid token response with optional refresh credentials',
    (value) => {
      expect(validateOAuthSession(value)).toBeNull();
    },
  );

  test.each([null, false, [], 'token'])('rejects non-object responses: %p', (value) => {
    expect(validateOAuthSession(value)).toEqual(new TypeError('Session must be an object'));
  });

  test.each([undefined, '', 1])('rejects invalid access tokens: %p', (value) => {
    expect(validateOAuthSession({ ...response, access_token: value })).toEqual(
      new TypeError('Session access_token must be a non-empty string'),
    );
  });

  test.each([null, '', 1])('rejects invalid supplied refresh tokens: %p', (value) => {
    expect(validateOAuthSession({ ...response, refresh_token: value })).toEqual(
      new TypeError('Session refresh_token must be a non-empty string'),
    );
  });

  test.each([null, {}, { id: '' }])('rejects invalid users: %p', (value) => {
    expect(validateOAuthSession({ ...response, user: value })).not.toBeNull();
  });
});

describe('provider validation', () => {
  test.each(['google', 'github', 'custom-provider', '0123', '-'])('accepts %s', (provider) => {
    expect(() => {
      sanitizeProvider(provider);
    }).not.toThrow();
  });

  test.each([
    ...invalidStrings,
    'Google',
    'with space',
    '../google',
    'oauth?state=secret',
    'a/b',
    'café',
  ])('rejects %p', (provider) => {
    expect(() => {
      sanitizeProvider(provider);
    }).toThrow(
      'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
    );
  });
});
