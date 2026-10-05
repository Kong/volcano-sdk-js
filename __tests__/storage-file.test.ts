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

function fixture(accessToken: string | null = 'token'): Fixture {
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
  return { api: new StorageFileApi(host, 'bucket'), host, fetch: request, upload, download };
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

test('uses a fallback name and content type for a root Blob path', async () => {
  const given = fixture();
  await given.api.upload('', new Blob(['data']));
  const call = given.upload.mock.calls[0];
  if (call === undefined) {
    throw new Error('Expected an upload');
  }
  expect(call[2].file.name).toBe('file');
  expect(call[2].file.type).toBe('application/octet-stream');
});

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
  await expect(given.api.createUploadSession('', { totalSize: 4 })).resolves.toEqual({
    data: uploadSession(),
    error: null,
  });
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'POST',
    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      filename: '',
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
