/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { type StorageAuthHost, StorageFileApi } from '../src/storage-file.ts';
import {
  completedUpload,
  storageObject,
  uploadPart,
  uploadSession,
  uploadStatus,
} from './storage-response-fixtures.ts';

type Upload = StorageAuthHost['_transport']['uploadStorageObject'];
type Download = StorageAuthHost['_transport']['downloadStorageObject'];

const apiUrl = 'https://api.volcano.dev';
const anonKey = `header.${Buffer.from(JSON.stringify({ project_id: 'project-1' })).toString('base64url')}.signature`;

interface Fixture {
  api: StorageFileApi;
  host: StorageAuthHost;
  fetch: jest.MockedFunction<typeof fetch>;
  upload: jest.Mock<Upload>;
  download: jest.Mock<Download>;
}

function fixture(accessToken: string | null = 'token', bucketName = 'bucket'): Fixture {
  const request = jest.fn<typeof fetch>();
  globalThis.fetch = request;
  const upload = jest.fn<Upload>();
  const download = jest.fn<Download>();
  upload.mockResolvedValue({ data: storageObject() });
  download.mockResolvedValue({ data: new Blob(['data']) });
  const host: StorageAuthHost = {
    apiUrl,
    anonKey,
    timeout: 1000,
    accessToken,
    _oauthExchangeError: null,
    _transport: { uploadStorageObject: upload, downloadStorageObject: download },
    _generatedOptions(mode, headers, responseType) {
      return { volcanoAuthorization: mode, headers, responseType };
    },
    _completeOAuthExchange: () => Promise.resolve(),
    _captureAuthContext() {
      return { accessToken: this.accessToken };
    },
    _refreshSessionForContext: () => Promise.resolve({ error: new Error('refresh unavailable') }),
    _isAuthContextCurrent() {
      return true;
    },
  };
  return { api: new StorageFileApi(host, bucketName), host, fetch: request, upload, download };
}

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('builds a bucket-scoped URL while preserving slash-separated paths', () => {
  const given = fixture();
  expect(given.api.bucketName).toBe('bucket');
  expect(given.api._buildUrl('one/two words.txt')).toBe(
    `${apiUrl}/storage/bucket/one/two%20words.txt`,
  );
});

test('authentication completes OAuth before accepting the access token', async () => {
  const given = fixture(null);
  const exchange = jest.spyOn(given.host, '_completeOAuthExchange');
  await expect(given.api._checkAuth()).resolves.toMatchObject({
    error: { message: 'No active session. Please sign in first.' },
  });
  expect(exchange).toHaveBeenCalledTimes(1);
});

test('authentication preserves a pending OAuth error', async () => {
  const given = fixture(null);
  Object.assign(given.host, { _oauthExchangeError: 'OAuth exchange failed' });
  await expect(given.api._checkAuth()).resolves.toMatchObject({
    error: { message: 'OAuth exchange failed' },
  });
});

test('authentication returns the original OAuth Error with its metadata', async () => {
  const given = fixture(null);
  const exchangeError = Object.assign(new Error('invalid authorization code'), {
    status: 400,
    code: 'invalid_grant',
    retryAfter: 2,
  });
  Object.assign(given.host, { _oauthExchangeError: exchangeError });
  const result = await given.api._checkAuth();
  expect(result?.error).toBe(exchangeError);
  expect(result?.error).toMatchObject({ status: 400, code: 'invalid_grant', retryAfter: 2 });
});

test('authenticated storage requests add the current bearer token', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ ok: true }));
  await expect(given.api._storageRequest(given.api._buildUrl('file.bin'))).resolves.toEqual({
    data: { ok: true },
    error: null,
  });
  expect(given.fetch).toHaveBeenCalledWith(
    `${apiUrl}/storage/bucket/file.bin`,
    expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  );
});

test('uploads a File unchanged through the generated transport', async () => {
  const given = fixture();
  const file = new File(['data'], 'file.bin', { type: 'text/plain' });
  await expect(given.api.upload('folder/file.bin', file)).resolves.toEqual({
    data: storageObject(),
    error: null,
  });
  expect(given.upload).toHaveBeenCalledWith(
    'bucket',
    'folder/file.bin',
    { file },
    expect.objectContaining({ volcanoAuthorization: 'session' }),
  );
});

