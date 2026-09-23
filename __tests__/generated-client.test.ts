/** @jest-environment node */
import { expect, jest, test } from '@jest/globals';
import type { operations } from '../src/generated/openapi.d.ts';
import { VolcanoAuth, VolcanoClient } from '../src/index.js';

function requestAt(index: number): { url: string; options: RequestInit } {
  const call = jest.mocked(globalThis.fetch).mock.calls[index];
  if (call === undefined || typeof call[0] !== 'string' || call[1] === undefined) {
    throw new TypeError(`Expected an HTTP request at index ${String(index)}`);
  }
  return { url: call[0], options: call[1] };
}

function jsonBody(options: RequestInit): unknown {
  if (typeof options.body !== 'string') {
    throw new TypeError('Expected a JSON request body');
  }
  const parsed: unknown = JSON.parse(options.body);
  return parsed;
}

function jsonResponse(data: unknown, status: number): Response {
  return Response.json(data, { status });
}

test('VolcanoClient remains the preferred alias for VolcanoAuth', () => {
  expect(VolcanoClient).toBe(VolcanoAuth);
});

test('the six contract operations preserve generated HTTP requests and response envelopes', async () => {
  const user = {
    id: 'user-123',
    email: 'contract@example.com',
    status: 'active',
    created_at: '2026-08-26T12:00:00Z',
    updated_at: '2026-08-26T12:00:00Z',
  } satisfies operations['authSignin']['responses'][200]['content']['application/json']['user'];
  const session = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
  };
  const signInPayload = {
    user,
    ...session,
    token_type: 'bearer',
  } satisfies operations['authSignin']['responses'][200]['content']['application/json'];
  const row = { slug: 'contract-row', value: 'fixture-value' };
  const selectPayload = {
    data: [row],
    count: 1,
  } satisfies operations['queryDatabaseSelect']['responses'][200]['content']['application/json'];
  const uploaded = {
    id: 'object-123',
    bucket_id: 'bucket-123',
    name: 'contract/object.bin',
    is_public: false,
    size: 5,
    mime_type: 'application/octet-stream',
  } satisfies operations['uploadStorageObject']['responses'][201]['content']['application/json'];
  const leasePayload = {
    expires_at: '2026-08-26T12:00:10Z',
    fencing_token: 7,
  } satisfies operations['acquireProjectLock']['responses'][201]['content']['application/json'];
  const bytes = new Uint8Array([0, 127, 255]);
  const fetchMock = jest.mocked(globalThis.fetch);
  fetchMock
    .mockResolvedValueOnce(jsonResponse(signInPayload, 200))
    .mockResolvedValueOnce(jsonResponse(selectPayload, 200))
    .mockResolvedValueOnce(jsonResponse(uploaded, 201))
    .mockResolvedValueOnce(
      new Response(bytes, { status: 200, headers: { 'Content-Type': 'application/octet-stream' } }),
    )
    .mockResolvedValueOnce(jsonResponse(leasePayload, 201))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));

  const volcano = new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-contract' });
  await expect(
    volcano.auth.signIn({ email: 'contract@example.com', password: 'correct-password' }),
  ).resolves.toEqual({ user, session, error: null });
  volcano.database('contract database');
  await expect(
    volcano.from('contract_table').select('*').eq('slug', 'contract-row'),
  ).resolves.toEqual({ data: [row], count: 1, error: null });

  const file = new File([bytes], 'object.bin', { type: 'application/octet-stream' });
  await expect(
    volcano.storage.from('contract bucket').upload('contract/object name.bin', file),
  ).resolves.toEqual({ data: uploaded, error: null });
  const download = await volcano.storage
    .from('contract bucket')
    .download('contract/object name.bin');
  expect(download.error).toBeNull();
  expect(download.data).toBeInstanceOf(Blob);
  if (!(download.data instanceof Blob)) {
    throw new TypeError('Expected a binary download');
  }
  expect(new Uint8Array(await download.data.arrayBuffer())).toEqual(bytes);

  const lockOptions = {
    ttl: 10,
    token: '00000000-0000-4000-8000-000000000001',
    requestId: '10000000-0000-4000-8000-000000000001',
  };
  const acquired = await volcano.locks.acquire('contract:lock', lockOptions);
  expect(acquired).toEqual({
    acquired: true,
    lease: {
      key: 'contract:lock',
      token: lockOptions.token,
      expiresAt: leasePayload.expires_at,
      fencingToken: leasePayload.fencing_token,
    },
    error: null,
  });
  if (acquired.lease === null) {
    throw new TypeError('Expected an acquired lock lease');
  }
  await expect(
    volcano.locks.release('contract:lock', acquired.lease, {
      requestId: '10000000-0000-4000-8000-000000000002',
    }),
  ).resolves.toEqual({ error: null });

  expect(fetchMock).toHaveBeenCalledTimes(6);
  const signInRequest = requestAt(0);
  expect(signInRequest.url).toBe('https://api.test.com/auth/signin');
  expect(signInRequest.options.method).toBe('POST');
  expect(jsonBody(signInRequest.options)).toEqual({
    email: 'contract@example.com',
    password: 'correct-password',
  } satisfies operations['authSignin']['requestBody']['content']['application/json']);
  expect(new Headers(signInRequest.options.headers).get('Authorization')).toBe(
    'Bearer ak-contract',
  );

  const selectRequest = requestAt(1);
  expect(selectRequest.url).toBe('https://api.test.com/databases/contract%20database/query/select');
  expect(selectRequest.options.method).toBe('POST');
  expect(jsonBody(selectRequest.options)).toEqual({
    table: 'contract_table',
    filters: [{ column: 'slug', operator: 'eq', value: 'contract-row' }],
  } satisfies operations['queryDatabaseSelect']['requestBody']['content']['application/json']);
  expect(new Headers(selectRequest.options.headers).get('Authorization')).toBe(
    'Bearer access-token',
  );

  const uploadRequest = requestAt(2);
  expect(uploadRequest.url).toBe(
    'https://api.test.com/storage/contract%20bucket/contract/object%20name.bin',
  );
  expect(uploadRequest.options.method).toBe('POST');
  expect(new Headers(uploadRequest.options.headers).get('Authorization')).toBe(
    'Bearer access-token',
  );
  const uploadBody = uploadRequest.options.body;
  if (!(uploadBody instanceof FormData)) {
    throw new TypeError('Expected a multipart upload');
  }
  expect(uploadBody.get('file')).toEqual(file);

  const downloadRequest = requestAt(3);
  expect(downloadRequest.url).toBe(uploadRequest.url);
  expect(downloadRequest.options.method).toBe('GET');
  expect(new Headers(downloadRequest.options.headers).get('Authorization')).toBe(
    'Bearer access-token',
  );

  const acquireRequest = requestAt(4);
  expect(acquireRequest.url).toBe('https://api.test.com/locks/contract%3Alock/lease');
  expect(acquireRequest.options.method).toBe('POST');
  expect(jsonBody(acquireRequest.options)).toEqual({
    ttl_seconds: 10,
  } satisfies operations['acquireProjectLock']['requestBody']['content']['application/json']);
  const acquireHeaders = new Headers(acquireRequest.options.headers);
  expect(acquireHeaders.get('Authorization')).toBe('Bearer access-token');
  expect(acquireHeaders.get('X-Volcano-Lock-Token')).toBe(lockOptions.token);
  expect(acquireHeaders.get('X-Volcano-Request-Id')).toBe(lockOptions.requestId);

  const releaseRequest = requestAt(5);
  expect(releaseRequest.url).toBe('https://api.test.com/locks/contract%3Alock/lease');
  expect(releaseRequest.options.method).toBe('DELETE');
  const releaseHeaders = new Headers(releaseRequest.options.headers);
  expect(releaseHeaders.get('Authorization')).toBe('Bearer access-token');
  expect(releaseHeaders.get('X-Volcano-Lock-Token')).toBe(lockOptions.token);
  expect(releaseHeaders.get('X-Volcano-Request-Id')).toBe('10000000-0000-4000-8000-000000000002');
});
