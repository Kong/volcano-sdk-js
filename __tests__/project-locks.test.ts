/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import type { ProjectLockLease } from '../src/index.ts';
import { type LockClient, ProjectLocksApi } from '../src/project-locks.ts';

const LEASE_DATA = { expires_at: '2026-09-23T12:00:30Z', fencing_token: 7 };
const GENERATED_ID = '00000000-0000-4000-8000-000000000000';

function fixture() {
  let token: string | null = 'first-session';
  const acquire = jest.fn<LockClient['_transport']['acquireProjectLock']>();
  const release = jest.fn<LockClient['_transport']['releaseProjectLock']>();
  const fetch = jest.fn<LockClient['_authFetch']>();
  const exchange = jest.fn<LockClient['_completeOAuthExchange']>();
  const options = jest.fn<LockClient['_generatedOptions']>();
  acquire.mockResolvedValue({ data: LEASE_DATA });
  release.mockImplementation(() => Promise.resolve());
  fetch.mockResolvedValue({ ok: true, status: 200, data: LEASE_DATA, error: null });
  exchange.mockImplementation(() => Promise.resolve());
  options.mockImplementation((mode, headers) => ({ mode, headers }));
  const client: LockClient = {
    get accessToken() {
      return token;
    },
    _transport: { acquireProjectLock: acquire, releaseProjectLock: release },
    _authFetch: fetch,
    _completeOAuthExchange: exchange,
    _generatedOptions: options,
  };
  return {
    locks: new ProjectLocksApi(client),
    acquire,
    release,
    fetch,
    exchange,
    options,
    setToken(next: string | null) {
      token = next;
    },
  };
}

function lease(): ProjectLockLease {
  return { key: 'leader', token: 'owner', expiresAt: null, fencingToken: 3 };
}

test('acquire captures one credential, token and request id across a retry', async () => {
  const given = fixture();
  given.acquire.mockImplementationOnce(() => {
    given.setToken('replacement-session');
    return Promise.reject(new Error('response lost'));
  });
  const result = await given.locks.acquire('lock:key', {
    ttl: 30,
    token: 'owner',
    requestId: 'operation',
  });
  expect(result).toEqual({
    acquired: true,
    lease: {
      key: 'lock:key',
      token: 'owner',
      expiresAt: LEASE_DATA.expires_at,
      fencingToken: 7,
    },
    error: null,
  });
  expect(given.exchange).toHaveBeenCalledTimes(1);
  expect(given.acquire).toHaveBeenCalledTimes(2);
  expect(given.acquire).toHaveBeenCalledWith(
    'lock%3Akey',
    { ttl_seconds: 30 },
    {
      mode: 'anon',
      headers: {
        Authorization: 'Bearer first-session',
        'X-Volcano-Lock-Token': 'owner',
        'X-Volcano-Request-Id': 'operation',
      },
    },
  );
  expect(given.acquire.mock.calls[0]?.[2]).toBe(given.acquire.mock.calls[1]?.[2]);
});

test('acquire generates identifiers for omitted and empty options', async () => {
  const given = fixture();
  const random = jest.spyOn(crypto, 'randomUUID').mockReturnValue(GENERATED_ID);
  try {
    await given.locks.acquire('leader', { ttl: 5, token: '', requestId: '' });
    expect(random).toHaveBeenCalledTimes(2);
    expect(given.options).toHaveBeenCalledWith('anon', {
      Authorization: 'Bearer first-session',
      'X-Volcano-Lock-Token': GENERATED_ID,
      'X-Volcano-Request-Id': GENERATED_ID,
    });
    await given.locks.acquire('leader', { ttl: 5 });
    expect(random).toHaveBeenCalledTimes(4);
  } finally {
    random.mockRestore();
  }
});