test('rejects an incomplete successful upload object', async () => {
  const given = fixture();
  given.upload.mockResolvedValue({ data: { name: 'incomplete' } });
  await expect(given.api.upload('file.bin', new Blob(['data']))).resolves.toEqual({
    data: null,
    error: new TypeError('Invalid storage upload response'),
  });
});

test.each([
  ['Blob', new Blob(['data'])],
  ['ArrayBuffer', new ArrayBuffer(2)],
])('wraps a %s as a named binary File', async (_name, body) => {
  const given = fixture();
  await given.api.upload('folder/file.bin', body, { contentType: 'application/custom' });
  const call = given.upload.mock.calls[0];
  if (call === undefined) {
    throw new Error('Expected an upload');
  }
  expect(call[2].file.name).toBe('file.bin');
  expect(call[2].file.type).toBe('application/custom');
});

test.each([
  ['file.bin', 'file.bin', 'file.bin'],
  ['/file.bin', 'file.bin', 'file.bin'],
])(
  'names a Blob uploaded at %s after its last segment with the default type',
  async (path, encodedPath, name) => {
    const given = fixture();
    await given.api.upload(path, new Blob(['data']));
    const call = given.upload.mock.calls[0];
    if (call === undefined) {
      throw new Error('Expected an upload');
    }
    expect(call[0]).toBe('bucket');
    expect(call[1]).toBe(encodedPath);
    expect(call[2].file.name).toBe(name);
    expect(call[2].file.type).toBe('application/octet-stream');
  },
);

test('rejects unsupported upload bodies before transport', async () => {
  const given = fixture();
  await expect(given.api.upload('file.bin', 'not binary')).resolves.toMatchObject({
    error: { message: 'Invalid file body type. Expected File, Blob, or ArrayBuffer.' },
  });
  expect(given.upload).not.toHaveBeenCalled();
});

test.each([new Error('upload failed'), 'upload failed'])(
  'normalizes upload failures',
  async (failure) => {
    const given = fixture();
    given.upload.mockRejectedValue(failure);
    const result = await given.api.upload('file.bin', new Blob(['data']));
    expect(result.data).toBeNull();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toBe(
      failure instanceof Error ? failure.message : 'Upload failed',
    );
  },
);

test('does not upload without a session', async () => {
  const given = fixture(null);
  await expect(given.api.upload('file.bin', new Blob())).resolves.toMatchObject({
    error: { message: 'No active session. Please sign in first.' },
  });
  expect(given.upload).not.toHaveBeenCalled();
});

test('downloads binary data and forwards a range header', async () => {
  const given = fixture();
  const blob = new Blob(['binary']);
  given.download.mockResolvedValue({ data: blob });
  await expect(given.api.download('folder/file.bin', { range: 'bytes=0-2' })).resolves.toEqual({
    data: blob,
    error: null,
  });
  expect(given.download).toHaveBeenCalledWith('bucket', 'folder/file.bin', {
    headers: { Range: 'bytes=0-2' },
    responseType: 'blob',
    volcanoAuthorization: 'session',
  });
});

test('omits a falsy range while preserving JavaScript caller behavior', async () => {
  const given = fixture();
  const pending: unknown = Reflect.apply(given.api.download.bind(given.api), given.api, [
    'file.bin',
    { range: null },
  ]);
  if (!(pending instanceof Promise)) {
    throw new TypeError('Expected a download promise');
  }
  await pending;
  expect(given.download).toHaveBeenCalledWith('bucket', 'file.bin', {
    headers: undefined,
    responseType: 'blob',
    volcanoAuthorization: 'session',
  });
});

test.each([new Error('download failed'), 'download failed'])(
  'normalizes download failures',
  async (failure) => {
    const given = fixture();
    given.download.mockRejectedValue(failure);
    const result = await given.api.download('file.bin');
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(
      failure instanceof Error ? 'download failed' : 'Download failed',
    );
  },
);

