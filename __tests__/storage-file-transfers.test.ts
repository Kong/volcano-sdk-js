/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { StorageFileApi } from '../src/storage-file.ts';
import { storageObject } from './storage-response-fixtures.ts';
import { apiUrl, fixture } from './support/storage-file-fixtures.ts';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test.each(['move', 'copy'] as const)('%s sends an authenticated transfer request', async (operation) => {
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
});

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

test.each(['move', 'copy'] as const)('%s does not request storage without a session', async (operation) => {
  const given = fixture(null);
  await expect(given.api[operation]('source.bin', 'destination.bin')).resolves.toMatchObject({
    error: expect.any(Error),
  });
  expect(given.fetch).not.toHaveBeenCalled();
});

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
