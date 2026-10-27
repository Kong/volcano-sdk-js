/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { LeaseClock } from '../src/lock-session.ts';
import { expectInstanceOf } from './support/assertions.ts';
import { rejectOnAbort } from './support/locks-abort.ts';
import { complete, countMethod, methodsSeen, pinRandomValues, response, signalAt } from './support/locks-fixtures.ts';

let fetchMock: jest.MockedFunction<typeof fetch>;
let volcano: VolcanoAuth;

beforeEach(() => {
  fetchMock = jest.fn<typeof fetch>();
  globalThis.fetch = fetchMock;
  volcano = new VolcanoAuth({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-project',
    accessToken: 'sk-service-role',
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

function propagatesCancellation(): void {
  test('renew propagates caller cancellation to the request', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal;
      expectInstanceOf(signal, AbortSignal);
      return rejectOnAbort(signal);
    });
    const lease = {
      key: 'leader',
      token: '00000000-0000-4000-8000-00000000000e',
      expiresAt: '2026-07-20T12:00:05Z',
      fencingToken: 1,
    };

    const pending = volcano.locks.renew('leader', lease, { ttl: 5, signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    expect(signalAt(0).aborted).toBe(true);
    await expect(pending).resolves.toMatchObject({ error: expect.any(Error) });
  });
}

function reportsCancellationMidBody(): void {
  test('renew reports caller cancellation while reading the response body', async () => {
    const controller = new AbortController();
    const cancellation = new Error('renewal cancelled');
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal;
      expectInstanceOf(signal, AbortSignal);
      const delayed = response(200, {});
      jest.spyOn(delayed, 'json').mockImplementation(() => rejectOnAbort(signal));
      return Promise.resolve(delayed);
    });
    const lease = {
      key: 'leader',
      token: '00000000-0000-4000-8000-000000000010',
      expiresAt: '2026-07-20T12:00:05Z',
      fencingToken: 1,
    };

    const pending = volcano.locks.renew('leader', lease, { ttl: 5, signal: controller.signal });
    await Promise.resolve();
    controller.abort(cancellation);
    const result = await pending;

    expect(result.error).toBe(cancellation);
    expect(result.lease.expiresAt).toBe('2026-07-20T12:00:05Z');
  });
}

function derivesRenewalTiming(): void {
  test('withLock derives renewal cadence from elapsed ttl despite wall-clock skew', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000007');
    pinRandomValues();
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T11:59:00Z' }))
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:01:00Z' }))
      .mockResolvedValueOnce(response(204, {}));

    let finish: ((value: string) => void) | undefined;
    const pending = volcano.locks.withLock('leader', { ttl: 60 }, () => {
      return new Promise<string>((resolve) => {
        finish = resolve;
      });
    });

    await jest.advanceTimersByTimeAsync(19_999);
    const earlyRenewals = countMethod('PATCH');
    await jest.advanceTimersByTimeAsync(1);
    const onTimeRenewals = countMethod('PATCH');
    complete(finish, 'completed');
    const result = await pending;

    expect(earlyRenewals).toBe(0);
    expect(onTimeRenewals).toBe(1);
    expect(result).toEqual({ acquired: true, data: 'completed', error: null });
  });

  test('preserves the absolute acquisition deadline across renewals', () => {
    const performanceNow = jest.spyOn(global.performance, 'now').mockReturnValue(0);
    const dateNow = jest.spyOn(Date, 'now').mockReturnValue(0);
    const ttl = 7_776_000;
    const clock = new LeaseClock(ttl, { monotonic: 0, wall: 0 });
    const nearLimit = ttl * 1000 - 1000;

    performanceNow.mockReturnValue(nearLimit);
    dateNow.mockReturnValue(nearLimit);
    clock.reset({ monotonic: nearLimit, wall: nearLimit });

    expect(clock.remaining()).toBe(1000);
  });
}

function abortsAtTheTTL(): void {
  test('withLock aborts at ttl and cleans up without waiting for a stalled renewal', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000b');
    pinRandomValues();
    let finishRenewal: ((value: Response) => void) | undefined;
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:05Z' }))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRenewal = resolve;
          }),
      )
      .mockResolvedValueOnce(response(204, {}));

    let settled = false;
    const pending = volcano.locks
      .withLock('leader', { ttl: 5 }, ({ signal }) => {
        return new Promise((resolve) => {
          signal.addEventListener(
            'abort',
            () => {
              resolve('aborted');
            },
            { once: true },
          );
          setTimeout(() => {
            resolve('not aborted');
          }, 6000);
        });
      })
      .then((result) => {
        settled = true;
        return result;
      });

    await jest.advanceTimersByTimeAsync(6000);
    const settledBeforeRenewal = settled;
    complete(finishRenewal, response(200, { expires_at: '2026-07-20T12:00:11Z' }));
    const result = await pending;

    expect(settledBeforeRenewal).toBe(true);
    expect(result.data).toBe('aborted');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('lock lease expired before renewal completed');
    expect(methodsSeen()).toEqual(['POST', 'PATCH', 'DELETE']);
  });
}

function capsLongTimers(): void {
  test('withLock caps long JavaScript timers at one day', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const timers = jest.spyOn(globalThis, 'setTimeout');
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000008');
    pinRandomValues();
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-10-18T12:00:00Z' }))
      .mockResolvedValueOnce(
        response(409, {
          error: 'Lock ownership lost',
          code: 'lock_ownership_lost',
        }),
      )
      .mockResolvedValueOnce(response(409, { error: 'Lock ownership lost' }));

    const pending = volcano.locks.withLock(
      'leader',
      { ttl: 7_776_000 },
      ({ signal }) =>
        new Promise((resolve) => {
          signal.addEventListener('abort', resolve, { once: true });
        }),
    );
    await jest.advanceTimersByTimeAsync(0);
    const leaseTimerDelays = timers.mock.calls.map((call) => call[1]).filter((delay) => delay !== 60000);
    expect(leaseTimerDelays).not.toHaveLength(0);
    for (const delay of leaseTimerDelays) {
      expect(delay).toBeGreaterThan(60 * 60 * 1000);
      expect(delay).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
    }
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 - 1);
    expect(methodsSeen().filter((method) => method === 'PATCH')).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result.error).toBeInstanceOf(Error);
    expect(methodsSeen().filter((method) => method === 'PATCH')).toHaveLength(1);
  });
}

describe('project locks', () => {
  propagatesCancellation();
  reportsCancellationMidBody();
  derivesRenewalTiming();
  abortsAtTheTTL();
  capsLongTimers();
});