test('rejects a malformed binary result from a custom transport', async () => {
  const given = fixture();
  Reflect.set(given.host._transport, 'downloadStorageObject', () =>
    Promise.resolve({ data: 'not a Blob' }),
  );
  await expect(given.api.download('file.bin')).resolves.toEqual({
    data: null,
    error: new TypeError('Invalid storage download response'),
  });
});

test('does not download without a session', async () => {
  const given = fixture(null);
  await expect(given.api.download('file.bin')).resolves.toMatchObject({ error: expect.any(Error) });
  expect(given.download).not.toHaveBeenCalled();
});

test('lists objects with the same prefix, limit, and cursor query shape', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(
    Response.json({ objects: [storageObject({ name: 'one' })], next_cursor: 'next' }),
  );
  await expect(given.api.list('photos/', { limit: 2, cursor: 'last' })).resolves.toEqual({
    data: [storageObject({ name: 'one' })],
    error: null,
    nextCursor: 'next',
  });
  expect(given.fetch.mock.calls[0]?.[0]).toBe(
    `${apiUrl}/storage/bucket?prefix=photos%2F&limit=2&cursor=last`,
  );
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
  });
});

test.each([undefined, null, false, 0, Number.NaN, ''])(
  'omits a falsy list prefix: %s',
  async (prefix) => {
    const given = fixture();
    given.fetch.mockResolvedValue(Response.json({ objects: [] }));
    await given.api.list(prefix);
    expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket`);
  },
);

test('omits falsy list options from the URL', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects: [] }));
  const pending: unknown = Reflect.apply(given.api.list.bind(given.api), given.api, [
    '',
    { limit: Number.NaN, cursor: null },
  ]);
  if (!(pending instanceof Promise)) {
    throw new TypeError('Expected a list promise');
  }
  await pending;
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket`);
});

test.each([undefined, null, false, 0, ''])(
  'treats falsy objects %p as an empty final page',
  async (objects) => {
    const given = fixture();
    given.fetch.mockResolvedValue(Response.json({ objects, next_cursor: '' }));
    await expect(given.api.list()).resolves.toEqual({ data: [], error: null, nextCursor: null });
  },
);

test('treats a missing cursor as an empty final page', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects: [] }));
  await expect(given.api.list()).resolves.toEqual({ data: [], error: null, nextCursor: null });
});

test.each([null, 3, { objects: 'not an array' }])(
  'rejects malformed list responses: %p',
  async (payload) => {
    const given = fixture();
    given.fetch.mockResolvedValue(Response.json(payload));
    const result = await given.api.list();
    expect(result.data).toBeNull();
    expect(result.error?.message).toBe(
      typeof payload !== 'object' || payload === null
        ? 'Storage list response is not an object'
        : 'Storage list response has invalid objects',
    );
    expect(result.nextCursor).toBeNull();
  },
);

test('returns a storage HTTP failure without exposing a cursor', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ error: 'missing' }, { status: 404 }));
  const result = await given.api.list();
  expect(result.data).toBeNull();
  expect(result.error).toMatchObject({ status: 404 });
  expect(result.nextCursor).toBeNull();
});

test('does not list without a session', async () => {
  const given = fixture(null);
  await expect(given.api.list()).resolves.toMatchObject({
    data: null,
    error: expect.any(Error),
    nextCursor: null,
  });
  expect(given.fetch).not.toHaveBeenCalled();
});

