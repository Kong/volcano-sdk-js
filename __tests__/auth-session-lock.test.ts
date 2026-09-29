/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { withSessionLock } from '../src/auth-session-lock.ts';
import { deferred, signal, within } from './auth-concurrency-fixtures.ts';

const saved = new Map(
  ['window', 'navigator'].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]),
);

function setGlobal(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}

type LockRequest = (
  name: string,
  options: LockOptions,
  callback: LockGrantedCallback<unknown>,
) => Promise<unknown>;

function lockRequest(implementation: LockRequest) {
  const request = jest.fn(implementation);
  setGlobal('navigator', { locks: { request } });
  return request;
}

function neverGranted(): ReturnType<typeof lockRequest> {
  return lockRequest(
    (_name, options) =>
      new Promise((_resolve, reject) => {
        options.signal?.addEventListener('abort', () => {
          reject(new DOMException('The request was aborted.', 'AbortError'));
        });
      }),
  );
}

function unexpected(): Promise<string> {
  return Promise.reject(new Error('unexpected lock outcome'));
}

/** Starts a task that holds this page's queue until `release` resolves. */
function holdPageQueue(): { held: Promise<string>; started: Promise<void>; release(): void } {
  setGlobal('navigator', {});
  const release = deferred<string>();
  const started = signal();
  const held = withSessionLock(
    1000,
    () => {
      started.resolve();
      return release.promise;
    },
    unexpected,
  );
  return {
    held,
    started: started.promise,
    release() {
      release.resolve('first');
    },
  };
}

beforeEach(() => {
  setGlobal('window', { document: {} });
});

afterEach(() => {
  jest.useRealTimers();
  for (const [name, descriptor] of saved) {
    if (descriptor === undefined) {
      Reflect.deleteProperty(globalThis, name);
    } else {
      Object.defineProperty(globalThis, name, descriptor);
    }
  }
});

it('runs tasks concurrently outside a browser without requesting a lock', async () => {
  Reflect.deleteProperty(globalThis, 'window');
  const request = lockRequest(() => unexpected());
  const first = deferred<string>();
  const second = jest.fn(() => Promise.resolve('second'));

  const running = withSessionLock(1000, () => first.promise, unexpected);
  try {
    await expect(
      within(withSessionLock(1000, second, unexpected), 'concurrent task'),
    ).resolves.toBe('second');
  } finally {
    // Release the first task even on failure so it cannot hold the page queue.
    first.resolve('first');
  }

  await expect(running).resolves.toBe('first');
  expect(request).not.toHaveBeenCalled();
});

describe('without Web Locks', () => {
  it.each([
    ['no navigator', undefined],
    ['a null navigator', null],
    ['a primitive navigator', 'navigator'],
    ['no lock manager', {}],
    ['a null lock manager', { locks: null }],
    ['a primitive lock manager', { locks: 'locks' }],
    ['a lock manager without request()', { locks: {} }],
  ])('serializes tasks in this page with %s', async (_label, browserNavigator) => {
    jest.useFakeTimers();
    const queue = holdPageQueue();
    setGlobal('navigator', browserNavigator);
    const second = jest.fn(() => Promise.resolve('second'));

    const queued = withSessionLock(1000, second, unexpected);
    await queue.started;
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    // Only a Web Lock request arms the wait timer.
    expect(jest.getTimerCount()).toBe(0);

    queue.release();
    await expect(queue.held).resolves.toBe('first');
    await expect(queued).resolves.toBe('second');
  });

  it('continues the queue after a task fails', async () => {
    setGlobal('navigator', {});
    const failure = new Error('refresh failed');

    const failing = withSessionLock(1000, () => Promise.reject(failure), unexpected);
    const next = withSessionLock(1000, () => Promise.resolve('next'), unexpected);

    await expect(failing).rejects.toBe(failure);
    await expect(within(next, 'task after failure')).resolves.toBe('next');
  });
});

describe('with Web Locks', () => {
  it('runs the task while holding the session lock', async () => {
    jest.useFakeTimers();
    const request = lockRequest((_name, _options, callback) => Promise.resolve(callback(null)));

    await expect(withSessionLock(1000, () => Promise.resolve('locked'), unexpected)).resolves.toBe(
      'locked',
    );
    expect(request).toHaveBeenCalledWith(
      'volcano-sdk:auth-session',
      { signal: expect.any(AbortSignal) },
      expect.any(Function),
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not repeat a task that fails while holding the lock', async () => {
    const failure = new Error('refresh failed');
    lockRequest((_name, _options, callback) => Promise.resolve(callback(null)));
    const task = jest.fn(() => Promise.reject(failure));
    const timedOut = jest.fn(unexpected);

    await expect(withSessionLock(1000, task, timedOut)).rejects.toBe(failure);
    expect(task).toHaveBeenCalledTimes(1);
    expect(timedOut).not.toHaveBeenCalled();
  });

  it('stops waiting one second after the request timeout', async () => {
    jest.useFakeTimers();
    neverGranted();
    const task = jest.fn(() => Promise.resolve('locked'));
    const timedOut = jest.fn(() => Promise.resolve('timed out'));

    const waiting = withSessionLock(5000, task, timedOut);
    await jest.advanceTimersByTimeAsync(5999);
    expect(timedOut).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    await expect(waiting).resolves.toBe('timed out');
    expect(task).not.toHaveBeenCalled();
  });

  it('coordinates in this page when the lock request fails', async () => {
    jest.useFakeTimers();
    const queue = holdPageQueue();
    lockRequest(() => Promise.reject(new DOMException('Opaque origin', 'SecurityError')));
    const task = jest.fn(() => Promise.resolve('queued'));
    const timedOut = jest.fn(unexpected);

    const queued = withSessionLock(1000, task, timedOut);
    await queue.started;
    await jest.advanceTimersByTimeAsync(0);
    expect(task).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    queue.release();
    await expect(queued).resolves.toBe('queued');
    expect(timedOut).not.toHaveBeenCalled();
  });
});
