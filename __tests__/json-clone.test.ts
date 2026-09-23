/** @jest-environment node */
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