test('removes a path and reports deleted paths', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ deleted: true }));
  await expect(given.api.remove('folder/file.bin')).resolves.toEqual({
    data: { deleted: ['folder/file.bin'] },
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket/folder/file.bin`);
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({ method: 'DELETE' });
});

test('an empty remove request succeeds without transport', async () => {
  const given = fixture();
  await expect(given.api.remove([])).resolves.toEqual({ data: { deleted: [] }, error: null });
  expect(given.fetch).not.toHaveBeenCalled();
});

test('partial removal preserves the first HTTP error and every failed path', async () => {
  const given = fixture();
  given.fetch
    .mockResolvedValueOnce(Response.json({ deleted: true }))
    .mockResolvedValueOnce(
      Response.json(
        { error: 'denied', code: 'forbidden' },
        { status: 403, headers: { 'Retry-After': '2' } },
      ),
    );
  const result = await given.api.remove(['allowed.bin', 'denied.bin']);
  expect(result.data).toEqual({ deleted: ['allowed.bin'] });
  expect(result.error).toMatchObject({
    message: 'Failed to delete 1 file(s): denied.bin',
    status: 403,
    code: 'forbidden',
    retryAfter: 2,
    failures: [{ path: 'denied.bin', error: { message: 'denied' } }],
  });
});

test('remove deletes only the paths it checked, even if the caller changes its list', async () => {
  const given = fixture();
  given.fetch.mockImplementation(() => Promise.resolve(Response.json({ deleted: true })));
  const paths = ['safe.bin'];
  const pending = given.api.remove(paths);
  paths.push('../../functions/x');
  await expect(pending).resolves.toEqual({ data: { deleted: ['safe.bin'] }, error: null });
  expect(given.fetch.mock.calls.map(([url]) => url)).toEqual([`${apiUrl}/storage/bucket/safe.bin`]);
});

test('partial removal names each failed path in order', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ error: 'denied' }, { status: 403 }));
  const result = await given.api.remove(['first.bin', 'second.bin']);
  expect(result.error?.message).toBe('Failed to delete 2 file(s): first.bin, second.bin');
});

test('remove does not copy absent or undefined error metadata', async () => {
  const given = fixture();
  jest.spyOn(given.api, '_storageRequest').mockResolvedValue({
    data: null,
    error: Object.assign(new Error('failed'), { status: undefined }),
  });
  const result = await given.api.remove('failed.bin');
  expect(result.error).toMatchObject({ message: 'Failed to delete 1 file(s): failed.bin' });
  if (result.error === null) {
    throw new TypeError('Expected a removal error');
  }
  expect(Reflect.has(result.error, 'status')).toBe(false);
  expect(Reflect.has(result.error, 'code')).toBe(false);
});

test('remove does not request storage without a session', async () => {
  const given = fixture(null);
  await expect(given.api.remove('file.bin')).resolves.toMatchObject({
    data: null,
    error: expect.any(Error),
  });
  expect(given.fetch).not.toHaveBeenCalled();
});

test.each(['move', 'copy'] as const)(
  '%s sends an authenticated transfer request',
  async (operation) => {
    const given = fixture();
    given.fetch.mockResolvedValue(Response.json(storageObject({ name: 'destination.bin' })));
    await expect(given.api[operation]('source.bin', 'destination.bin')).resolves.toEqual({
      data: storageObject({ name: 'destination.bin' }),
      error: null,
    });
    expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket/${operation}`);
    expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ from: 'source.bin', to: 'destination.bin' }),
    });
  },
);

test.each([
  {
    operation: 'move',
    run: (api: StorageFileApi) => api.move('source.bin', 'destination.bin'),
    error: 'Invalid storage move response',
    payload: {},
  },
  {
    operation: 'copy',
    run: (api: StorageFileApi) => api.copy('source.bin', 'destination.bin'),
    error: 'Invalid storage copy response',
    payload: {},
  },
  {
    operation: 'visibility',
    run: (api: StorageFileApi) => api.updateVisibility('file.bin', true),
    error: 'Invalid storage visibility response',
    payload: {},
  },
  {
    operation: 'upload session creation',
    run: (api: StorageFileApi) => api.createUploadSession('file.bin', { totalSize: 4 }),
    error: 'Invalid upload session creation response',
    payload: null,
  },
  {
    operation: 'upload part',
    run: (api: StorageFileApi) => api.uploadPart('file.bin', 'session-1', 1, new Blob()),
    error: 'Invalid upload part response',
    payload: null,
  },
  {
    operation: 'completed upload',
    run: (api: StorageFileApi) => api.completeUploadSession('file.bin', 'session-1'),
    error: 'Invalid completed upload response',
    payload: null,
  },
  {
    operation: 'upload session status',
    run: (api: StorageFileApi) => api.getUploadSession('file.bin', 'session-1'),
    error: 'Invalid upload session status response',
    payload: null,
  },
])('$operation reports malformed successful responses', async ({ run, error, payload }) => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(payload));
  await expect(run(given.api)).resolves.toMatchObject({ data: null, error: new TypeError(error) });
});

