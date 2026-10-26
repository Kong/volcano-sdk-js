/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { setup } from './support/locks-session-fixtures.ts';

beforeEach(() => {
  jest.useFakeTimers({ now: 0, timerLimit: 100 });
});
afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('expiry timer fires at the server lease deadline', async () => {
  const { session } = setup();
  session.scheduleExpiry();
  await jest.advanceTimersToNextTimerAsync();
  expect(Date.now()).toBe(6000);
  expect(session.failure).toEqual(new Error('lock lease expired before renewal completed'));
  await session.cleanup();
});

test('renewal jitter shifts the next request while retaining the safety margin', () => {
  const { session } = setup(6, 0, () => 0.75);
  expect(session.renewalDelay()).toBe(2100);
});

test('an explicit expiry check aborts an expired lease', async () => {
  const { session } = setup();
  jest.advanceTimersByTime(6000);
  session.checkExpiry();
  expect(session.failure).toEqual(new Error('lock lease expired before renewal completed'));
  await session.cleanup();
});

test('an exhausted renewal window fails closed without scheduling another retry', async () => {
  const { session } = setup(6, 5000);
  await session.waitToRenew();
  expect(session.failure).toEqual(new Error('lock renewal returned no safe lease window'));
  expect(jest.getTimerCount()).toBe(0);
  await session.cleanup();
});

test('a completed renewal wait releases its wake callback and timer handle', async () => {
  const { session } = setup();
  const waiting = session.waitToRenew();
  expect(session.wakeRenewal).not.toBeNull();
  expect(session.renewalTimer).toBeDefined();
  await jest.advanceTimersToNextTimerAsync();
  await waiting;
  expect(session.wakeRenewal).toBeNull();
  expect(session.renewalTimer).toBeUndefined();
  await session.cleanup();
});

test('losing ownership stops pending expiry and renewal timers immediately', async () => {
  const { session } = setup();
  session.scheduleExpiry();
  const waiting = session.waitToRenew();
  expect(jest.getTimerCount()).toBe(2);
  session.markLost(new Error('ownership lost'));
  expect(jest.getTimerCount()).toBe(0);
  await waiting;
  await session.cleanup();
});

test('does not overwrite the first loss or restart expiry after loss', async () => {
  const { session } = setup();
  const error = new Error('first loss');
  session.markLost(error);
  session.markLost(new Error('later loss'));
  session.checkExpiry();
  await session.runRenewals();
  expect(session.failure).toBe(error);
  expect(jest.getTimerCount()).toBe(0);
  await session.cleanup();
});

test('ignores loss and expiry checks after cleanup', async () => {
  const { session } = setup();
  await session.cleanup();
  session.markLost(new Error('late loss'));
  session.checkExpiry();
  expect(session.failure).toBeNull();
});

test('reschedules an early expiry check and clears it on cleanup', async () => {
  const { session } = setup();
  session.checkExpiry();
  expect(jest.getTimerCount()).toBe(1);
  await session.cleanup();
});

test('notices expiry during cleanup even before an expiry timer has run', async () => {
  const { session } = setup();
  jest.advanceTimersByTime(6000);
  await session.cleanup();
  expect(session.controller.signal.reason).toEqual(new Error('lock lease expired before renewal completed'));
});