test('acquire preserves a 503 retry and a final transport error', async () => {
  const given = fixture();
  const failure = Object.assign(new Error('unavailable'), { status: 503 });
  given.acquire.mockRejectedValue(failure);
  const result = await given.locks.acquire('leader', { ttl: 5 });
  expect(given.acquire).toHaveBeenCalledTimes(2);
  expect(result).toMatchObject({ acquired: false, error: failure });
  expect(result.lease?.expiresAt).toBeNull();
});

test.each(['lock_held', 'lock_ownership_lost'])(
  'maps contention code %s to an unavailable lock',
  async (code) => {
    const given = fixture();
    given.acquire.mockRejectedValue(
      Object.assign(new Error('held'), { status: 409, info: { code } }),
    );
    await expect(given.locks.acquire('leader', { ttl: 5 })).resolves.toEqual({
      acquired: false,
      lease: null,
      error: null,
    });
    expect(given.acquire).toHaveBeenCalledTimes(1);
  },
);

test.each([
  Object.assign(new Error('bad request'), { status: 400 }),
  Object.assign(new Error('unknown code'), { status: 409, info: { code: 'other' } }),
  Object.assign(new Error('missing code'), { status: 409, info: {} }),
  Object.assign(new Error('bad info'), { status: 409, info: null }),
  Object.assign(new Error('bad status'), { status: '409' }),
])('does not hide a non-contention error: %s', async (failure) => {
  const given = fixture();
  given.acquire.mockRejectedValue(failure);
  const result = await given.locks.acquire('leader', { ttl: 5 });
  expect(result.error).toBe(failure);
});

test('normalizes a non-Error transport failure', async () => {
  const given = fixture();
  given.acquire.mockRejectedValue('network');
  await expect(given.locks.acquire('leader', { ttl: 5 })).resolves.toMatchObject({
    acquired: false,
    error: new Error('Lock acquisition failed'),
  });
});

test.each([null, {}, { expires_at: null }, { expires_at: 'later', fencing_token: 'bad' }])(
  'rejects an invalid acquisition response: %p',
  async (data) => {
    const given = fixture();
    given.acquire.mockResolvedValue({ data });
    await expect(given.locks.acquire('leader', { ttl: 5 })).rejects.toThrow(TypeError);
  },
);

test('renews the same lease with an explicit cancellation signal', async () => {
  const given = fixture();
  const previous = lease();
  const controller = new AbortController();
  const result = await given.locks.renew('leader', previous, {
    ttl: 5,
    requestId: 'renew-id',
    signal: controller.signal,
  });
  expect(result).toEqual({ lease: previous, error: null });
  expect(previous.expiresAt).toBe(LEASE_DATA.expires_at);
  expect(previous.fencingToken).toBe(7);
  expect(given.fetch).toHaveBeenCalledWith('/locks/leader/lease', {
    method: 'PATCH',
    headers: { 'X-Volcano-Lock-Token': 'owner', 'X-Volcano-Request-Id': 'renew-id' },
    body: JSON.stringify({ ttl_seconds: 5 }),
    signal: controller.signal,
  });
});

test('renewal keeps the prior fencing token when the response omits it', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue({
    ok: true,
    status: 200,
    data: { expires_at: 'later' },
    error: null,
  });
  const previous = lease();
  await given.locks.renew('leader', previous, { ttl: 5 });
  expect(previous.fencingToken).toBe(3);
  expect(given.fetch.mock.calls[0]?.[1]).not.toHaveProperty('signal');
});

test('renewal returns a server error without changing the lease', async () => {
  const given = fixture();
  const failure = new Error('lost');
  given.fetch.mockResolvedValue({ ok: false, status: 503, data: null, error: failure });
  const previous = lease();
  await expect(given.locks.renew('leader', previous, { ttl: 5 })).resolves.toEqual({
    lease: previous,
    error: failure,
  });
  expect(previous.expiresAt).toBeNull();
});

