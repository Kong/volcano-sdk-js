/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index';
import type { ProjectLockLease } from '../src/index.js';
import { applyLockLeaseResponse } from '../src/lock-lease-response.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

function lease(): ProjectLockLease {
  return { key: 'leader', token: 'owner', expiresAt: null, fencingToken: null };
}

test('applies a complete lease response', () => {
  const current = lease();
  applyLockLeaseResponse(current, { expires_at: '2026-09-22T00:00:00Z', fencing_token: 0 });
  expect(current).toEqual({
    key: 'leader',
    token: 'owner',
    expiresAt: '2026-09-22T00:00:00Z',
    fencingToken: 0,
  });
});

test('accepts an RFC 3339 expiry with a UTC offset', () => {
  const current = lease();
  applyLockLeaseResponse(current, {
    expires_at: '2026-09-22T00:00:00.123+00:00',
    fencing_token: 1,
  });
  expect(current.expiresAt).toBe('2026-09-22T00:00:00.123+00:00');
});

test.each([
  null,
  'not an object',
  {},
  { expires_at: null, fencing_token: 7 },
  { expires_at: ' ', fencing_token: 7 },
  { expires_at: 'not-a-date', fencing_token: 7 },
  { expires_at: '2026-09-22', fencing_token: 7 },
  { expires_at: '09/22/2026', fencing_token: 7 },
  { expires_at: '2026-02-31T00:00:00Z', fencing_token: 7 },
  { expires_at: '2026-09-22T00:00:00+03:00', fencing_token: 7 },
  { expires_at: '2026-09-22T00:00:00Z', fencing_token: '7' },
  { expires_at: '2026-09-22T00:00:00Z', fencing_token: 1.5 },
  { expires_at: '2026-09-22T00:00:00Z', fencing_token: -1 },
])('rejects an incomplete lease response without partially changing the lease: %p', (payload) => {
  const current = lease();
  expect(() => {
    applyLockLeaseResponse(current, payload);
  }).toThrow(new TypeError('Expected a complete lock response'));
  expect(current).toEqual(lease());
});

test.each([undefined, null])(
  'keeps the current fencing token when the response omits it',
  (token) => {
    const current = lease();
    current.fencingToken = 7;
    applyLockLeaseResponse(current, { expires_at: '2026-09-22T00:00:00Z', fencing_token: token });
    expect(current.fencingToken).toBe(7);
  },
);

test.each([undefined, null])('requires a fencing token for a new lease: %p', (token) => {
  const current = lease();
  expect(() => {
    applyLockLeaseResponse(current, { expires_at: '2026-09-22T00:00:00Z', fencing_token: token });
  }).toThrow(new TypeError('Expected a complete lock response'));
  expect(current).toEqual(lease());
});

test('rejects a changed fencing token on renewal without mutating the lease', () => {
  const current = lease();
  current.fencingToken = 7;
  expect(() => {
    applyLockLeaseResponse(current, { expires_at: '2026-09-22T00:00:00Z', fencing_token: 8 });
  }).toThrow(new TypeError('Expected a complete lock response'));
  expect(current).toEqual({ ...lease(), fencingToken: 7 });
});

test('acquisition releases a malformed lease with its captured credential', async () => {
  const client = new VolcanoAuth({ anonKey: 'ak-project', accessToken: 'sk-service-role' });
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  fetchMock
    .mockImplementationOnce(() => {
      Object.defineProperty(client, 'accessToken', { value: 'sk-replacement', writable: true });
      return Promise.resolve(
        Response.json({ expires_at: '2026-09-22T00:00:00Z' }, { status: 201 }),
      );
    })
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const result = await client.locks.acquire('leader', { ttl: 10 });
  expect(result).toMatchObject({ acquired: false, lease: null });
  expect(result.error).toBeInstanceOf(TypeError);
  expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
    method: 'DELETE',
    headers: { Authorization: 'Bearer sk-service-role' },
  });
});

test('a failed cleanup leaves a recoverable lease on direct and scoped acquisition', async () => {
  const fetchMock = jest.spyOn(globalThis, 'fetch');
  fetchMock
    .mockResolvedValueOnce(Response.json({ expires_at: '2026-09-22' }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));
  const client = new VolcanoAuth({ anonKey: 'ak-project', accessToken: 'sk-service-role' });
  const direct = await client.locks.acquire('leader', { ttl: 10 });
  expect(direct.acquired).toBe(false);
  expect(direct.error).toMatchObject({ lease: direct.lease, cause: expect.any(Error) });

  fetchMock
    .mockResolvedValueOnce(Response.json({ expires_at: '2026-09-22' }, { status: 201 }))
    .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));
  const scoped = await client.locks.withLock('leader', { ttl: 10 }, () => true);
  expect(scoped.acquired).toBe(false);
  expect(scoped.error).toMatchObject({ lease: { token: expect.any(String) } });
  expect(scoped.error).toBeInstanceOf(TypeError);
});

test('renewal rejects an invalid response without changing the existing lease', async () => {
  jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(
      Response.json(
        { expires_at: '2026-09-22T00:00:00Z', fencing_token: 'seven' },
        { status: 200 },
      ),
    );
  const client = new VolcanoAuth({ anonKey: 'ak-project', accessToken: 'sk-service-role' });
  const current = lease();
  current.fencingToken = 7;
  await expect(client.locks.renew('leader', current, { ttl: 10 })).rejects.toThrow(
    'Expected a complete lock response',
  );
  expect(current).toEqual({ ...lease(), fencingToken: 7 });
});
