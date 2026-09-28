/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { withRefreshLock } from '../src/auth-refresh-lock.ts';
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

it('runs outside a browser without requesting a lock', async () => {
  Reflect.deleteProperty(globalThis, 'window');
  const request = lockRequest(() => unexpected());

  await expect(withRefreshLock(1000, () => Promise.resolve('server'), unexpected)).resolves.toBe(
    'server',
  );
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
    setGlobal('navigator', browserNavigator);
    const first = deferred<string>();
    const firstStarted = signal();
    const second = jest.fn(() => Promise.resolve('second'));

    const running = withRefreshLock(
      1000,
      () => {
        firstStarted.resolve();
        return first.promise;
      },
      unexpected,
    );
    const queued = withRefreshLock(1000, second, unexpected);
    await firstStarted.promise;
    await Promise.resolve();
    expect(second).not.toHaveBeenCalled();
    // Only a Web Lock request arms the wait timer.
    expect(jest.getTimerCount()).toBe(0);

    first.resolve('first');
    await expect(running).resolves.toBe('first');
    await expect(queued).resolves.toBe('second');
  });

  it('continues the queue after a task fails', async () => {
    setGlobal('navigator', {});
    const failure = new Error('refresh failed');

    const failing = withRefreshLock(1000, () => Promise.reject(failure), unexpected);
    const next = withRefreshLock(1000, () => Promise.resolve('next'), unexpected);

    await expect(failing).rejects.toBe(failure);
    await expect(within(next, 'task after failure')).resolves.toBe('next');
  });
});

describe('with Web Locks', () => {
  it('runs the task while holding the refresh-token lock', async () => {
    jest.useFakeTimers();
    const request = lockRequest((_name, _options, callback) => Promise.resolve(callback(null)));

    await expect(withRefreshLock(1000, () => Promise.resolve('locked'), unexpected)).resolves.toBe(
      'locked',
    );
    expect(request).toHaveBeenCalledWith(
      'volcano-sdk:refresh-token',
      { signal: expect.any(AbortSignal) },
      expect.any(Function),
    );
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not repeat a task that fails while holding the lock', async () => {
    const failure = new Error('refresh failed');
    lockRequest((_name, _options, callback) => Promise.resolve(callback(null)));
    const task = jest.fn(() => Promise.reject(failure));
    const unavailable = jest.fn(unexpected);

    await expect(withRefreshLock(1000, task, unavailable)).rejects.toBe(failure);
    expect(task).toHaveBeenCalledTimes(1);
    expect(unavailable).not.toHaveBeenCalled();
  });

  it('stops waiting one second after the request timeout', async () => {
    jest.useFakeTimers();
    neverGranted();
    const task = jest.fn(() => Promise.resolve('locked'));
    const unavailable = jest.fn(() => Promise.resolve('unavailable'));

    const waiting = withRefreshLock(5000, task, unavailable);
    await jest.advanceTimersByTimeAsync(5999);
    expect(unavailable).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);

    await expect(waiting).resolves.toBe('unavailable');
    expect(task).not.toHaveBeenCalled();
  });

  it('coordinates in this page when the lock request fails', async () => {
    jest.useFakeTimers();
    lockRequest(() => Promise.reject(new DOMException('Opaque origin', 'SecurityError')));
    const unavailable = jest.fn(unexpected);

    await expect(
      withRefreshLock(1000, () => Promise.resolve('in page'), unavailable),
    ).resolves.toBe('in page');
    expect(unavailable).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });
});
