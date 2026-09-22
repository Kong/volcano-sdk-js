/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import { assert, integer, property } from 'fast-check';
import { secureRandomUnit } from '../src/lock-random.ts';
import { propertyOptions } from './support/property-options.ts';

function fillRandom<T extends ArrayBufferView | null>(target: T, sample: number): T {
  if (!(target instanceof Uint8Array)) {
    throw new TypeError('Expected a byte array');
  }
  expect(target.byteLength).toBe(4);
  new DataView(target.buffer, target.byteOffset, target.byteLength).setUint32(0, sample);
  return target;
}

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([
  [0, 0],
  [1, 1 / 0x1_0000_0000],
  [0x8000_0000, 0.5],
  [0xffff_ffff, 1 - 1 / 0x1_0000_0000],
])('maps the unsigned sample %d to %d', (sample, expected) => {
  const random = jest.spyOn(crypto, 'getRandomValues');
  random.mockImplementation((target) => fillRandom(target, sample));
  expect(secureRandomUnit()).toBe(expected);
  expect(random).toHaveBeenCalledTimes(1);
});

test('preserves all 32 random bits in a value below one', () => {
  const random = jest.spyOn(crypto, 'getRandomValues');
  assert(
    property(integer({ min: 0, max: 0xffff_ffff }), (sample) => {
      random.mockImplementation((target) => fillRandom(target, sample));
      const value = secureRandomUnit();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
      expect(value * 0x1_0000_0000).toBe(sample);
    }),
    propertyOptions(),
  );
});

test('requests a fresh sample on each call', () => {
  const random = jest.spyOn(crypto, 'getRandomValues');
  random.mockImplementationOnce((target) => fillRandom(target, 0));
  random.mockImplementationOnce((target) => fillRandom(target, 0x8000_0000));
  expect(secureRandomUnit()).toBe(0);
  expect(secureRandomUnit()).toBe(0.5);
  expect(random).toHaveBeenCalledTimes(2);
});

test('propagates crypto failures', () => {
  const failure = new Error('Random source unavailable');
  jest.spyOn(crypto, 'getRandomValues').mockImplementation(() => {
    throw failure;
  });
  expect(secureRandomUnit).toThrow(failure);
});
