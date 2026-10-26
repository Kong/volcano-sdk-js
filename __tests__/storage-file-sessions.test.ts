/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { completedUpload, uploadPart, uploadSession, uploadStatus } from './storage-response-fixtures.ts';
import { apiUrl, fixture } from './support/storage-file-fixtures.ts';
import { expectInstanceOf } from './support/assertions.ts';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([undefined, null, false, 0, Number.NaN, ''])('rejects falsy upload sizes locally: %s', async (totalSize) => {
  const given = fixture();
  const pending: unknown = Reflect.apply(given.api.createUploadSession.bind(given.api), given.api, [
    'file.bin',
    { totalSize },
  ]);
  expectInstanceOf(pending, Promise);
  await expect(pending).resolves.toMatchObject({ error: { message: 'totalSize is required' } });
  expect(given.fetch).not.toHaveBeenCalled();
});

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

test.each(['uploadPart', 'completeUploadSession', 'getUploadSession', 'abortUploadSession'] as const)(
  '%s stops before storage transport when unauthenticated',
  async (operation) => {
    const given = fixture(null);
    const calls = {
      uploadPart: () => given.api.uploadPart('file.bin', 'session-1', 1, new Blob()),
      completeUploadSession: () => given.api.completeUploadSession('file.bin', 'session-1'),
      getUploadSession: () => given.api.getUploadSession('file.bin', 'session-1'),
      abortUploadSession: () => given.api.abortUploadSession('file.bin', 'session-1'),
    };
    await expect(calls[operation]()).resolves.toMatchObject({ error: expect.any(Error) });
    expect(given.fetch).not.toHaveBeenCalled();
  },
);

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
