/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { cloneJsonValue } from '../src/json-clone.ts';

test('copies nested session values with native structuredClone', () => {
  const original = { user: { metadata: { name: 'first' } } };
  const copied = cloneJsonValue(original);
  expect(copied).toEqual(original);
  expect(copied).not.toBe(original);
  original.user.metadata.name = 'second';
  expect(copied).toEqual({ user: { metadata: { name: 'first' } } });
});

test('preserves binary and date values with native structuredClone', () => {
  const original = {
    bytes: new Uint8Array([0, 127, 255]),
    expiresAt: new Date('2026-08-26T12:00:00Z'),
  };
  const copied = cloneJsonValue(original);
  expect(copied).toEqual(original);
  expect(copied).not.toBe(original);
  if (
    typeof copied !== 'object' ||
    copied === null ||
    !('bytes' in copied) ||
    !('expiresAt' in copied)
  ) {
    throw new TypeError('Expected a cloned object with binary and date data');
  }
  expect(copied.bytes).toBeInstanceOf(Uint8Array);
  expect(Object.prototype.toString.call(copied.expiresAt)).toBe('[object Date]');
});

test('uses JSON cloning when structuredClone is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
  Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });
  try {
    const original = { user: { name: 'first' } };
    const copied = cloneJsonValue(original);
    expect(copied).toEqual(original);
    expect(copied).not.toBe(original);
  } finally {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, 'structuredClone');
    } else {
      Object.defineProperty(globalThis, 'structuredClone', descriptor);
    }
  }
});
