/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { LeaseClock, lockRequestStart } from '../src/lock-clock.ts';

const DAY = 24 * 60 * 60 * 1000;

function setClocks(monotonic: number, wall: number): void {
  jest.spyOn(performance, 'now').mockReturnValue(monotonic);
  jest.spyOn(Date, 'now').mockReturnValue(wall);
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('captures both clocks at the request boundary', () => {
  setClocks(123, 456);
  expect(lockRequestStart()).toEqual({ monotonic: 123, wall: 456 });
});

test.each([
  [1_000, 10_000, 5_000],
  [2_000, 11_000, 4_000],
  [2_000, 10_000, 4_000],
  [1_000, 12_000, 3_000],
  [2_000, 9_000, 4_000],
  [7_000, 16_000, 0],
])('uses the earliest deadline at clocks %d and %d', (monotonic, wall, expected) => {
  const clock = new LeaseClock(5, { monotonic: 1_000, wall: 10_000 });
  setClocks(monotonic, wall);
  expect(clock.remaining()).toBe(expected);
});

test('resets the lease window from the start of a successful renewal request', () => {
  const clock = new LeaseClock(5, { monotonic: 1_000, wall: 10_000 });
  clock.reset({ monotonic: 3_000, wall: 12_000 });
  setClocks(4_000, 13_000);
  expect(clock.remaining()).toBe(4_000);
});

test('caps even an oversized initial lease at ninety days', () => {
  const clock = new LeaseClock((100 * DAY) / 1000, { monotonic: 0, wall: DAY });
  setClocks(0, DAY);
  expect(clock.remaining()).toBe(90 * DAY);
});

test('renewals preserve both absolute acquisition deadlines', () => {
  const clock = new LeaseClock((90 * DAY) / 1000, { monotonic: 0, wall: DAY });
  clock.reset({ monotonic: DAY, wall: 2 * DAY });
  setClocks(DAY, 2 * DAY);
  expect(clock.remaining()).toBe(89 * DAY);
  setClocks(90 * DAY, 91 * DAY);
  expect(clock.remaining()).toBe(0);
});