test.each([
  (api: StorageFileApi) => api.createUploadSession('file.bin', { totalSize: 4 }),
  (api: StorageFileApi) => api.uploadPart('file.bin', 'session-1', 1, new Blob()),
  (api: StorageFileApi) => api.completeUploadSession('file.bin', 'session-1'),
  (api: StorageFileApi) => api.getUploadSession('file.bin', 'session-1'),
])('preserves a conforming upload response with omitted fields', async (run) => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({}));
  await expect(run(given.api)).resolves.toEqual({ data: {}, error: null });
});

test.each(['move', 'copy'] as const)(
  '%s does not request storage without a session',
  async (operation) => {
    const given = fixture(null);
    await expect(given.api[operation]('source.bin', 'destination.bin')).resolves.toMatchObject({
      error: expect.any(Error),
    });
    expect(given.fetch).not.toHaveBeenCalled();
  },
);

test('returns a bucket-scoped public URL', () => {
  const given = fixture();
  expect(given.api.getPublicUrl('folder/file.bin')).toEqual({
    data: { publicUrl: `${apiUrl}/public/project-1/bucket/folder/file.bin` },
    error: null,
  });
});

test('updates visibility through the storage route', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(storageObject({ is_public: true })));
  await expect(given.api.updateVisibility('file.bin', true)).resolves.toEqual({
    data: storageObject({ is_public: true }),
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket/file.bin/visibility`);
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'PATCH',
    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ is_public: true }),
  });
});

test('does not update visibility without a session', async () => {
  const given = fixture(null);
  await expect(given.api.updateVisibility('file.bin', true)).resolves.toMatchObject({
    error: expect.any(Error),
  });
  expect(given.fetch).not.toHaveBeenCalled();
});

test.each([undefined, null, false, 0, Number.NaN, ''])(
  'rejects falsy upload sizes locally: %s',
  async (totalSize) => {
    const given = fixture();
    const pending: unknown = Reflect.apply(
      given.api.createUploadSession.bind(given.api),
      given.api,
      ['file.bin', { totalSize }],
    );
    if (!(pending instanceof Promise)) {
      throw new TypeError('Expected a session promise');
    }
    await expect(pending).resolves.toMatchObject({ error: { message: 'totalSize is required' } });
    expect(given.fetch).not.toHaveBeenCalled();
  },
);

test.each([null, undefined])('rejects absent session options locally', async (options) => {
  const given = fixture();
  await expect(given.api.createUploadSession('file.bin', options)).resolves.toMatchObject({
    error: { message: 'totalSize is required' },
  });
});

test('creates an upload session with the legacy body defaults', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(uploadSession()));
  await expect(given.api.createUploadSession('file.bin', { totalSize: 4 })).resolves.toEqual({
    data: uploadSession(),
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket/file.bin`);
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      filename: 'file.bin',
      content_type: 'application/octet-stream',
      total_size: 4,
    }),
  });
});

test('creates a session with explicit content type and part size', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(uploadSession()));
  await given.api.createUploadSession('folder/file.bin', {
    totalSize: 10,
    contentType: 'application/custom',
    partSize: 5,
  });
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    body: JSON.stringify({
      filename: 'file.bin',
      content_type: 'application/custom',
      total_size: 10,
      part_size: 5,
    }),
  });
});

test('does not create an upload session without authentication', async () => {
  const given = fixture(null);
  await expect(given.api.createUploadSession('file.bin', { totalSize: 4 })).resolves.toMatchObject({
    error: expect.any(Error),
  });
  expect(given.fetch).not.toHaveBeenCalled();
});

test('uploads a binary part with ownership and part-number headers', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(uploadPart({ part_number: 2 })));
  const part = new Blob(['data']);
  await expect(given.api.uploadPart('file.bin', 'session-1', 2, part)).resolves.toEqual({
    data: uploadPart({ part_number: 2 }),
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'PUT',
    body: part,
    headers: expect.objectContaining({
      'Content-Type': 'application/octet-stream',
      'X-Upload-Session': 'session-1',
      'X-Part-Number': '2',
    }),
  });
});

