/** @jest-environment node */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.js';
import { LeaseClock } from '../src/lock-session.ts';

function response(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return status === 204
    ? new Response(null, { status, headers })
    : Response.json(body, { status, headers });
}

let fetchMock: jest.MockedFunction<typeof fetch>;

function fetchCall(index: number): { input: RequestInfo | URL; init: RequestInit } {
  const call = fetchMock.mock.calls[index];
  if (call?.[1] === undefined) {
    throw new TypeError(`Expected fetch call ${String(index)}`);
  }
  return { input: call[0], init: call[1] };
}

function headerAt(index: number, name: string): string | null {
  return new Headers(fetchCall(index).init.headers).get(name);
}

function methodAt(index: number): string | undefined {
  return fetchCall(index).init.method;
}

function textBodyAt(index: number): string {
  const body = fetchCall(index).init.body;
  if (typeof body !== 'string') {
    throw new TypeError(`Expected text body in fetch call ${String(index)}`);
  }
  return body;
}

function signalAt(index: number): AbortSignal {
  const signal = fetchCall(index).init.signal;
  if (!(signal instanceof AbortSignal)) {
    throw new TypeError(`Expected AbortSignal in fetch call ${String(index)}`);
  }
  return signal;
}

function methodsSeen(): (string | undefined)[] {
  return fetchMock.mock.calls.map((_call, index) => methodAt(index));
}

function countMethod(method: string): number {
  return methodsSeen().filter((seen) => seen === method).length;
}

function complete<T>(resolve: ((value: T) => void) | undefined, value: T): void {
  if (resolve === undefined) {
    throw new Error('Expected a pending operation');
  }
  resolve(value);
}

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error ? reason : new Error('Request aborted', { cause: reason });
}

