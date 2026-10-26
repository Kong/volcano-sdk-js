import { jest } from '@jest/globals';
import type { VolcanoAuth } from '../../src/index.ts';
import { deferred, signal, within } from '../auth-concurrency-fixtures.ts';

type SessionData = Parameters<VolcanoAuth['_setSession']>[0];

export interface PendingFetch {
  readonly response: { promise: Promise<Response>; resolve: (value: Response) => void };
  readonly started: { promise: Promise<void>; resolve: () => void };
}

const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

export function installWindow(value: object): void {
  Object.defineProperty(globalThis, 'window', { configurable: true, value });
}

export function restoreWindow(): void {
  if (previousWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', previousWindow);
  }
}

/** Holds the next fetch open until the test resolves its response. */
export function pendingFetch(): PendingFetch {
  const response = deferred<Response>();
  const started = signal();
  jest.mocked(globalThis.fetch).mockImplementationOnce(() => {
    started.resolve();
    return response.promise;
  });
  return { response, started };
}

export function originalSession(): SessionData {
  return {
    access_token: 'original-access',
    refresh_token: 'original-refresh',
    user: { id: 'original-user', email: 'fixture@example.com', status: 'active' },
  };
}

export function replacementSession(): SessionData {
  return {
    access_token: 'replacement-access',
    refresh_token: 'replacement-refresh',
    user: { id: 'replacement-user', email: 'fixture@example.com', status: 'active' },
  };
}

/**
 * Starts a request under the original session, replaces the session while the
 * request is in flight, then settles the request with the stale response.
 */
export async function settleAfterReplacement<Result>(
  volcano: VolcanoAuth,
  request: () => Promise<Result>,
  stale: Response,
  [startLabel, settleLabel]: readonly [string, string],
  original: SessionData = originalSession(),
): Promise<Result> {
  volcano._setSession(original);
  const { response, started } = pendingFetch();
  const pending = request();
  await within(started.promise, startLabel);
  volcano._setSession(replacementSession());
  response.resolve(stale);
  return within(pending, settleLabel);
}