test('completes an upload session with its owner header', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(completedUpload()));
  await expect(given.api.completeUploadSession('file.bin', 'session-1')).resolves.toEqual({
    data: completedUpload(),
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    body: '{}',
    headers: expect.objectContaining({
      'Content-Type': 'application/json',
      'X-Upload-Session': 'session-1',
      'X-Upload-Complete': 'true',
    }),
  });
});

test('reads an upload session with its owner header', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(uploadStatus()));
  await expect(given.api.getUploadSession('file.bin', 'session-1')).resolves.toEqual({
    data: uploadStatus(),
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    headers: expect.objectContaining({ 'X-Upload-Session': 'session-1' }),
  });
});

test('aborts a session and returns only its error', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ aborted: true }));
  await expect(given.api.abortUploadSession('file.bin', 'session-1')).resolves.toEqual({
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'DELETE',
    headers: expect.objectContaining({ 'X-Upload-Session': 'session-1' }),
  });
});

test.each([
  'uploadPart',
  'completeUploadSession',
  'getUploadSession',
  'abortUploadSession',
] as const)('%s stops before storage transport when unauthenticated', async (operation) => {
  const given = fixture(null);
  const calls = {
    uploadPart: () => given.api.uploadPart('file.bin', 'session-1', 1, new Blob()),
    completeUploadSession: () => given.api.completeUploadSession('file.bin', 'session-1'),
    getUploadSession: () => given.api.getUploadSession('file.bin', 'session-1'),
    abortUploadSession: () => given.api.abortUploadSession('file.bin', 'session-1'),
  };
  await expect(calls[operation]()).resolves.toMatchObject({ error: expect.any(Error) });
  expect(given.fetch).not.toHaveBeenCalled();
});

test('resumable upload delegates through the typed session facade', async () => {
  const given = fixture();
  const create = jest.spyOn(given.api, 'createUploadSession').mockResolvedValue({
    data: {
      session_id: 'session-1',
      total_parts: 0,
      part_size: 1,
      expires_at: '2026-09-24T00:00:00Z',
    },
    error: null,
  });
  const object = {
    id: 'object-1',
    bucket_id: 'bucket-1',
    name: 'file.bin',
    is_public: false,
    size: 4,
    mime_type: 'application/octet-stream',
  };
  const complete = jest.spyOn(given.api, 'completeUploadSession').mockResolvedValue({
    data: { object },
    error: null,
  });
  await expect(given.api.uploadResumable('file.bin', new Blob(['data']))).resolves.toEqual({
    data: { object },
    error: null,
  });
  expect(create).toHaveBeenCalledWith('file.bin', {
    totalSize: 4,
    contentType: 'application/octet-stream',
    partSize: 25 * 1024 * 1024,
  });
  expect(complete).toHaveBeenCalledWith('file.bin', 'session-1');
});

test('resumable upload rejects an incomplete successful completion', async () => {
  const given = fixture();
  jest.spyOn(given.api, 'createUploadSession').mockResolvedValue({
    data: {
      session_id: 'session-1',
      total_parts: 0,
      part_size: 1,
      expires_at: '2026-09-24T00:00:00Z',
    },
    error: null,
  });
  jest.spyOn(given.api, 'completeUploadSession').mockResolvedValue({ data: null, error: null });
  await expect(given.api.uploadResumable('file.bin', new Blob(['data']))).resolves.toEqual({
    data: null,
    error: new TypeError('Invalid resumable upload response'),
  });
});

const UNSAFE_PATH = 'Storage path cannot contain empty, ".", or ".." segments';
const UNSAFE_BUCKET = 'Bucket name cannot contain "/" or be "." or ".."';

type Run = (api: StorageFileApi, path: string) => Promise<{ data?: unknown; error: Error | null }>;

