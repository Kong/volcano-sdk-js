/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { expectPresent } from './support/assertions.ts';
import { headerAt, methodAt, response, textBodyAt } from './support/locks-fixtures.ts';

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

function acquiresAndReleases(): void {
  test('acquires, renews, and releases with the ownership token', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z', fencing_token: 4 }))
      .mockResolvedValueOnce(response(200, { expires_at: '2026-07-20T12:00:20Z', fencing_token: 4 }))
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
    expectPresent(acquired.lease);

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
    const requestIDs = fetchMock.mock.calls.map((_call, index) => headerAt(index, 'X-Volcano-Request-Id'));
    expect(requestIDs).toEqual([
      '10000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000003',
    ]);
  });
}

function retriesAcquire(): void {
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
}

function mapsContention(): void {
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
    fetchMock.mockResolvedValue(response(409, { error: 'Lock ownership lost', code: 'lock_ownership_lost' }));

    const result = await volcano.locks.acquire('leader', {
      ttl: 10,
      token: '00000000-0000-4000-8000-000000000002',
    });

    expect(result).toEqual({ acquired: false, lease: null, error: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
}

describe('project locks', () => {
  acquiresAndReleases();
  retriesAcquire();
  mapsContention();
});
