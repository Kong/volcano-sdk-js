import { isBrowser } from './next/request.ts';

// Web Locks are not reentrant: an application that holds its own lock while
// calling refreshSession() must use a different name or wait on itself.
const REFRESH_LOCK_NAME = 'volcano-sdk:refresh-token';
// A holder's work is one refresh request plus two synchronous storage accesses.
const LOCK_WAIT_MARGIN_MS = 1000;

let processQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes refresh-token use across the tabs and SDK instances that share
 * browser storage. When another holder outlasts the wait, `unavailable` runs
 * instead of `task`; taking the lock anyway would spend a rotated token twice.
 */
export function withRefreshLock<Result>(
  requestTimeoutMs: number,
  task: () => Promise<Result>,
  unavailable: () => Promise<Result>,
): Promise<Result> {
  if (!isBrowser()) {
    return task();
  }
  const locks = webLocks();
  if (locks === null) {
    return queueInProcess(task);
  }
  return requestWebLock(locks, requestTimeoutMs + LOCK_WAIT_MARGIN_MS, task, unavailable);
}

function webLocks(): LockManager | null {
  const browserNavigator: unknown = Reflect.get(globalThis, 'navigator');
  if (typeof browserNavigator !== 'object' || browserNavigator === null) {
    return null;
  }
  const locks: unknown = Reflect.get(browserNavigator, 'locks');
  return isLockManager(locks) ? locks : null;
}

function isLockManager(value: unknown): value is LockManager {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'request') === 'function'
  );
}

async function requestWebLock<Result>(
  locks: LockManager,
  waitMs: number,
  task: () => Promise<Result>,
  unavailable: () => Promise<Result>,
): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, waitMs);
  let outcome: PromiseSettledResult<Awaited<Result>>;
  try {
    // Settling inside the callback separates a failed task from a lock that was never granted.
    [outcome] = await locks.request(REFRESH_LOCK_NAME, { signal: controller.signal }, () =>
      Promise.allSettled([task()]),
    );
  } catch {
    // Aborting after the grant has no effect, so only an expired wait is aborted here.
    // Other request failures (such as an opaque origin) leave only this page to coordinate.
    return controller.signal.aborted ? await unavailable() : await queueInProcess(task);
  } finally {
    clearTimeout(timer);
  }
  if (outcome.status === 'fulfilled') {
    return outcome.value;
  }
  throw outcome.reason;
}

function queueInProcess<Result>(task: () => Promise<Result>): Promise<Result> {
  const run = processQueue.then(task);
  processQueue = Promise.allSettled([run]);
  return run;
}
