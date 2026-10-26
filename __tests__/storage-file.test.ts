/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { storageObject } from './storage-response-fixtures.ts';
import { apiUrl, fixture } from './support/storage-file-fixtures.ts';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('builds a bucket-scoped URL while preserving slash-separated paths', () => {
  const given = fixture();
  expect(given.api.bucketName).toBe('bucket');
  expect(given.api._buildUrl('one/two words.txt')).toBe(`${apiUrl}/storage/bucket/one/two%20words.txt`);
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
])('names a Blob uploaded at %s after its last segment with the default type', async (path, encodedPath, name) => {
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
});

test('rejects unsupported upload bodies before transport', async () => {
  const given = fixture();
  await expect(given.api.upload('file.bin', 'not binary')).resolves.toMatchObject({
    error: { message: 'Invalid file body type. Expected File, Blob, or ArrayBuffer.' },
  });
  expect(given.upload).not.toHaveBeenCalled();
});

test.each([new Error('upload failed'), 'upload failed'])('normalizes upload failures', async (failure) => {
  const given = fixture();
  given.upload.mockRejectedValue(failure);
  const result = await given.api.upload('file.bin', new Blob(['data']));
  expect(result.data).toBeNull();
  expect(result.error).toBeInstanceOf(Error);
  expect(result.error?.message).toBe(failure instanceof Error ? failure.message : 'Upload failed');
});

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
  const pending: unknown = Reflect.apply(given.api.download.bind(given.api), given.api, ['file.bin', { range: null }]);
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

test.each([new Error('download failed'), 'download failed'])('normalizes download failures', async (failure) => {
  const given = fixture();
  given.download.mockRejectedValue(failure);
  const result = await given.api.download('file.bin');
  expect(result.data).toBeNull();
  expect(result.error?.message).toBe(failure instanceof Error ? 'download failed' : 'Download failed');
});

test('rejects a malformed binary result from a custom transport', async () => {
  const given = fixture();
  Reflect.set(given.host._transport, 'downloadStorageObject', () => Promise.resolve({ data: 'not a Blob' }));
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
