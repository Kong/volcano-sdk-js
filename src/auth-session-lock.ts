import { isBrowser } from './next/request.ts';

// Web Locks are not reentrant: an application that holds its own lock while
// calling refreshSession() or signOut() must use a different name.
const SESSION_LOCK_NAME = 'volcano-sdk:auth-session';
// A refresh holds the lock for one request and two synchronous storage accesses.
const LOCK_WAIT_MARGIN_MS = 1000;

let pageQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes use of the stored refresh token across the tabs and SDK clients
 * that share browser storage. When another holder outlasts the wait, `timedOut`
 * runs instead; taking the lock anyway could spend a rotated token twice.
 */
export function withSessionLock<Result>(
  requestTimeoutMs: number,
  task: () => Promise<Result>,
  timedOut: () => Promise<Result>,
): Promise<Result> {
  if (!isBrowser()) {
    return task();
  }
  const locks = webLocks();
  if (locks === null) {
    return queueInPage(task);
  }
  return requestWebLock(locks, requestTimeoutMs + LOCK_WAIT_MARGIN_MS, task, timedOut);
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
  timedOut: () => Promise<Result>,
): Promise<Result> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, waitMs);
  // Settling inside the callback separates a failed task from a lock that was never granted.
  const [request] = await Promise.allSettled([
    locks.request(SESSION_LOCK_NAME, { signal: controller.signal }, () =>
      Promise.allSettled([task()]),
    ),
  ]);
  clearTimeout(timer);
  if (request.status === 'rejected') {
    // Aborting after the grant has no effect, so only an expired wait is aborted here.
    // Other request failures (such as an opaque origin) leave only this page to coordinate.
    return controller.signal.aborted ? timedOut() : queueInPage(task);
  }
  const [outcome] = request.value;
  if (outcome.status === 'fulfilled') {
    return outcome.value;
  }
  throw outcome.reason;
}

function queueInPage<Result>(task: () => Promise<Result>): Promise<Result> {
  const run = pageQueue.then(task);
  pageQueue = Promise.allSettled([run]);
  return run;
}