const pathOperations: [string, Run][] = [
  ['upload', (api, path) => api.upload(path, new Blob(['data']))],
  ['download', (api, path) => api.download(path)],
  ['remove', (api, path) => api.remove(path)],
  ['remove list', (api, path) => api.remove(['safe.bin', path])],
  ['move source', (api, path) => api.move(path, 'safe.bin')],
  ['move destination', (api, path) => api.move('safe.bin', path)],
  ['copy source', (api, path) => api.copy(path, 'safe.bin')],
  ['copy destination', (api, path) => api.copy('safe.bin', path)],
  ['updateVisibility', (api, path) => api.updateVisibility(path, true)],
  ['createUploadSession', (api, path) => api.createUploadSession(path, { totalSize: 4 })],
  ['uploadPart', (api, path) => api.uploadPart(path, 'session-1', 1, new Blob())],
  ['completeUploadSession', (api, path) => api.completeUploadSession(path, 'session-1')],
  ['getUploadSession', (api, path) => api.getUploadSession(path, 'session-1')],
  ['abortUploadSession', (api, path) => api.abortUploadSession(path, 'session-1')],
  ['uploadResumable', (api, path) => api.uploadResumable(path, new Blob(['data']))],
];

const unsafePaths = ['..', '.', 'a/../b', 'a/./b', '../../functions/x', 'a//b', 'a/', '//a', '/'];

function expectNoRequest(given: Fixture): void {
  expect(given.fetch).not.toHaveBeenCalled();
  expect(given.upload).not.toHaveBeenCalled();
  expect(given.download).not.toHaveBeenCalled();
}

test.each(
  pathOperations.flatMap(([name, run]) => unsafePaths.map((path) => [name, path, run] as const)),
)('%s refuses %p before authentication or any request', async (_name, path, run) => {
  const given = fixture(null);
  const exchange = jest.spyOn(given.host, '_completeOAuthExchange');
  const result = await run(given.api, path);
  expect(result.error).toEqual(new Error(UNSAFE_PATH));
  expect(result.data ?? null).toBeNull();
  expect(exchange).not.toHaveBeenCalled();
  expectNoRequest(given);
});

test.each(pathOperations)('%s returns an error result for a lone surrogate', async (_name, run) => {
  const given = fixture();
  await expect(run(given.api, 'a\uD800')).resolves.toMatchObject({
    error: new Error('Storage path is not well-formed Unicode'),
  });
  expectNoRequest(given);
});

test.each(pathOperations)('%s refuses a dot segment even with a session', async (_name, run) => {
  const given = fixture();
  await expect(run(given.api, 'a/../b')).resolves.toMatchObject({
    error: new Error(UNSAFE_PATH),
  });
  expectNoRequest(given);
});

test.each([null, undefined, 4, ''])(
  'refuses a missing storage path %p before sending it',
  async (path) => {
    const given = fixture();
    const pending: unknown = Reflect.apply(given.api.download.bind(given.api), given.api, [path]);
    if (!(pending instanceof Promise)) {
      throw new TypeError('Expected a download promise');
    }
    await expect(pending).resolves.toEqual({
      data: null,
      error: new Error('Storage path must be a non-empty string'),
    });
    expectNoRequest(given);
  },
);

const bucketOperations: [string, Run][] = [
  ...pathOperations,
  ['list', (api) => api.list()],
  ['getPublicUrl', (api, path) => Promise.resolve(api.getPublicUrl(path))],
];

test.each(
  bucketOperations.flatMap(([name, run]) =>
    ['.', '..', 'a/..', '/bucket', 'bucket/', 'team/photos'].map(
      (bucket) => [name, bucket, run] as const,
    ),
  ),
)('%s refuses the bucket %p before authentication or any request', async (_name, bucket, run) => {
  const given = fixture(null, bucket);
  const exchange = jest.spyOn(given.host, '_completeOAuthExchange');
  const result = await run(given.api, 'file.bin');
  expect(result.error).toEqual(new Error(UNSAFE_BUCKET));
  expect(result.data ?? null).toBeNull();
  expect(exchange).not.toHaveBeenCalled();
  expectNoRequest(given);
});

test('list refuses an empty bucket name without a cursor', async () => {
  const given = fixture('token', '');
  await expect(given.api.list()).resolves.toEqual({
    data: null,
    error: new Error('Bucket name must be a non-empty string'),
    nextCursor: null,
  });
  expectNoRequest(given);
});

test('remove sends no deletion when any listed path is unsafe', async () => {
  const given = fixture();
  await expect(given.api.remove(['first.bin', '../second.bin', 'third.bin'])).resolves.toEqual({
    data: null,
    error: new Error(UNSAFE_PATH),
  });
  expectNoRequest(given);
});

