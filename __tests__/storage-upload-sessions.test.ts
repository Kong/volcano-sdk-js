/** @jest-environment node */
import { expect, jest, test } from '@jest/globals';
import type { StorageOperationHost } from '../src/storage-operations.ts';
import {
  abortStorageUploadSession,
  completeStorageUploadSession,
  createStorageUploadSession,
  getStorageUploadSession,
  uploadStoragePart,
} from '../src/storage-upload-sessions.ts';

type SessionHost = Pick<StorageOperationHost, '_checkAuth' | '_buildUrl' | '_storageRequest'>;

function fixture() {
  const checkAuth = jest.fn<SessionHost['_checkAuth']>();
  const buildUrl = jest.fn<SessionHost['_buildUrl']>();
  const request = jest.fn<SessionHost['_storageRequest']>();
  checkAuth.mockResolvedValue(null);
  buildUrl.mockImplementation((path) => `https://api.volcano.dev/storage/bucket/${path}`);
  request.mockResolvedValue({ data: { session_id: 'session-1' }, error: null });
  const host: SessionHost = {
    _checkAuth: checkAuth,
    _buildUrl: buildUrl,
    _storageRequest: request,
  };
  return { host, checkAuth, buildUrl, request };
}

test('creates a session with filename, MIME type, total size, and part size', async () => {
  const given = fixture();
  await expect(
    createStorageUploadSession(given.host, 'folder/data.bin', {
      totalSize: 5,
      contentType: 'application/custom',
      partSize: 3,
    }),
  ).resolves.toEqual({ data: { session_id: 'session-1' }, error: null });
  expect(given.request).toHaveBeenCalledWith(
    'https://api.volcano.dev/storage/bucket/folder/data.bin',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: 'data.bin',
        content_type: 'application/custom',
        total_size: 5,
        part_size: 3,
      }),
    },
  );
});

test('uses the original path and default MIME type when its final segment is empty', async () => {
  const given = fixture();
  await createStorageUploadSession(given.host, 'folder/', { totalSize: 1 });
  expect(given.request.mock.calls[0]?.[1].body).toBe(
    JSON.stringify({
      filename: 'folder/',
      content_type: 'application/octet-stream',
      total_size: 1,
    }),
  );
});

test('empty MIME type uses the default', async () => {
  const given = fixture();
  await createStorageUploadSession(given.host, 'file.bin', {
    totalSize: 1,
    contentType: '',
  });
  expect(given.request.mock.calls[0]?.[1].body).toContain('application/octet-stream');
});

test.each([undefined, null, {}, { totalSize: 0 }])(
  'rejects missing or zero total size: %p',
  async (options) => {
    const given = fixture();
    await expect(createStorageUploadSession(given.host, 'file.bin', options)).resolves.toEqual({
      data: null,
      error: new Error('totalSize is required'),
    });
    expect(given.request).not.toHaveBeenCalled();
  },
);

test('refuses session creation without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(
    createStorageUploadSession(given.host, 'file.bin', { totalSize: 1 }),
  ).resolves.toEqual({ data: null, error });
  expect(given.request).not.toHaveBeenCalled();
});

test('uploads a binary part with session and part-number headers', async () => {
  const given = fixture();
  const body = new Blob([Uint8Array.from([0, 255, 1])]);
  await uploadStoragePart(given.host, 'file.bin', 'session-1', 2, body);
  expect(given.request).toHaveBeenCalledWith('https://api.volcano.dev/storage/bucket/file.bin', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Upload-Session': 'session-1',
      'X-Part-Number': '2',
    },
    body,
  });
  expect(new Uint8Array(await body.arrayBuffer())).toEqual(Uint8Array.from([0, 255, 1]));
});

test('preserves an ArrayBuffer part unchanged', async () => {
  const given = fixture();
  const body = Uint8Array.from([128, 0, 42]).buffer;
  await uploadStoragePart(given.host, 'file.bin', 'session-1', 1, body);
  expect(given.request.mock.calls[0]?.[1].body).toBe(body);
});

test('refuses part upload without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(
    uploadStoragePart(given.host, 'file.bin', 'session-1', 1, new Blob()),
  ).resolves.toEqual({ data: null, error });
  expect(given.request).not.toHaveBeenCalled();
});

test('completes a session with the completion header', async () => {
  const given = fixture();
  await completeStorageUploadSession(given.host, 'file.bin', 'session-1');
  expect(given.request).toHaveBeenCalledWith('https://api.volcano.dev/storage/bucket/file.bin', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Session': 'session-1',
      'X-Upload-Complete': 'true',
    },
    body: '{}',
  });
});

test('refuses completion without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(completeStorageUploadSession(given.host, 'file.bin', 'session-1')).resolves.toEqual({
    data: null,
    error,
  });
});

test('reads a session with its ownership header', async () => {
  const given = fixture();
  await getStorageUploadSession(given.host, 'file.bin', 'session-1');
  expect(given.request).toHaveBeenCalledWith('https://api.volcano.dev/storage/bucket/file.bin', {
    method: 'GET',
    headers: { 'X-Upload-Session': 'session-1' },
  });
});

test('refuses status lookup without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(getStorageUploadSession(given.host, 'file.bin', 'session-1')).resolves.toEqual({
    data: null,
    error,
  });
});

test('aborts a session and returns only its error', async () => {
  const given = fixture();
  await expect(abortStorageUploadSession(given.host, 'file.bin', 'session-1')).resolves.toEqual({
    error: null,
  });
  expect(given.request).toHaveBeenCalledWith('https://api.volcano.dev/storage/bucket/file.bin', {
    method: 'DELETE',
    headers: { 'X-Upload-Session': 'session-1' },
  });
});

test('preserves an abort request error', async () => {
  const given = fixture();
  const error = new Error('abort failed');
  given.request.mockResolvedValue({ data: null, error });
  await expect(abortStorageUploadSession(given.host, 'file.bin', 'session-1')).resolves.toEqual({
    error,
  });
});

test('refuses abort without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(abortStorageUploadSession(given.host, 'file.bin', 'session-1')).resolves.toEqual({
    error,
  });
  expect(given.request).not.toHaveBeenCalled();
});
