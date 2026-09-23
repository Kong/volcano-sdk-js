/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { validateLease, validateLockKey, validateLockOptions } from '../src/lock-validation.ts';

test.each([
  undefined,
  null,
  false,
  1,
  {},
  '',
  '-key',
  '_key',
  'two/keys',
  ' spaced',
  'a'.repeat(129),
])('rejects an invalid lock key: %p', (key) => {
  expect(() => {
    validateLockKey(key);
  }).toThrow(TypeError);
  expect(() => validateLockOptions(key, { ttl: 5 })).toThrow(TypeError);
});

test.each(['A', '0', 'project.build:worker-1_2', 'a'.repeat(128)])(
  'accepts a lock key without rewriting it: %s',
  (key) => {
    expect(() => {
      validateLockKey(key);
    }).not.toThrow();
    expect(validateLockOptions(key, { ttl: 5 })).toBe(5);
  },
);

test.each([
  undefined,
  null,
  {},
  false,
  '5',
  { ttl: '5' },
  { ttl: false },
  { ttl: 4 },
  { ttl: 5.5 },
  { ttl: Number.NaN },
  { ttl: Infinity },
  { ttl: 7_776_001 },
])('rejects invalid TTL options: %p', (options) => {
  expect(() => validateLockOptions('key', options)).toThrow(
    'ttl must be an integer between 5 seconds and 90 days',
  );
});

test.each([5, 30, 7_776_000])('accepts an integer TTL inside the bounds: %d', (ttl) => {
  expect(validateLockOptions('key', { ttl })).toBe(ttl);
});

test.each([
  undefined,
  null,
  false,
  {},
  { key: 'other', token: 'owner' },
  { key: 'key' },
  { key: 'key', token: '' },
  { key: 'key', token: 12 },
])('refuses a lease without a matching key and nonempty owner token: %p', (lease) => {
  expect(() => {
    validateLease('key', lease);
  }).toThrow('lease must belong to the requested lock and include its token');
});

test('accepts an owner token without requiring unrelated lease fields', () => {
  expect(() => {
    validateLease('key', { key: 'key', token: 'owner' });
  }).not.toThrow();
});

test('retains structural options and lease support on callable objects', () => {
  const value = Object.assign(() => 'callable', { ttl: 5, key: 'key', token: 'owner' });
  expect(validateLockOptions('key', value)).toBe(5);
  expect(() => {
    validateLease('key', value);
  }).not.toThrow();
});
