/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { ProjectLockLease } from '../src/index.ts';
import { deferred, lease, setup } from './support/locks-session-fixtures.ts';

beforeEach(() => {
  jest.useFakeTimers({ now: 0, timerLimit: 100 });
});
afterEach(() => {
  expect(jest.getTimerCount()).toBe(0);
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('returns callback data and releases the same ownership token', async () => {
  const { session, release } = setup();
  const callback = jest
    .fn<(context: { signal: AbortSignal; lease: ProjectLockLease }) => string>()
    .mockReturnValue('done');
  await expect(session.run(callback)).resolves.toEqual({ data: 'done', error: null });
  expect(callback).toHaveBeenCalledWith({ signal: session.controller.signal, lease });
  expect(release).toHaveBeenCalledWith('job', lease);
});

test('retains callback failure over a release failure', async () => {
  const { session, release } = setup();
  const error = new Error('callback failed');
  const callback = jest.fn<() => Promise<string>>().mockRejectedValue(error);
  release.mockResolvedValue({ error: new Error('release failed') });
  await expect(session.run(callback)).resolves.toEqual({ data: null, error });
});

test('normalizes a non-Error callback rejection', async () => {
  const { session } = setup();
  const callback = jest.fn<() => Promise<string>>().mockRejectedValue('failed');
  await expect(session.run(callback)).resolves.toEqual({ data: null, error: new Error('failed') });
});

test('returns release failures after successful guarded work', async () => {
  const { session, release } = setup();
  release.mockRejectedValue('release failed');
  await expect(session.run(() => 'done')).resolves.toEqual({
    data: 'done',
    error: new Error('release failed'),
  });
});

test('renews a slow acquisition before calling guarded work', async () => {
  const { session, renew } = setup(6, 5000);
  await expect(session.run(() => 'done')).resolves.toEqual({ data: 'done', error: null });
  expect(renew).toHaveBeenCalledWith('job', lease, { ttl: 6, signal: expect.any(AbortSignal) });
});

test('does not call guarded work when preparatory renewal loses ownership', async () => {
  const { session, renew } = setup(6, 5000);
  const error = new Error('not owner');
  renew.mockResolvedValue({ lease, error });
  const callback = jest.fn<() => string>();
  await expect(session.run(callback)).resolves.toEqual({ data: null, error });
  expect(callback).not.toHaveBeenCalled();
});

test('rejects an already expired lease without trying to renew it', async () => {
  const { session, renew } = setup(6, 6000);
  const callback = jest.fn<() => string>();
  await expect(session.run(callback)).resolves.toEqual({
    data: null,
    error: new Error('lock lease expired before renewal completed'),
  });
  expect(renew).not.toHaveBeenCalled();
  expect(callback).not.toHaveBeenCalled();
});

test('rejects a renewal without a safe window before the absolute lifetime cap', async () => {
  const lifetime = 90 * 24 * 60 * 60;
  const { session } = setup(lifetime, lifetime * 1000 - 1000);
  await expect(session.run(() => 'unsafe')).resolves.toEqual({
    data: null,
    error: new Error('lock renewal returned no safe lease window'),
  });
});

test('fails closed when a platform clock cannot provide a finite lease window', async () => {
  const { session } = setup();
  jest.spyOn(performance, 'now').mockReturnValue(Number.NaN);
  const callback = jest.fn<() => string>();
  await expect(session.run(callback)).resolves.toEqual({
    data: null,
    error: new Error('lock lease expired before renewal completed'),
  });
  expect(callback).not.toHaveBeenCalled();
});

test('an invalid clock reading cannot produce a renewal delay', async () => {
  const { session } = setup();
  jest.spyOn(performance, 'now').mockReturnValue(Number.NaN);
  expect(session.renewalDelay()).toBe(0);
  session.checkExpiry();
  expect(session.failure).toEqual(new Error('lock lease expired before renewal completed'));
  await session.cleanup();
});

test('renews periodically until guarded work completes', async () => {
  const { session, renew } = setup();
  const callback = deferred<string>();
  const running = session.run(() => callback.promise);
  await jest.advanceTimersByTimeAsync(4000);
  expect(renew).toHaveBeenCalledTimes(2);
  callback.resolve('done');
  await expect(running).resolves.toEqual({ data: 'done', error: null });
});
