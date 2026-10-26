/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { complete, methodsSeen, response, signalAt } from './support/locks-fixtures.ts';

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

function releasesAfterTheCallback(): void {
  test('withLock releases after callback success and failure', async () => {
    const timers = jest.spyOn(globalThis, 'setTimeout');
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000004');
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(204, {}))
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(204, {}));

    const success = await volcano.locks.withLock('leader', { ttl: 10 }, () => Promise.resolve(42));
    expect(success).toEqual({ acquired: true, data: 42, error: null });

    const failure = new Error('callback failed');
    const failed = await volcano.locks.withLock('leader', { ttl: 10 }, () => Promise.reject(failure));
    expect(failed.error).toBe(failure);
    expect(methodsSeen().filter((method) => method === 'DELETE')).toHaveLength(2);
    const leaseTimerDelays = timers.mock.calls.map((call) => call[1]).filter((delay) => delay !== 60000);
    expect(leaseTimerDelays).not.toHaveLength(0);
    for (const delay of leaseTimerDelays) {
      expect(delay).toBeGreaterThan(1000);
      expect(delay).toBeLessThanOrEqual(10000);
    }
  });
}

function abortsOnOwnershipLoss(): void {
  test('withLock aborts the callback after renewal loses ownership', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000005');
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:05Z' }))
      .mockResolvedValueOnce(
        response(409, {
          error: 'Lock ownership lost',
          code: 'lock_ownership_lost',
        }),
      )
      .mockResolvedValueOnce(response(409, { error: 'Lock ownership lost' }));

    const pending = volcano.locks.withLock('leader', { ttl: 5 }, ({ signal }) => {
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            resolve('stopped');
          },
          { once: true },
        );
      });
    });
    await jest.advanceTimersByTimeAsync(1900);
    const result = await pending;

    expect(result.acquired).toBe(true);
    expect(result.data).toBe('stopped');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('Lock ownership lost');
    expect(methodsSeen()).toEqual(['POST', 'PATCH', 'DELETE']);
  });
}

function renewsASlowAcquisition(): void {
  test('withLock renews a slow acquisition before running the callback', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000c');
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(response(201, { expires_at: '2026-07-20T12:00:05Z' }));
            }, 4000);
          }),
      )
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:00:09Z' }))
      .mockResolvedValueOnce(response(204, {}));
    const methodsSeenByCallback: (string | undefined)[] = [];

    const pending = volcano.locks.withLock('leader', { ttl: 5 }, () => {
      methodsSeenByCallback.push(...methodsSeen());
      return Promise.resolve('completed');
    });
    await jest.advanceTimersByTimeAsync(4000);
    const result = await pending;

    expect(methodsSeenByCallback).toEqual(['POST', 'PATCH']);
    expect(result).toEqual({ acquired: true, data: 'completed', error: null });
    expect(methodsSeen()).toEqual(['POST', 'PATCH', 'DELETE']);
  });
}

function cancelsAnExpiredRenewal(): void {
  test('withLock cancels a preparatory renewal when the acquired lease expires', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000d');
    let finishRenewal: ((value: Response) => void) | undefined;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(response(201, { expires_at: '2026-07-20T12:00:05Z' }));
            }, 4000);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            finishRenewal = resolve;
          }),
      )
      .mockResolvedValueOnce(response(204, {}));
    const callback = jest.fn();

    const pending = volcano.locks.withLock('leader', { ttl: 5 }, callback);
    await jest.advanceTimersByTimeAsync(5000);
    const renewalSignalWasAborted = signalAt(1).aborted;
    complete(finishRenewal, response(200, { expires_at: '2026-07-20T12:00:10Z' }));
    const result = await pending;

    expect(renewalSignalWasAborted).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe('lock lease expired before renewal completed');
  });
}

function cancelsWhileReadingTheBody(): void {
  test('withLock keeps preparatory cancellation active while reading the renewal body', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000f');
    let finishBody: ((value: unknown) => void) | undefined;
    fetchMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => {
              resolve(response(201, { expires_at: '2026-07-20T12:00:05Z' }));
            }, 4000);
          }),
      )
      .mockImplementationOnce(() => {
        const delayed = response(200, {});
        jest.spyOn(delayed, 'json').mockImplementation(
          () =>
            new Promise<unknown>((resolve) => {
              finishBody = resolve;
            }),
        );
        return Promise.resolve(delayed);
      })
      .mockResolvedValueOnce(response(204, {}));
    const callback = jest.fn();

    const pending = volcano.locks.withLock('leader', { ttl: 5 }, callback);
    await jest.advanceTimersByTimeAsync(5000);
    const renewalSignalWasAborted = signalAt(1).aborted;
    complete(finishBody, { expires_at: '2026-07-20T12:00:10Z' });
    const result = await pending;

    expect(renewalSignalWasAborted).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    expect(result.error?.message).toBe('lock lease expired before renewal completed');
  });
}

describe('project locks', () => {
  releasesAfterTheCallback();
  abortsOnOwnershipLoss();
  renewsASlowAcquisition();
  cancelsAnExpiredRenewal();
  cancelsWhileReadingTheBody();
});
