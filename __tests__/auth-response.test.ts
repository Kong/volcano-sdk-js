import { expect, test } from '@jest/globals';
import { optionalStringField } from '../src/auth-response.ts';

test('optional response strings distinguish absent values from malformed values', () => {
  expect(optionalStringField({}, 'message')).toBeNull();
  expect(optionalStringField({ message: null }, 'message')).toBeNull();
  expect(optionalStringField({ message: 'ready' }, 'message')).toBe('ready');
  expect(() => optionalStringField({ message: 3 }, 'message')).toThrow(
    'Auth response message must be a string',
  );
});
