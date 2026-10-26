/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import { storageObject } from './storage-response-fixtures.ts';
import { apiUrl, fixture } from './support/storage-file-fixtures.ts';
import { expectInstanceOf, expectPresent } from './support/assertions.ts';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

test('lists objects with the same prefix, limit, and cursor query shape', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects: [storageObject({ name: 'one' })], next_cursor: 'next' }));
  await expect(given.api.list('photos/', { limit: 2, cursor: 'last' })).resolves.toEqual({
    data: [storageObject({ name: 'one' })],
    error: null,
    nextCursor: 'next',
  });
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket?prefix=photos%2F&limit=2&cursor=last`);
  expect(given.fetch.mock.calls[0]?.[1]).toMatchObject({
    method: 'GET',
    headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
  });
});

test.each([undefined, null, false, 0, Number.NaN, ''])('omits a falsy list prefix: %s', async (prefix) => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects: [] }));
  await given.api.list(prefix);
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket`);
});

test('omits falsy list options from the URL', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects: [] }));
  const pending: unknown = Reflect.apply(given.api.list.bind(given.api), given.api, [
    '',
    { limit: Number.NaN, cursor: null },
  ]);
  expectInstanceOf(pending, Promise);
  await pending;
  expect(given.fetch.mock.calls[0]?.[0]).toBe(`${apiUrl}/storage/bucket`);
});

test.each([undefined, null, false, 0, ''])('treats falsy objects %p as an empty final page', async (objects) => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects, next_cursor: '' }));
  await expect(given.api.list()).resolves.toEqual({ data: [], error: null, nextCursor: null });
});

test('treats a missing cursor as an empty final page', async () => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json({ objects: [] }));
  await expect(given.api.list()).resolves.toEqual({ data: [], error: null, nextCursor: null });
});

test.each([
  [null, 'Storage list response is not an object'],
  [3, 'Storage list response is not an object'],
  [{ objects: 'not an array' }, 'Storage list response has invalid objects'],
])('rejects malformed list responses: %p', async (payload, message) => {
  const given = fixture();
  given.fetch.mockResolvedValue(Response.json(payload));
  const result = await given.api.list();
  expect(result.data).toBeNull();
  expect(result.error?.message).toBe(message);
  expect(result.nextCursor).toBeNull();
});

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
      Response.json({ error: 'denied', code: 'forbidden' }, { status: 403, headers: { 'Retry-After': '2' } }),
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
  expectPresent(result.error);
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
