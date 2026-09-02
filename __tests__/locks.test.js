const { VolcanoAuth } = require('../src/index.js');
const { LeaseClock } = require('../src/lock-session.js');

function response(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: {
      get: (name) => headers[name.toLowerCase()] ?? null,
    },
  };
}

describe('project locks', () => {
  let volcano;

  beforeEach(() => {
    global.fetch = jest.fn();
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
    fetch
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

    const renewed = await volcano.locks.renew('leader', acquired.lease, {
      ttl: 10,
      requestId: '10000000-0000-4000-8000-000000000002',
    });
    expect(renewed.error).toBeNull();
    expect(renewed.lease.expiresAt).toBe('2026-07-20T12:00:20Z');
    expect(renewed.lease.fencingToken).toBe(4);
    expect(
      (
        await volcano.locks.release('leader', acquired.lease, {
          requestId: '10000000-0000-4000-8000-000000000003',
        })
      ).error,
    ).toBeNull();

    expect(fetch.mock.calls[0][1].headers['X-Volcano-Lock-Token']).toBe(acquired.lease.token);
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
    expect(fetch.mock.calls[2][1].method).toBe('DELETE');
    const requestIDs = fetch.mock.calls.map((call) => call[1].headers['X-Volcano-Request-Id']);
    expect(requestIDs).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ]);
  });

  test('maps lock contention to acquired false without an error', async () => {
    fetch.mockResolvedValue(response(409, { error: 'Lock is held', code: 'lock_held' }));

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000002',
    });

    expect(result).toEqual({ acquired: false, lease: null, error: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  // A lapsed lease of our own is still just an unavailable lock, so an election
  // loop must see it as "not leader" rather than as a failed request.
  test('maps a lapsed own lease to acquired false without an error', async () => {
    fetch.mockResolvedValue(
      response(409, { error: 'Lock ownership lost', code: 'lock_ownership_lost' }),
    );

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000002',
    });

    expect(result).toEqual({ acquired: false, lease: null, error: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('accepts the 90 day maximum TTL', async () => {
    fetch.mockResolvedValue(response(201, { expires_at: '2026-10-18T12:00:00Z' }));

    const result = await volcano.locks.acquire('long-running-leader', {
      ttl: 7_776_000,
      token: '00000000-0000-4000-8000-000000000006',
    });

    expect(result.acquired).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ttl_seconds: 7_776_000 });
  });

  test('exposes lock rate-limit recovery metadata', async () => {
    fetch.mockResolvedValue(
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
    fetch
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }));

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000003',
    });

    expect(result.acquired).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][1].headers['X-Volcano-Lock-Token']).toBe(
      fetch.mock.calls[1][1].headers['X-Volcano-Lock-Token'],
    );
    expect(fetch.mock.calls[0][1].headers['X-Volcano-Request-Id']).toBe(
      fetch.mock.calls[1][1].headers['X-Volcano-Request-Id'],
    );
  });

  test('withLock releases after callback success and failure', async () => {
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000004');
    fetch
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(204, {}))
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(204, {}));

    const success = await volcano.locks.withLock('leader', { ttl: 10 }, async () => 42);
    expect(success).toEqual({ acquired: true, data: 42, error: null });

    const failure = new Error('callback failed');
    const failed = await volcano.locks.withLock('leader', { ttl: 10 }, async () => {
      throw failure;
    });
    expect(failed.error).toBe(failure);
    expect(fetch.mock.calls.filter((call) => call[1].method === 'DELETE')).toHaveLength(2);
  });

  test('withLock aborts the callback after renewal loses ownership', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000005');
    fetch
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
        signal.addEventListener('abort', () => resolve('stopped'), { once: true });
      });
    });
    await jest.advanceTimersByTimeAsync(1900);
    const result = await pending;

    expect(result.acquired).toBe(true);
    expect(result.data).toBe('stopped');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('Lock ownership lost');
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'PATCH', 'DELETE']);
  });

  test('withLock renews a slow acquisition before running the callback', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000c');
    fetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(response(201, { expires_at: '2026-07-20T12:00:05Z' })), 4000);
          }),
      )
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:00:09Z' }))
      .mockResolvedValueOnce(response(204, {}));
    const methodsSeenByCallback = [];

    const pending = volcano.locks.withLock('leader', { ttl: 5 }, async () => {
      methodsSeenByCallback.push(...fetch.mock.calls.map((call) => call[1].method));
      return 'completed';
    });
    await jest.advanceTimersByTimeAsync(4000);
    const result = await pending;

    expect(methodsSeenByCallback).toEqual(['POST', 'PATCH']);
    expect(result).toEqual({ acquired: true, data: 'completed', error: null });
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'PATCH', 'DELETE']);
  });

  test('withLock cancels a preparatory renewal when the acquired lease expires', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-00000000000d');
    let finishRenewal;
    fetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(response(201, { expires_at: '2026-07-20T12:00:05Z' })), 4000);
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRenewal = resolve;
          }),
      )
      .mockResolvedValueOnce(response(204, {}));
    const callback = jest.fn();

    const pending = volcano.locks.withLock('leader', { ttl: 5 }, callback);
    await jest.advanceTimersByTimeAsync(5000);
    const renewalSignalWasAborted = fetch.mock.calls[1][1].signal.aborted;
    finishRenewal(response(200, { expires_at: '2026-07-20T12:00:10Z' }));
    const result = await pending;

    expect(renewalSignalWasAborted).toBe(true);
    expect(callback).not.toHaveBeenCalled();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('lock lease expired before renewal completed');
  });

  test('renew propagates caller cancellation to the request', async () => {
    const controller = new AbortController();
    fetch.mockImplementationOnce(() => new Promise(() => {}));
    const lease = {
      key: 'leader',
      token: '00000000-0000-4000-8000-00000000000e',
      expiresAt: '2026-07-20T12:00:05Z',
      fencingToken: 1,
    };

    void volcano.locks.renew('leader', lease, { ttl: 5, signal: controller.signal });
    await Promise.resolve();
    controller.abort();

    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
  });

  test('withLock derives renewal cadence from elapsed ttl despite wall-clock skew', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000007');
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementation((values) => {
      values[0] = 0x8000_0000;
      return values;
    });
    fetch
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T11:59:00Z' }))
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:01:00Z' }))
      .mockResolvedValueOnce(response(204, {}));

    let finish;
    const pending = volcano.locks.withLock('leader', { ttl: 60 }, () => {
      return new Promise((resolve) => {
        finish = resolve;
      });
    });

    await jest.advanceTimersByTimeAsync(19_999);
    const earlyRenewals = fetch.mock.calls.filter((call) => call[1].method === 'PATCH').length;
    await jest.advanceTimersByTimeAsync(1);
    const onTimeRenewals = fetch.mock.calls.filter((call) => call[1].method === 'PATCH').length;
    finish('completed');
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
      values[0] = 0x8000_0000;
      return values;
    });
    let finishRenewal;
    fetch
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:05Z' }))
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishRenewal = resolve;
          }),
      )
      .mockResolvedValueOnce(response(204, {}));

    let settled = false;
    const pending = volcano.locks
      .withLock('leader', { ttl: 5 }, ({ signal }) => {
        return new Promise((resolve) => {
          signal.addEventListener('abort', () => resolve('aborted'), { once: true });
          setTimeout(() => resolve('not aborted'), 6000);
        });
      })
      .then((result) => {
        settled = true;
        return result;
      });

    await jest.advanceTimersByTimeAsync(6000);
    const settledBeforeRenewal = settled;
    finishRenewal(response(200, { expires_at: '2026-07-20T12:00:11Z' }));
    const result = await pending;

    expect(settledBeforeRenewal).toBe(true);
    expect(result.data).toBe('aborted');
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe('lock lease expired before renewal completed');
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['POST', 'PATCH', 'DELETE']);
  });

  test('withLock caps long JavaScript timers at one day', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2026-07-20T12:00:00Z'));
    jest.spyOn(global.crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000008');
    jest.spyOn(global.crypto, 'getRandomValues').mockImplementation((values) => {
      values[0] = 0x8000_0000;
      return values;
    });
    fetch
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
    expect(fetch.mock.calls.filter((call) => call[1].method === 'PATCH')).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(1);
    const result = await pending;

    expect(result.error).toBeInstanceOf(Error);
    expect(fetch.mock.calls.filter((call) => call[1].method === 'PATCH')).toHaveLength(1);
  });

  test('preserves the absolute acquisition deadline across renewals', () => {
    jest.spyOn(global.performance, 'now').mockReturnValue(0);
    jest.spyOn(Date, 'now').mockReturnValue(0);
    const ttl = 7_776_000;
    const clock = new LeaseClock(ttl, { monotonic: 0, wall: 0 });
    const nearLimit = ttl * 1000 - 1000;

    performance.now.mockReturnValue(nearLimit);
    Date.now.mockReturnValue(nearLimit);
    clock.reset({ monotonic: nearLimit, wall: nearLimit });

    expect(clock.remaining()).toBe(1000);
  });

  // A renewal must not move the fencing token, or the guarded resource would
  // start rejecting writes from the holder that still owns the lease.
  test('keeps the fencing token when a renewal omits it', async () => {
    fetch
      .mockResolvedValueOnce(
        response(201, { expires_at: '2026-07-20T12:00:10Z', fencing_token: 11 }),
      )
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:00:20Z' }));

    const acquired = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-00000000000a',
    });
    const renewed = await volcano.locks.renew('leader', acquired.lease, { ttl: 10 });

    expect(renewed.lease.fencingToken).toBe(11);
  });

  test('reads lock state and force releases a stuck lock', async () => {
    fetch
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

    expect((await volcano.locks.forceRelease('leader')).error).toBeNull();
    expect(fetch.mock.calls.map((call) => call[1].method)).toEqual(['GET', 'GET', 'DELETE']);
    expect(fetch.mock.calls[0][0]).toContain('/locks/leader');
    expect(fetch.mock.calls[0][0]).not.toContain('/lease');
    expect(fetch.mock.calls[0][1].headers['X-Volcano-Request-Id']).toBe(
      '20000000-0000-4000-8000-000000000001',
    );
    expect(fetch.mock.calls[0][1].headers['X-Volcano-Lock-Token']).toBeUndefined();
  });

  test('surfaces errors from the read and force release routes', async () => {
    fetch
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
    await expect(volcano.locks.release('leader', { key: 'other', token: 'token' })).rejects.toThrow(
      'lease must belong',
    );
    await expect(volcano.locks.get('../leader')).rejects.toThrow('lock key');
    await expect(volcano.locks.forceRelease('../leader')).rejects.toThrow('lock key');
    expect(fetch).not.toHaveBeenCalled();
  });
});