test('abortUploadSession reports only the path error', async () => {
  const given = fixture();
  await expect(given.api.abortUploadSession('..', 'session-1')).resolves.toEqual({
    error: new Error(UNSAFE_PATH),
  });
});

test.each([
  ['folder/file.bin', 'folder/file.bin'],
  ['雪/🌋 file.txt', '%E9%9B%AA/%F0%9F%8C%8B%20file.txt'],
  ['.hidden/a..b/c.', '.hidden/a..b/c.'],
  ['%2e%2e/file', '%252e%252e/file'],
  ['/folder/file.bin', 'folder/file.bin'],
])('builds the request URL for the valid path %s', async (path, encoded) => {
  const given = fixture();
  given.fetch.mockImplementation(() => Promise.resolve(Response.json({})));
  const objectUrl = `${apiUrl}/storage/bucket/${encoded}`;
  await given.api.remove(path);
  await given.api.updateVisibility(path, true);
  await given.api.createUploadSession(path, { totalSize: 4 });
  await given.api.uploadPart(path, 'session-1', 1, new Blob());
  await given.api.completeUploadSession(path, 'session-1');
  await given.api.getUploadSession(path, 'session-1');
  await given.api.abortUploadSession(path, 'session-1');
  expect(given.fetch.mock.calls.map((call) => call[0])).toEqual([
    objectUrl,
    `${objectUrl}/visibility`,
    objectUrl,
    objectUrl,
    objectUrl,
    objectUrl,
    objectUrl,
  ]);
  await given.api.upload(path, new Blob(['data']));
  await given.api.download(path);
  expect(given.upload.mock.calls[0]?.slice(0, 2)).toEqual(['bucket', encoded]);
  expect(given.download.mock.calls[0]?.slice(0, 2)).toEqual(['bucket', encoded]);
  expect(given.api.getPublicUrl(path).data?.publicUrl).toBe(
    `${apiUrl}/public/project-1/bucket/${encoded}`,
  );
});

test('move and copy send bucket-relative paths in the request body', async () => {
  const given = fixture();
  given.fetch.mockImplementation(() =>
    Promise.resolve(Response.json(storageObject({ name: 'to' }))),
  );
  await given.api.move('/from/雪.bin', 'to/.hidden');
  await given.api.copy('from/雪.bin', '/to/.hidden');
  expect(given.fetch.mock.calls.map((call) => [call[0], call[1]?.body])).toEqual([
    [`${apiUrl}/storage/bucket/move`, JSON.stringify({ from: 'from/雪.bin', to: 'to/.hidden' })],
    [`${apiUrl}/storage/bucket/copy`, JSON.stringify({ from: 'from/雪.bin', to: 'to/.hidden' })],
  ]);
});

test('remove reports each deleted path as the caller wrote it', async () => {
  const given = fixture();
  given.fetch.mockImplementation(() => Promise.resolve(Response.json({})));
  await expect(given.api.remove(['/a.bin', 'b.bin'])).resolves.toEqual({
    data: { deleted: ['/a.bin', 'b.bin'] },
    error: null,
  });
  expect(given.fetch.mock.calls.map((call) => call[0])).toEqual([
    `${apiUrl}/storage/bucket/a.bin`,
    `${apiUrl}/storage/bucket/b.bin`,
  ]);
});

test('remove validates a very long path list without spreading it into arguments', async () => {
  const given = fixture();
  // If validation is skipped, fail at the first deletion and hold it there.
  // Letting it continue would send 200,000 deletions before the assertion runs.
  const firstDeletion = new Promise<never>((_resolve, reject) => {
    given.fetch.mockImplementation(() => {
      reject(new Error('remove sent a deletion before rejecting the list'));
      return new Promise<Response>(() => {
        // Never settle, so the deletion loop stops at this request.
      });
    });
  });
  const paths = [...Array.from({ length: 200_000 }, (_, index) => `file-${String(index)}`), '..'];
  await expect(Promise.race([given.api.remove(paths), firstDeletion])).resolves.toEqual({
    data: null,
    error: new Error(UNSAFE_PATH),
  });
  expectNoRequest(given);
});
