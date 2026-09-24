/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import type { ProjectLockLease } from '../src/index.js';
import { type LockClient, ProjectLocksApi } from '../src/project-locks.ts';

const lease: ProjectLockLease = {
  key: 'leader',
  token: 'owner',
  expiresAt: null,
  fencingToken: 1,
};

function fixture(): {
  api: ProjectLocksApi;
  acquire: ReturnType<typeof jest.fn<LockClient['_transport']['acquireProjectLock']>>;
  release: ReturnType<typeof jest.fn<LockClient['_transport']['releaseProjectLock']>>;
  authFetch: ReturnType<typeof jest.fn<LockClient['_authFetch']>>;
} {
  const acquire = jest.fn<LockClient['_transport']['acquireProjectLock']>().mockResolvedValue({
    data: { expires_at: '2026-09-24T12:00:00Z', fencing_token: 1 },
  });
  const release = jest.fn<LockClient['_transport']['releaseProjectLock']>().mockResolvedValue({});
  const authFetch = jest.fn<LockClient['_authFetch']>().mockResolvedValue({
    ok: true,
    status: 200,
    data: { held: false, expires_at: null, fencing_token: null },
    error: null,
  });
  const client: LockClient = {
    accessToken: 'access',
    _transport: { acquireProjectLock: acquire, releaseProjectLock: release },
    _completeOAuthExchange: jest.fn(() => Promise.resolve()),
    _generatedOptions: jest.fn(() => ({})),
    _authFetch: authFetch,
  };
  return { api: new ProjectLocksApi(client), acquire, release, authFetch };
}

test('acquisition bounds retries and normalizes non-Error failures', async () => {
  const { api, acquire } = fixture();
  acquire.mockRejectedValue('transport failed');

  const result = await api.acquire('leader', { ttl: 10, token: 'owner', requestId: 'request' });
  expect(result).toMatchObject({ acquired: false, error: new Error('Lock acquisition failed') });
  expect(acquire).toHaveBeenCalledTimes(2);
});

test('a contention code on a different HTTP status remains an error', async () => {
  const { api, acquire } = fixture();
  const error = Object.assign(new Error('bad request'), {
    status: 400,
    info: { code: 'lock_held' },
  });
  acquire.mockRejectedValue(error);
  const result = await api.acquire('leader', { ttl: 10 });
  expect(result).toMatchObject({ acquired: false, error });
  expect(acquire).toHaveBeenCalledTimes(1);
});

test.each([
  [null, 'Lock response has no expiration'],
  [42, 'Lock response has no expiration'],
  [{ expires_at: 42 }, 'Lock response has no expiration'],
  [{ expires_at: 'valid', fencing_token: 'wrong' }, 'Lock response has an invalid fencing token'],
])('rejects malformed acquired lease %p', async (data, message) => {
  const { api, acquire } = fixture();
  acquire.mockResolvedValue({ data });
  await expect(api.acquire('leader', { ttl: 10 })).rejects.toThrow(message);
});

test.each([
  [null, 'Lock state response is not an object'],
  [42, 'Lock state response is not an object'],
  [{ held: true, expires_at: 42 }, 'Lock state has an invalid expiration'],
  [{ held: true, fencing_token: 'wrong' }, 'Lock state has an invalid fencing token'],
])('rejects malformed lock state %p', async (data, message) => {
  const { api, authFetch } = fixture();
  authFetch.mockResolvedValue({ ok: true, status: 200, data, error: null });
  await expect(api.get('leader')).rejects.toThrow(message);
});

test('accepts absent optional state fields while preserving explicit nulls', async () => {
  const { api, authFetch } = fixture();
  authFetch.mockResolvedValueOnce({ ok: true, status: 200, data: { held: true }, error: null });
  authFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: { held: true, expires_at: null, fencing_token: null },
    error: null,
  });
  await expect(api.get('leader')).resolves.toEqual({
    state: { held: true, expiresAt: null, fencingToken: null },
    error: null,
  });
  await expect(api.get('leader')).resolves.toEqual({
    state: { held: true, expiresAt: null, fencingToken: null },
    error: null,
  });
});

test('a successful renewal validates the returned lease fields', async () => {
  const { api, authFetch } = fixture();
  authFetch.mockResolvedValue({ ok: true, status: 200, data: null, error: null });
  await expect(api.renew('leader', { ...lease }, { ttl: 10 })).rejects.toThrow(
    'Lock response has no expiration',
  );
});

test('withLock refuses inconsistent acquisition results without invoking the callback', async () => {
  const { api } = fixture();
  const callback = jest.fn(() => 'done');
  jest.spyOn(api, 'acquire').mockResolvedValueOnce({ acquired: true, lease: null, error: null });
  await expect(api.withLock('leader', { ttl: 10 }, callback)).resolves.toEqual({
    acquired: true,
    data: null,
    error: null,
  });
  const error = new Error('inconsistent');
  jest.spyOn(api, 'acquire').mockResolvedValueOnce({ acquired: true, lease, error });
  await expect(api.withLock('leader', { ttl: 10 }, callback)).resolves.toEqual({
    acquired: true,
    data: null,
    error,
  });
  expect(callback).not.toHaveBeenCalled();
});
