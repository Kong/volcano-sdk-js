/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import { assert, asyncProperty, integer, uint8Array } from 'fast-check';
import { type ResumableStorageHost, uploadResumable } from '../src/storage-resumable.ts';
import { propertyOptions } from './support/property-options.ts';

const SESSION = { session_id: 'session-1', total_parts: 2, part_size: 3 };

afterEach(() => {
  jest.restoreAllMocks();
});

function fixture(session: unknown = SESSION) {
  const checkAuth = jest.fn<ResumableStorageHost['_checkAuth']>();
  const create = jest.fn<ResumableStorageHost['createUploadSession']>();
  const upload = jest.fn<ResumableStorageHost['uploadPart']>();
  const abort = jest.fn<ResumableStorageHost['abortUploadSession']>();
  const complete = jest.fn<ResumableStorageHost['completeUploadSession']>();
  checkAuth.mockResolvedValue(null);
  create.mockResolvedValue({ data: session, error: null });
  upload.mockResolvedValue({ data: {}, error: null });
  abort.mockResolvedValue({ error: null });
  complete.mockResolvedValue({ data: { id: 'stored' }, error: null });
  const host: ResumableStorageHost = {
    _checkAuth: checkAuth,
    createUploadSession: create,
    uploadPart: upload,
    abortUploadSession: abort,
    completeUploadSession: complete,
  };
  return { host, checkAuth, create, upload, abort, complete };
}

test('unauthenticated uploads stop before creating a session', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(uploadResumable(given.host, 'file.bin', new Blob())).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.create).not.toHaveBeenCalled();
});

test('session-start failure returns its error without uploading', async () => {
  const given = fixture();
  const error = new Error('quota');
  given.create.mockResolvedValue({ data: null, error });
  await expect(uploadResumable(given.host, 'file.bin', new Blob())).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.upload).not.toHaveBeenCalled();
});

test.each([
  [null, 'not an object'],
  [{}, 'no ID'],
  [{ session_id: 4 }, 'no ID'],
  [{ session_id: 's' }, 'part count'],
  [{ session_id: 's', total_parts: 1.5 }, 'part count'],
  [{ session_id: 's', total_parts: -1 }, 'part count'],
  [{ session_id: 's', total_parts: 1 }, 'part size'],
  [{ session_id: 's', total_parts: 1, part_size: 0 }, 'part size'],
  [{ session_id: 's', total_parts: 1, part_size: 1.5 }, 'part size'],
])('rejects a malformed session: %p', async (session, message) => {
  const given = fixture(session);
  const result = await uploadResumable(given.host, 'file.bin', new Blob());
  expect(result.data).toBeNull();
  expect(result.error?.message).toContain(message);
  expect(given.upload).not.toHaveBeenCalled();
});

test('uploads each slice and reports progress before completion', async () => {
  const given = fixture();
  const blob = new Blob([Uint8Array.from([0, 255, 1, 128, 42])]);
  const progress: { uploaded: number; total: number }[] = [];
  await expect(
    uploadResumable(given.host, 'file.bin', blob, {
      partSize: 3,
      onProgress(uploaded, total) {
        progress.push({ uploaded, total });
      },
    }),
  ).resolves.toEqual({ data: { id: 'stored' }, error: null });
  expect(given.create).toHaveBeenCalledWith('file.bin', {
    totalSize: 5,
    contentType: 'application/octet-stream',
    partSize: 3,
  });
  expect(given.upload).toHaveBeenCalledTimes(2);
  const first = given.upload.mock.calls[0];
  const second = given.upload.mock.calls[1];
  if (first === undefined || second === undefined) {
    throw new Error('Expected two uploaded parts');
  }
  expect(new Uint8Array(await first[3].arrayBuffer())).toEqual(Uint8Array.from([0, 255, 1]));
  expect(new Uint8Array(await second[3].arrayBuffer())).toEqual(Uint8Array.from([128, 42]));
  expect(progress).toEqual([
    { uploaded: 3, total: 5 },
    { uploaded: 5, total: 5 },
  ]);
  expect(given.complete).toHaveBeenCalledWith('file.bin', 'session-1');
});