test('release carries the ownership token and preserves transport errors', async () => {
  const given = fixture();
  const previous = lease();
  await expect(
    given.locks.release('leader', previous, { requestId: 'release-id' }),
  ).resolves.toEqual({
    error: null,
  });
  expect(given.release).toHaveBeenCalledWith('leader', {
    mode: 'session',
    headers: { 'X-Volcano-Lock-Token': 'owner', 'X-Volcano-Request-Id': 'release-id' },
  });
  const failure = new Error('offline');
  given.release.mockRejectedValueOnce(failure).mockRejectedValueOnce('unknown');
  await expect(given.locks.release('leader', previous)).resolves.toEqual({ error: failure });
  await expect(given.locks.release('leader', previous)).resolves.toEqual({
    error: new Error('Lock release failed'),
  });
});

test('get validates lock state and reports a failed request', async () => {
  const given = fixture();
  given.fetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    data: { held: true, expires_at: 'later', fencing_token: 8 },
    error: null,
  });
  await expect(given.locks.get('leader', { requestId: 'get-id' })).resolves.toEqual({
    state: { held: true, expiresAt: 'later', fencingToken: 8 },
    error: null,
  });
  expect(given.fetch).toHaveBeenCalledWith('/locks/leader', {
    method: 'GET',
    headers: { 'X-Volcano-Request-Id': 'get-id' },
  });
  given.fetch.mockResolvedValueOnce({ ok: true, status: 200, data: {}, error: null });
  await expect(given.locks.get('leader')).resolves.toEqual({
    state: { held: false, expiresAt: null, fencingToken: null },
    error: null,
  });
  const failure = new Error('refused');
  given.fetch.mockResolvedValueOnce({ ok: false, status: 503, data: null, error: failure });
  await expect(given.locks.get('leader')).resolves.toEqual({ state: null, error: failure });
});

test.each([null, { expires_at: 42 }, { fencing_token: 'bad' }])(
  'rejects a malformed lock state: %p',
  async (data) => {
    const given = fixture();
    given.fetch.mockResolvedValue({ ok: true, status: 200, data, error: null });
    await expect(given.locks.get('leader')).rejects.toThrow(TypeError);
  },
);

test('force release preserves a success or failure result', async () => {
  const given = fixture();
  await expect(given.locks.forceRelease('leader', { requestId: 'forced' })).resolves.toEqual({
    error: null,
  });
  expect(given.fetch).toHaveBeenCalledWith('/locks/leader', {
    method: 'DELETE',
    headers: { 'X-Volcano-Request-Id': 'forced' },
  });
  const failure = new Error('denied');
  given.fetch.mockResolvedValueOnce({ ok: false, status: 403, data: null, error: failure });
  await expect(given.locks.forceRelease('leader')).resolves.toEqual({ error: failure });
});

test('withLock releases after the callback and returns its data', async () => {
  const given = fixture();
  const result = await given.locks.withLock('leader', { ttl: 10 }, ({ signal, lease: held }) => {
    expect(signal.aborted).toBe(false);
    expect(held.token).toBeTruthy();
    return 'complete';
  });
  expect(result).toEqual({ acquired: true, data: 'complete', error: null });
  expect(given.release).toHaveBeenCalledTimes(1);
});

test('withLock returns an unavailable result without running a callback', async () => {
  const given = fixture();
  given.acquire.mockRejectedValue(
    Object.assign(new Error('held'), { status: 409, info: { code: 'lock_held' } }),
  );
  const callback = jest.fn<() => string>();
  await expect(given.locks.withLock('leader', { ttl: 5 }, callback)).resolves.toEqual({
    acquired: false,
    data: null,
    error: null,
  });
  expect(callback).not.toHaveBeenCalled();
});

test('withLock rejects a callback that is not a function', async () => {
  const given = fixture();
  const method: unknown = given.locks.withLock.bind(given.locks);
  if (typeof method !== 'function') {
    throw new TypeError('withLock is missing');
  }
  const outcome: unknown = Reflect.apply(method, given.locks, ['leader', { ttl: 5 }, null]);
  await expect(outcome).rejects.toThrow('callback must be a function');
});
