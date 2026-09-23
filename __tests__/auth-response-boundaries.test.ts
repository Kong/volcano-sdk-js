import { expect, test } from '@jest/globals';
import { optionalField, requiredField } from '../src/auth-response.ts';

test('required fields reject primitive payloads with the auth response error', () => {
  expect(() => requiredField('invalid', 'user')).toThrow('Auth response must be an object');
  expect(() => requiredField(null, 'user')).toThrow('Auth response must be an object');
});

test('optional fields on primitive and null payloads remain absent', () => {
  expect(optionalField('invalid', 'user')).toBeUndefined();
  expect(optionalField(null, 'user')).toBeUndefined();
  expect(optionalField({ user: 'user-1' }, 'user')).toBe('user-1');
});
