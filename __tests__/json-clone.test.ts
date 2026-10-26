/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { cloneJsonValue } from '../src/json-clone.ts';
import { expectPresent } from './support/assertions.ts';

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
  expect(copied).toHaveProperty('bytes', expect.any(Uint8Array));
  // The clone may come from another realm; equality checks the Date tag and time, not the constructor.
  expect(copied).toHaveProperty('expiresAt', original.expiresAt);
});

test('uses JSON cloning when structuredClone is unavailable', () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
  expectPresent(descriptor);
  Object.defineProperty(globalThis, 'structuredClone', { configurable: true, value: undefined });
  try {
    const original = { user: { name: 'first' } };
    const copied = cloneJsonValue(original);
    expect(copied).toEqual(original);
    expect(copied).not.toBe(original);
  } finally {
    Object.defineProperty(globalThis, 'structuredClone', descriptor);
  }
});