test('uses a File MIME type and the default part size when omitted', async () => {
  const given = fixture({ session_id: 'empty', total_parts: 0, part_size: 1 });
  const file = new File(['content'], 'file.txt', { type: 'text/plain' });
  await uploadResumable(given.host, 'file.txt', file);
  expect(given.create).toHaveBeenCalledWith('file.txt', {
    totalSize: 7,
    contentType: 'text/plain',
    partSize: 25 * 1024 * 1024,
  });
  expect(given.upload).not.toHaveBeenCalled();
  expect(given.complete).toHaveBeenCalledWith('file.txt', 'empty');
});

test('explicit content type wins and zero part size keeps the default', async () => {
  const given = fixture({ session_id: 'empty', total_parts: 0, part_size: 1 });
  const file = new File(['x'], 'file.txt', { type: 'text/plain' });
  await uploadResumable(given.host, 'file.txt', file, {
    contentType: 'application/custom',
    partSize: 0,
  });
  expect(given.create).toHaveBeenCalledWith('file.txt', {
    totalSize: 1,
    contentType: 'application/custom',
    partSize: 25 * 1024 * 1024,
  });
});

test('empty configured and File MIME types fall back to octet-stream', async () => {
  const given = fixture({ session_id: 'empty', total_parts: 0, part_size: 1 });
  await uploadResumable(given.host, 'file.bin', new File(['x'], 'file.bin'), { contentType: '' });
  expect(given.create.mock.calls[0]?.[1].contentType).toBe('application/octet-stream');
});

test('failed part aborts and returns the part error', async () => {
  const given = fixture();
  const error = new Error('part refused');
  given.upload.mockResolvedValue({ data: null, error });
  await expect(uploadResumable(given.host, 'file.bin', new Blob(['x']))).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.abort).toHaveBeenCalledWith('file.bin', 'session-1');
  expect(given.complete).not.toHaveBeenCalled();
});

test('failed abort is reported while preserving the part error', async () => {
  const given = fixture();
  const error = new Error('part refused');
  given.upload.mockResolvedValue({ data: null, error });
  given.abort.mockResolvedValue({ error: new Error('abort refused') });
  const warnings: unknown[][] = [];
  jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
    warnings.push(args);
  });
  await expect(uploadResumable(given.host, 'file.bin', new Blob(['x']))).resolves.toEqual({
    data: null,
    error,
  });
  expect(warnings).toEqual([
    ['[Storage] Failed to abort upload session session-1:', 'abort refused'],
  ]);
});

test('normalizes thrown non-Error values during an upload', async () => {
  const given = fixture();
  given.upload.mockRejectedValue('unexpected');
  await expect(uploadResumable(given.host, 'file.bin', new Blob(['x']))).resolves.toEqual({
    data: null,
    error: new Error('Resumable upload failed'),
  });
});

test('preserves an Error thrown while completing an upload', async () => {
  const given = fixture({ session_id: 'empty', total_parts: 0, part_size: 1 });
  const error = new Error('completion failed');
  given.complete.mockRejectedValue(error);
  await expect(uploadResumable(given.host, 'file.bin', new Blob())).resolves.toEqual({
    data: null,
    error,
  });
});

test('resumable chunks preserve arbitrary binary bytes', async () => {
  await assert(
    asyncProperty(
      uint8Array({ minLength: 1, maxLength: 256 }),
      integer({ min: 1, max: 32 }),
      async (bytes, partSize) => {
        const given = fixture({
          session_id: 'property-session',
          total_parts: Math.ceil(bytes.length / partSize),
          part_size: partSize,
        });
        const body = new Blob([new Uint8Array(bytes)]);
        const result = await uploadResumable(given.host, 'binary.dat', body);
        expect(result.error).toBeNull();
        const observed: number[] = [];
        for (const call of given.upload.mock.calls) {
          observed.push(...new Uint8Array(await call[3].arrayBuffer()));
        }
        expect(observed).toEqual(Array.from(bytes));
        expect(given.upload).toHaveBeenCalledTimes(Math.ceil(bytes.length / partSize));
      },
    ),
    propertyOptions(),
  );
});
