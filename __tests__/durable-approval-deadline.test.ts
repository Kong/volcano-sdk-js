/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  failureOf,
  fetchMock,
  hang,
  hangUntilTimedOut,
  mockApprovalRuntime,
  registered,
  resetApprovalDouble,
  respond,
  restoreApprovalDouble,
} from './support/durable-approval-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockApprovalRuntime(), { virtual: true });

beforeEach(resetApprovalDouble);

afterEach(restoreApprovalDouble);

function givesUpAtTheDeadline(): void {
  // 0.5, 1, 2, and 4 seconds, then 5 seconds four times: nine attempts, the
  // last 27.5 seconds in, with too little of the 30 seconds left for another.
  it('gives up after about thirty seconds of retrying', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockImplementation(() => Promise.resolve(respond(503, { error: 'unavailable', code: 'unavailable' })));

    const failure = failureOf(registered());
    await jest.advanceTimersByTimeAsync(27_499);
    expect(fetchMock()).toHaveBeenCalledTimes(8);
    await jest.advanceTimersByTimeAsync(1);
    expect(await failure).toMatchObject({
      status: 503,
      code: 'unavailable',
      message: 'Volcano refused the approval request (503 unavailable): unavailable',
    });
    await jest.advanceTimersByTimeAsync(60_000);

    expect(fetchMock()).toHaveBeenCalledTimes(9);
  });

  it('gives each attempt only the time left before the deadline', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const timeouts = hangUntilTimedOut();

    const failure = failureOf(registered());
    // 10 seconds, half a second of backoff, 10 more, then 1 second of backoff
    // leaves 8.5 seconds.
    await jest.advanceTimersByTimeAsync(29_999);
    expect(timeouts).toEqual([10_000, 10_000, 8500]);
    await jest.advanceTimersByTimeAsync(1);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to request the approval: The operation timed out',
      cause: { name: 'TimeoutError' },
    });
    await jest.advanceTimersByTimeAsync(60_000);
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });
}

function stopsAtTheDeadline(): void {
  it('stops rather than back off past the deadline', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    hangUntilTimedOut();
    fetchMock()
      .mockImplementationOnce(hang)
      .mockImplementationOnce(hang)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(respond(503, { error: 'unavailable' }));
            }, 6500);
          }),
      );

    let settled = false;
    const failure = failureOf(registered()).finally(() => {
      settled = true;
    });
    // The third answer lands 28 seconds in, and the next backoff would use up
    // the 2 seconds left.
    await jest.advanceTimersByTimeAsync(27_999);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    expect(settled).toBe(true);
    expect(await failure).toMatchObject({
      status: 503,
      message: 'Volcano refused the approval request (503): unavailable',
    });
    expect(fetchMock()).toHaveBeenCalledTimes(3);
  });

  it('makes no further attempt when a backoff ends at the deadline', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValue(respond(503, { error: 'unavailable' }));

    const failure = failureOf(registered());
    await jest.advanceTimersByTimeAsync(0);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    // The process was frozen through the backoff, as a suspended runtime is.
    jest.setSystemTime(Date.now() + 29_500);
    await jest.advanceTimersByTimeAsync(500);

    expect(await failure).toMatchObject({ status: 503 });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
}

function reportsTheLastRefusal(): void {
  it('reports the last refusal when the deadline passes as a retry begins', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const timeout = jest.spyOn(AbortSignal, 'timeout');
    fetchMock().mockImplementation(() => Promise.resolve(respond(503, { error: 'unavailable' })));
    const deadline = Date.now() + 30_000;

    const failure = failureOf(registered());
    // Fires just before the backoff does: it ends a millisecond short of the
    // deadline, and the clock has passed it by the next reading.
    setTimeout(() => {
      jest
        .spyOn(Date, 'now')
        .mockReturnValueOnce(deadline - 1)
        .mockReturnValue(deadline + 1);
    }, 500);
    await jest.advanceTimersByTimeAsync(500);

    expect(await failure).toMatchObject({
      status: 503,
      message: 'Volcano refused the approval request (503): unavailable',
    });
    expect(timeout.mock.calls).toEqual([[10_000], [1]]);
  });
}

function reportsAnUnreachablePlatform(): void {
  it('reports an unreachable platform with its cause once retries run out', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const cause = new TypeError('fetch failed');
    fetchMock().mockImplementation(() => Promise.reject(cause));

    const failure = failureOf(registered());
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to request the approval: fetch failed',
      cause,
    });
  });

  // The runtime rethrows the failure with its message alone.
  it.each([
    [
      'a chain of causes',
      new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND api.test.com') }),
      'fetch failed: getaddrinfo ENOTFOUND api.test.com',
    ],
    ['a cause that is not an error', 'socket hang up', 'socket hang up'],
  ])('names %s in the message', async (_case, cause, reason) => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(cause);

    const failure = failureOf(registered());
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: `Could not reach Volcano to request the approval: ${reason}`,
    });
  });
}

describe('approval registration', () => {
  givesUpAtTheDeadline();
  stopsAtTheDeadline();
  reportsTheLastRefusal();
  reportsAnUnreachablePlatform();
});
