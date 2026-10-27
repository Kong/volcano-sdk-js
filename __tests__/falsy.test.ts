/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { isFalsy } from '../src/falsy.ts';

test.each([undefined, null, false, 0, -0, 0n, '', Number.NaN])('treats a falsy value as absent: %p', (value) => {
  expect(isFalsy(value)).toBe(true);
});

test.each([true, 1, -1, 1n, 'false', ' ', '0', {}, [], () => false, Symbol('falsy')])(
  'treats a truthy value as present: %p',
  (value) => {
    expect(isFalsy(value)).toBe(false);
  },
);
