/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { ProjectLockLease, ProjectLocks } from '../src/index.ts';
import { LockSession } from '../src/lock-session.ts';

const lease: ProjectLockLease = {
  key: 'job',
  token: 'owner',
  expiresAt: null,
  fencingToken: 1,
};

function uninitializedResolver(): never {
  throw new Error('Promise executor did not initialize');
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = uninitializedResolver;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function setup(
  ttl = 6,
  elapsed = 0,
  random = (): number => 0.5,
): {
  session: LockSession;
  renew: ReturnType<typeof jest.fn<ProjectLocks['renew']>>;
  release: ReturnType<typeof jest.fn<ProjectLocks['release']>>;
} {
  let renewalAttempts = 0;
  const renew = jest.fn<ProjectLocks['renew']>().mockImplementation(() => {
    renewalAttempts += 1;
    if (renewalAttempts > 20) {
      throw new Error('Renewal loop exceeded the test bound');
    }
    return Promise.resolve({ lease, error: null });
  });
  const release = jest.fn<ProjectLocks['release']>().mockResolvedValue({ error: null });
  const session = new LockSession({
    locks: { renew, release },
    key: lease.key,
    ttl,
    lease,
    startedAt: { monotonic: -elapsed, wall: -elapsed },
    random,
  });
  return { session, renew, release };
}

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
  expect(session.controller.signal.reason).toEqual(
    new Error('lock lease expired before renewal completed'),
  );
});
