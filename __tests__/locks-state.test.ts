/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { fetchCall, headerAt, methodsSeen, response, textBodyAt } from './support/locks-fixtures.ts';

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

function checksLeases(): void {
  test('accepts the 90 day maximum TTL', async () => {
    fetchMock.mockResolvedValue(response(201, { expires_at: '2026-10-18T12:00:00Z' }));

    const result = await volcano.locks.acquire('long-running-leader', {
      ttl: 7_776_000,
      token: '00000000-0000-4000-8000-000000000006',
    });

    expect(result.acquired).toBe(true);
    expect(JSON.parse(textBodyAt(0))).toEqual({ ttl_seconds: 7_776_000 });
  });

  // A renewal must not move the fencing token, or the guarded resource would
  // start rejecting writes from the holder that still owns the lease.
  test('keeps the fencing token when a renewal omits it', async () => {
    fetchMock
      .mockResolvedValueOnce(response(201, { expires_at: '2026-07-20T12:00:10Z', fencing_token: 11 }))
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

  test('validates keys, TTLs, and lease ownership before network calls', async () => {
    await expect(volcano.locks.acquire('../leader', { ttl: 10 })).rejects.toThrow('lock key');
    await expect(volcano.locks.acquire('leader', { ttl: 4 })).rejects.toThrow('ttl');
    await expect(volcano.locks.acquire('leader', { ttl: 7_776_001 })).rejects.toThrow('ttl');
    const invalidRelease: unknown = Reflect.apply(volcano.locks.release.bind(volcano.locks), undefined, [
      'leader',
      { key: 'other', token: 'token' },
    ]);
    await expect(invalidRelease).rejects.toThrow('lease must belong');
    await expect(volcano.locks.get('../leader')).rejects.toThrow('lock key');
    await expect(volcano.locks.forceRelease('../leader')).rejects.toThrow('lock key');
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

function surfacesErrors(): void {
  test('exposes lock rate-limit recovery metadata', async () => {
    fetchMock.mockResolvedValue(
      response(429, { error: 'lock request limit exceeded', code: 'lock_rate_limited' }, { 'retry-after': '42' }),
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
}

function readsLockState(): void {
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
}

describe('project locks', () => {
  checksLeases();
  surfacesErrors();
  readsLockState();
});