describe('project locks', () => {
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

  test('acquires, renews, and releases with the ownership token', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(201, { expires_at: '2026-07-20T12:00:10Z', fencing_token: 4 }),
      )
      .mockResolvedValueOnce(
        response(200, { expires_at: '2026-07-20T12:00:20Z', fencing_token: 4 }),
      )
      .mockResolvedValueOnce(response(204, {}));

    const acquired = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000001',
      requestId: '10000000-0000-4000-8000-000000000001',
    });
    expect(acquired).toEqual({
      acquired: true,
      lease: {
        key: 'leader',
        token: '00000000-0000-4000-8000-000000000001',
        expiresAt: '2026-07-20T12:00:10Z',
        fencingToken: 4,
      },
      error: null,
    });
    if (acquired.lease === null) {
      throw new Error('Expected an acquired lease');
    }

    const renewed = await volcano.locks.renew('leader', acquired.lease, {
      ttl: 10,
      requestId: '10000000-0000-4000-8000-000000000002',
    });
    expect(renewed.error).toBeNull();
    expect(renewed.lease.expiresAt).toBe('2026-07-20T12:00:20Z');
    expect(renewed.lease.fencingToken).toBe(4);
    const released = await volcano.locks.release('leader', acquired.lease, {
      requestId: '10000000-0000-4000-8000-000000000003',
    });
    expect(released.error).toBeNull();

    expect(headerAt(0, 'X-Volcano-Lock-Token')).toBe(acquired.lease.token);
    expect(methodAt(1)).toBe('PATCH');
    expect(methodAt(2)).toBe('DELETE');
    const requestIDs = fetchMock.mock.calls.map((_call, index) =>
      headerAt(index, 'X-Volcano-Request-Id'),
    );
    expect(requestIDs).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ]);
  });

  test('keeps the original credential when an ambiguous acquire is retried', async () => {
    fetchMock
      .mockImplementationOnce(() => {
        Reflect.set(volcano, 'accessToken', 'sk-replacement');
        return Promise.reject(new Error('response lost'));
      })
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }));

    const result = await volcano.locks.acquire('leader', { ttl: 30 });

    expect(result.acquired).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map((_call, index) => headerAt(index, 'Authorization'))).toEqual([
      'Bearer sk-service-role',
      'Bearer sk-service-role',
    ]);
    expect(textBodyAt(0)).toBe(textBodyAt(1));
  });

  test.each([400, 401, 403, 409, 429, 500])('does not retry acquire status %s', async (status) => {
    Reflect.set(volcano, 'refreshToken', 'must-not-refresh');
    fetchMock.mockResolvedValue(response(status, { error: 'rejected', code: 'lock_failure' }));
    const result = await volcano.locks.acquire('leader', { ttl: 30 });
    expect(result.error?.status).toBe(status);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('maps lock contention to acquired false without an error', async () => {
    fetchMock.mockResolvedValue(response(409, { error: 'Lock is held', code: 'lock_held' }));

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000002',
    });

    expect(result).toEqual({ acquired: false, lease: null, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  // A lapsed lease of our own is still just an unavailable lock, so an election
  // loop must see it as "not leader" rather than as a failed request.
  test('maps a lapsed own lease to acquired false without an error', async () => {
    fetchMock.mockResolvedValue(
      response(409, { error: 'Lock ownership lost', code: 'lock_ownership_lost' }),
    );

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000002',
    });

    expect(result).toEqual({ acquired: false, lease: null, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('accepts the 90 day maximum TTL', async () => {
    fetchMock.mockResolvedValue(response(201, { expires_at: '2026-10-18T12:00:00Z' }));

    const result = await volcano.locks.acquire('long-running-leader', {
      ttl: 7_776_000,
      token: '00000000-0000-4000-8000-000000000006',
    });

    expect(result.acquired).toBe(true);
    expect(JSON.parse(textBodyAt(0))).toEqual({ ttl_seconds: 7_776_000 });
  });

  test('exposes lock rate-limit recovery metadata', async () => {
    fetchMock.mockResolvedValue(
      response(
        429,
        { error: 'lock request limit exceeded', code: 'lock_rate_limited' },
        { 'retry-after': '42' },
      ),
    );

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000009',
    });

    expect(result.error).toMatchObject({
      status: 429,
      code: 'lock_rate_limited',
      retryAfter: 42,
    });
  });

  test('retries an ambiguous acquire with the same token', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }));

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000003',
    });

    expect(result.acquired).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(headerAt(0, 'X-Volcano-Lock-Token')).toBe(headerAt(1, 'X-Volcano-Lock-Token'));
    expect(headerAt(0, 'X-Volcano-Request-Id')).toBe(headerAt(1, 'X-Volcano-Request-Id'));
  });

  test('withLock releases after callback success and failure', async () => {
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000004');
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(204, {}))
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(204, {}));

    const success = await volcano.locks.withLock('leader', { ttl: 10 }, () => Promise.resolve(42));
    expect(success).toEqual({ acquired: true, data: 42, error: null });

    const failure = new Error('callback failed');
    const failed = await volcano.locks.withLock('leader', { ttl: 10 }, () =>
      Promise.reject(failure),
    );
    expect(failed.error).toBe(failure);
    expect(methodsSeen().filter((method) => method === 'DELETE')).toHaveLength(2);
  });

  test('withLock aborts the callback after renewal loses ownership', async () => {
    jest.useFakeTimers();
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

  test('withLock renews a slow acquisition before running the callback', async () => {
    jest.useFakeTimers();
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

  test('withLock cancels a preparatory renewal when the acquired lease expires', async () => {
    jest.useFakeTimers();
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

  test('withLock keeps preparatory cancellation active while reading the renewal body', async () => {
    jest.useFakeTimers();
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

  test('renew propagates caller cancellation to the request', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementationOnce(
      (_url, options) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = options?.signal;
          if (!(signal instanceof AbortSignal)) {
            reject(new TypeError('Expected renewal cancellation signal'));
            return;
          }
          signal.addEventListener(
            'abort',
            () => {
              reject(abortReason(signal));
            },
            { once: true },
          );
        }),
    );
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

  test('renew reports caller cancellation while reading the response body', async () => {
    const controller = new AbortController();
    const cancellation = new Error('renewal cancelled');
    fetchMock.mockImplementationOnce((_url, options) => {
      const signal = options?.signal;
      if (!(signal instanceof AbortSignal)) {
        throw new TypeError('Expected renewal cancellation signal');
      }
      const delayed = response(200, {});
      jest.spyOn(delayed, 'json').mockImplementation(
        () =>
          new Promise<unknown>((_resolve, reject) => {
            if (signal.aborted) {
              reject(abortReason(signal));
              return;
            }
            signal.addEventListener(
              'abort',
              () => {
                reject(abortReason(signal));
              },
              { once: true },
            );
          }),
      );
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

  test('withLock derives renewal cadence from elapsed ttl despite wall-clock skew', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000007');
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementation((values) => {
      new DataView(values.buffer, values.byteOffset, values.byteLength).setUint32(0, 0x8000_0000);
      return values;
    });
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

  test('withLock aborts at ttl and cleans up without waiting for a stalled renewal', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000b');
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementation((values) => {
      new DataView(values.buffer, values.byteOffset, values.byteLength).setUint32(0, 0x8000_0000);
      return values;
    });
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

  test('withLock caps long JavaScript timers at one day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000008');
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementation((values) => {
      new DataView(values.buffer, values.byteOffset, values.byteLength).setUint32(0, 0x8000_0000);
      return values;
    });
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
    await jest.advanceTimersByTimeAsync(24 * 60 * 60 * 1000 - 1);
    expect(methodsSeen().filter((method) => method === 'PATCH')).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result.error).toBeInstanceOf(Error);
    expect(methodsSeen().filter((method) => method === 'PATCH')).toHaveLength(1);
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

  // A renewal must not move the fencing token, or the guarded resource would
  // start rejecting writes from the holder that still owns the lease.
  test('keeps the fencing token when a renewal omits it', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(201, { expires_at: '2026-07-20T12:00:10Z', fencing_token: 11 }),
      )
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:00:20Z' }));

    const acquired = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-00000000000a',
    });
    if (acquired.lease === null) {
      throw new Error('Expected an acquired lease');
    }
    const renewed = await volcano.locks.renew('leader', acquired.lease, { ttl: 10 });

    expect(renewed.lease.fencingToken).toBe(11);
  });

  test('reads lock state and force releases a stuck lock', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(200, {
          held: true,
          expires_at: '2026-07-20T12:00:10Z',
          fencing_token: 12,
        }),
      )
      .mockResolvedValueOnce(response(200, { held: false }))
      .mockResolvedValueOnce(response(204, {}));

    const held = await volcano.locks.get('leader', {
      requestId: '20000000-0000-4000-8000-000000000001',
    });
    expect(held).toEqual({
      state: { held: true, expiresAt: '2026-07-20T12:00:10Z', fencingToken: 12 },
      error: null,
    });

    const free = await volcano.locks.get('leader');
    expect(free.state).toEqual({ held: false, expiresAt: null, fencingToken: null });

    const released = await volcano.locks.forceRelease('leader');
    expect(released.error).toBeNull();
    expect(methodsSeen()).toEqual(['GET', 'GET', 'DELETE']);
    expect(fetchCall(0).input).toContain('/locks/leader');
    expect(fetchCall(0).input).not.toContain('/lease');
    expect(headerAt(0, 'X-Volcano-Request-Id')).toBe('20000000-0000-4000-8000-000000000001');
    expect(headerAt(0, 'X-Volcano-Lock-Token')).toBeNull();
  });

  test('surfaces errors from the read and force release routes', async () => {
    fetchMock
      .mockResolvedValueOnce(
        response(
          429,
          { error: 'lock request limit exceeded', code: 'lock_rate_limited' },
          {
            'retry-after': '30',
          },
        ),
      )
      .mockResolvedValueOnce(response(503, { error: 'Lock service unavailable' }));

    const read = await volcano.locks.get('leader');
    expect(read.state).toBeNull();
    expect(read.error).toMatchObject({ status: 429, retryAfter: 30 });

    const forced = await volcano.locks.forceRelease('leader');
    expect(forced.error).toMatchObject({ status: 503 });
  });

  test('validates keys, TTLs, and lease ownership before network calls', async () => {
    await expect(volcano.locks.acquire('../leader', { ttl: 10 })).rejects.toThrow('lock key');
    await expect(volcano.locks.acquire('leader', { ttl: 4 })).rejects.toThrow('ttl');
    await expect(volcano.locks.acquire('leader', { ttl: 7_776_001 })).rejects.toThrow('ttl');
    const invalidRelease: unknown = Reflect.apply(
      volcano.locks.release.bind(volcano.locks),
      undefined,
      ['leader', { key: 'other', token: 'token' }],
    );
    await expect(invalidRelease).rejects.toThrow('lease must belong');
    await expect(volcano.locks.get('../leader')).rejects.toThrow('lock key');
    await expect(volcano.locks.forceRelease('../leader')).rejects.toThrow('lock key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
