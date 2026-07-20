const VolcanoAuth = require('../src/index.js');

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
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
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z' }))
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:00:20Z' }))
      .mockResolvedValueOnce(response(204, {}));

    const acquired = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000001',
    });
    expect(acquired).toEqual({
      acquired: true,
      lease: {
        key: 'leader',
        token: '00000000-0000-4000-8000-000000000001',
        expiresAt: '2026-07-20T12:00:10Z',
      },
      error: null,
    });

    const renewed = await volcano.locks.renew('leader', acquired.lease, { ttl: 10 });
    expect(renewed.error).toBeNull();
    expect(renewed.lease.expiresAt).toBe('2026-07-20T12:00:20Z');
    expect((await volcano.locks.release('leader', acquired.lease)).error).toBeNull();

    expect(fetch.mock.calls[0][1].headers['X-Volcano-Lock-Token']).toBe(acquired.lease.token);
    expect(fetch.mock.calls[1][1].method).toBe('PATCH');
    expect(fetch.mock.calls[2][1].method).toBe('DELETE');
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

  test('accepts the 90 day maximum TTL', async () => {
    fetch.mockResolvedValue(response(201, { expires_at: '2026-10-18T12:00:00Z' }));

    const result = await volcano.locks.acquire('long-running-leader', {
      ttl: 7_776_000,
      token: '00000000-0000-4000-8000-000000000006',
    });

    expect(result.acquired).toBe(true);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ ttl_seconds: 7_776_000 });
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

  test('validates keys, TTLs, and lease ownership before network calls', async () => {
    await expect(volcano.locks.acquire('../leader', { ttl: 10 })).rejects.toThrow('lock key');
    await expect(volcano.locks.acquire('leader', { ttl: 4 })).rejects.toThrow('ttl');
    await expect(volcano.locks.acquire('leader', { ttl: 7_776_001 })).rejects.toThrow('ttl');
    await expect(volcano.locks.release('leader', { key: 'other', token: 'token' })).rejects.toThrow(
      'lease must belong',
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
