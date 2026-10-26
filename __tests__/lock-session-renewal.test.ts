/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { ProjectLocks } from '../src/index.ts';
import { deferred, lease, setup } from './support/locks-session-fixtures.ts';

beforeEach(() => {
  jest.useFakeTimers({ now: 0, timerLimit: 100 });
});
afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('a successful renewal extends the expiry timer from the renewal start', async () => {
  const { session } = setup();
  session.scheduleExpiry();
  jest.advanceTimersByTime(2000);
  await session.renew();
  await jest.advanceTimersByTimeAsync(4999);
  expect(session.failure).toBeNull();
  await jest.advanceTimersByTimeAsync(1001);
  expect(session.failure).toEqual(new Error('lock lease expired before renewal completed'));
  await session.cleanup();
});

test('a successful renewal arms expiry even without a prior timer', async () => {
  const { session } = setup();
  await expect(session.renew()).resolves.toBe(true);
  expect(jest.getTimerCount()).toBe(1);
  await jest.advanceTimersByTimeAsync(6000);
  expect(session.failure).toEqual(new Error('lock lease expired before renewal completed'));
  await session.cleanup();
});

test('ignores a renewal that finishes after cleanup', async () => {
  const { session, renew } = setup();
  const pending = deferred<Awaited<ReturnType<ProjectLocks['renew']>>>();
  renew.mockReturnValue(pending.promise);
  const renewing = session.renew();
  await session.cleanup();
  pending.resolve({ lease, error: null });
  await renewing;
  expect(session.clock.remaining()).toBe(6000);
  expect(jest.getTimerCount()).toBe(0);
});

test('a failed renewal leaves no expiry timer after ownership loss', async () => {
  const { session, renew } = setup();
  const error = new Error('not owner');
  renew.mockResolvedValue({ lease, error });
  await session.renew();
  expect(session.failure).toBe(error);
  expect(jest.getTimerCount()).toBe(0);
  await session.cleanup();
});

test('a renewal completed after lease loss does not reset the clock', async () => {
  const { session, renew } = setup();
  const pending = deferred<Awaited<ReturnType<ProjectLocks['renew']>>>();
  renew.mockReturnValue(pending.promise);
  const renewing = session.renew();
  jest.advanceTimersByTime(1000);
  const error = new Error('ownership lost');
  session.markLost(error);
  pending.resolve({ lease, error: null });
  await renewing;
  expect(session.failure).toBe(error);
  expect(session.clock.remaining()).toBe(5000);
  expect(jest.getTimerCount()).toBe(0);
  await session.cleanup();
});

test('an unsafe renewal does not schedule expiry after it fails closed', async () => {
  const { session } = setup(1);
  await session.renew();
  expect(session.failure).toEqual(new Error('lock renewal returned no safe lease window'));
  expect(jest.getTimerCount()).toBe(0);
  await session.cleanup();
});

test('aborts at expiry while renewal is stalled and ignores its late completion', async () => {
  const { session, renew } = setup();
  const renewal = deferred<Awaited<ReturnType<ProjectLocks['renew']>>>();
  const callback = deferred<string>();
  renew.mockReturnValue(renewal.promise);
  const running = session.run(() => callback.promise);
  await jest.advanceTimersByTimeAsync(6000);
  expect(session.controller.signal.aborted).toBe(true);
  callback.resolve('finished');
  await expect(running).resolves.toEqual({
    data: 'finished',
    error: new Error('lock lease expired before renewal completed'),
  });
  renewal.resolve({ lease, error: null });
  await jest.advanceTimersByTimeAsync(0);
  expect(session.clock.remaining()).toBe(0);
  expect(jest.getTimerCount()).toBe(0);
});

test('aborts guarded work when the renewal request rejects', async () => {
  const { session, renew } = setup();
  const callback = deferred<string>();
  const error = new Error('transport failed');
  renew.mockRejectedValue(error);
  const running = session.run(() => callback.promise);
  await jest.advanceTimersByTimeAsync(2000);
  expect(session.controller.signal.reason).toBe(error);
  callback.resolve('finished');
  await expect(running).resolves.toEqual({ data: 'finished', error });
});
