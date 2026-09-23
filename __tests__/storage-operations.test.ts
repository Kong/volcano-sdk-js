/** @jest-environment node */
import { expect, jest, test } from '@jest/globals';
import {
  listStorageObjects,
  removeStorageObjects,
  type StorageOperationHost,
  transferStorageObject,
  updateStorageVisibility,
} from '../src/storage-operations.ts';

function fixture() {
  const checkAuth = jest.fn<StorageOperationHost['_checkAuth']>();
  const buildUrl = jest.fn<StorageOperationHost['_buildUrl']>();
  const request = jest.fn<StorageOperationHost['_storageRequest']>();
  checkAuth.mockResolvedValue(null);
  buildUrl.mockImplementation((path) => `https://api.volcano.dev/storage/bucket/${path}`);
  request.mockResolvedValue({ data: { objects: [], next_cursor: null }, error: null });
  const host: StorageOperationHost = {
    bucketName: 'user uploads',
    volcanoAuth: { apiUrl: 'https://api.volcano.dev' },
    _checkAuth: checkAuth,
    _buildUrl: buildUrl,
    _storageRequest: request,
  };
  return { host, checkAuth, buildUrl, request };
}

test('lists the default bucket URL with objects and no cursor', async () => {
  const given = fixture();
  given.request.mockResolvedValue({
    data: { objects: [{ name: 'one' }], next_cursor: null },
    error: null,
  });
  await expect(listStorageObjects(given.host)).resolves.toEqual({
    data: [{ name: 'one' }],
    error: null,
    nextCursor: null,
  });
  expect(given.request).toHaveBeenCalledWith('https://api.volcano.dev/storage/user%20uploads', {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
});

test('encodes prefix, limit, and cursor in list queries', async () => {
  const given = fixture();
  given.request.mockResolvedValue({ data: { objects: [], next_cursor: 'next-page' }, error: null });
  await expect(
    listStorageObjects(given.host, 'folder one/', { limit: 25, cursor: 'old/page' }),
  ).resolves.toEqual({ data: [], error: null, nextCursor: 'next-page' });
  expect(given.request.mock.calls[0]?.[0]).toBe(
    'https://api.volcano.dev/storage/user%20uploads?prefix=folder+one%2F&limit=25&cursor=old%2Fpage',
  );
});

test('omits zero limit and empty cursor', async () => {
  const given = fixture();
  await listStorageObjects(given.host, '', { limit: 0, cursor: '' });
  expect(given.request.mock.calls[0]?.[0]).toBe('https://api.volcano.dev/storage/user%20uploads');
});

test('uses empty objects for an absent or invalid list field', async () => {
  const given = fixture();
  given.request.mockResolvedValue({
    data: { objects: 'unexpected', next_cursor: '' },
    error: null,
  });
  await expect(listStorageObjects(given.host)).resolves.toEqual({
    data: [],
    error: null,
    nextCursor: null,
  });
});

test('ignores a nonstring next cursor', async () => {
  const given = fixture();
  given.request.mockResolvedValue({ data: { objects: [], next_cursor: 1 }, error: null });
  await expect(listStorageObjects(given.host)).resolves.toEqual({
    data: [],
    error: null,
    nextCursor: null,
  });
});

test.each([null, 'not an object'])('reports a malformed list response: %p', async (data) => {
  const given = fixture();
  given.request.mockResolvedValue({ data, error: null });
  const result = await listStorageObjects(given.host);
  expect(result.data).toBeNull();
  expect(result.nextCursor).toBeNull();
  expect(result.error).toBeInstanceOf(TypeError);
});

test('returns an auth refusal before listing', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(listStorageObjects(given.host)).resolves.toEqual({
    data: null,
    error,
    nextCursor: null,
  });
  expect(given.request).not.toHaveBeenCalled();
});

test('preserves an HTTP list error', async () => {
  const given = fixture();
  const error = new Error('rate limited');
  given.request.mockResolvedValue({ data: null, error });
  await expect(listStorageObjects(given.host)).resolves.toEqual({
    data: null,
    error,
    nextCursor: null,
  });
});

test('deletes multiple paths and reports partial success with first-error metadata', async () => {
  const given = fixture();
  const missing = Object.assign(new Error('missing'), {
    status: 404,
    code: 'not_found',
    retryAfter: 2,
  });
  given.request
    .mockResolvedValueOnce({ data: null, error: missing })
    .mockResolvedValueOnce({ data: null, error: null });
  const result = await removeStorageObjects(given.host, ['missing', 'removed']);
  expect(result.data).toEqual({ deleted: ['removed'] });
  expect(result.error).toMatchObject({
    message: 'Failed to delete 1 file(s): missing',
    failures: [{ path: 'missing', error: missing }],
    status: 404,
    code: 'not_found',
    retryAfter: 2,
  });
  expect(given.request).toHaveBeenCalledTimes(2);
  expect(given.request.mock.calls[0]).toEqual([
    'https://api.volcano.dev/storage/bucket/missing',
    { method: 'DELETE' },
  ]);
});

test('removes one path successfully', async () => {
  const given = fixture();
  await expect(removeStorageObjects(given.host, 'old-file')).resolves.toEqual({
    data: { deleted: ['old-file'] },
    error: null,
  });
});

test('does not copy invalid optional HTTP metadata onto the aggregate error', async () => {
  const given = fixture();
  const malformed = Object.assign(new Error('failure'), {
    status: 'bad',
    code: 500,
    retryAfter: 'later',
  });
  given.request.mockResolvedValue({ data: null, error: malformed });
  const result = await removeStorageObjects(given.host, 'bad');
  expect(result.error).toMatchObject({ message: 'Failed to delete 1 file(s): bad' });
  expect(result.error).not.toHaveProperty('status');
  expect(result.error).not.toHaveProperty('code');
  expect(result.error).not.toHaveProperty('retryAfter');
});

test('reports a delete error without optional HTTP metadata', async () => {
  const given = fixture();
  given.request.mockResolvedValue({ data: null, error: new Error('network failed') });
  const result = await removeStorageObjects(given.host, 'file');
  expect(result.error).toMatchObject({
    message: 'Failed to delete 1 file(s): file',
    failures: [{ path: 'file', error: new Error('network failed') }],
  });
  expect(result.error).not.toHaveProperty('status');
});

test('refuses removal without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(removeStorageObjects(given.host, 'old-file')).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.request).not.toHaveBeenCalled();
});

test.each(['move', 'copy'] as const)(
  'sends %s through the authenticated bucket route',
  async (operation) => {
    const given = fixture();
    given.request.mockResolvedValue({ data: { name: 'new' }, error: null });
    await expect(transferStorageObject(given.host, operation, 'old', 'new')).resolves.toEqual({
      data: { name: 'new' },
      error: null,
    });
    expect(given.request).toHaveBeenCalledWith(
      `https://api.volcano.dev/storage/user%20uploads/${operation}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: 'old', to: 'new' }),
      },
    );
  },
);

test('refuses a move without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(transferStorageObject(given.host, 'move', 'old', 'new')).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.request).not.toHaveBeenCalled();
});

test('updates visibility through the object route', async () => {
  const given = fixture();
  await updateStorageVisibility(given.host, 'photo.png', true);
  expect(given.request).toHaveBeenCalledWith(
    'https://api.volcano.dev/storage/bucket/photo.png/visibility',
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{"is_public":true}',
    },
  );
});

test('refuses visibility changes without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(updateStorageVisibility(given.host, 'photo.png', true)).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.request).not.toHaveBeenCalled();
});
