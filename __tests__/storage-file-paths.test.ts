/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, expect, jest, test } from '@jest/globals';
import type { StorageFileApi } from '../src/storage-file.ts';
import { storageObject } from './storage-response-fixtures.ts';
import { apiUrl, type Fixture, fixture } from './support/storage-file-fixtures.ts';
import { expectInstanceOf } from './support/assertions.ts';

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  jest.restoreAllMocks();
});

const UNSAFE_PATH = 'Storage path cannot contain empty, ".", or ".." segments';
const UNSAFE_BUCKET = 'Bucket name cannot contain "/" or be "." or ".."';

type Run = (api: StorageFileApi, path: string) => Promise<{ data?: unknown; error: Error | null }>;
/** An operation's name, a call to it, and the `data` it returns when it refuses the input. */
type Operation = [name: string, run: Run, refusedData: null | undefined];

const pathOperations: Operation[] = [
  ['upload', (api, path) => api.upload(path, new Blob(['data'])), null],
  ['download', (api, path) => api.download(path), null],
  ['remove', (api, path) => api.remove(path), null],
  ['remove list', (api, path) => api.remove(['safe.bin', path]), null],
  ['move source', (api, path) => api.move(path, 'safe.bin'), null],
  ['move destination', (api, path) => api.move('safe.bin', path), null],
  ['copy source', (api, path) => api.copy(path, 'safe.bin'), null],
  ['copy destination', (api, path) => api.copy('safe.bin', path), null],
  ['updateVisibility', (api, path) => api.updateVisibility(path, true), null],
  ['createUploadSession', (api, path) => api.createUploadSession(path, { totalSize: 4 }), null],
  ['uploadPart', (api, path) => api.uploadPart(path, 'session-1', 1, new Blob()), null],
  ['completeUploadSession', (api, path) => api.completeUploadSession(path, 'session-1'), null],
  ['getUploadSession', (api, path) => api.getUploadSession(path, 'session-1'), null],
  ['abortUploadSession', (api, path) => api.abortUploadSession(path, 'session-1'), undefined],
  ['uploadResumable', (api, path) => api.uploadResumable(path, new Blob(['data'])), null],
];

const unsafePaths = ['..', '.', 'a/../b', 'a/./b', '../../functions/x', 'a//b', 'a/', '//a', '/'];

function expectNoRequest(given: Fixture): void {
  expect(given.fetch).not.toHaveBeenCalled();
  expect(given.upload).not.toHaveBeenCalled();
  expect(given.download).not.toHaveBeenCalled();
}

test.each(
  pathOperations.flatMap(([name, run, refusedData]) =>
    unsafePaths.map((path) => [name, path, run, refusedData] as const),
  ),
)('%s refuses %p before authentication or any request', async (_name, path, run, refusedData) => {
  const given = fixture(null);
  const exchange = jest.spyOn(given.host, '_completeOAuthExchange');
  const result = await run(given.api, path);
  expect(result.error).toEqual(new Error(UNSAFE_PATH));
  expect(result.data).toBe(refusedData);
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

test.each([null, undefined, 4, ''])('refuses a missing storage path %p before sending it', async (path) => {
  const given = fixture();
  const pending: unknown = Reflect.apply(given.api.download.bind(given.api), given.api, [path]);
  expectInstanceOf(pending, Promise);
  await expect(pending).resolves.toEqual({
    data: null,
    error: new Error('Storage path must be a non-empty string'),
  });
  expectNoRequest(given);
});

const bucketOperations: Operation[] = [
  ...pathOperations,
  ['list', (api) => api.list(), null],
  ['getPublicUrl', (api, path) => Promise.resolve(api.getPublicUrl(path)), null],
];

test.each(
  bucketOperations.flatMap(([name, run, refusedData]) =>
    ['.', '..', 'a/..', '/bucket', 'bucket/', 'team/photos'].map((bucket) => [name, bucket, run, refusedData] as const),
  ),
)('%s refuses the bucket %p before authentication or any request', async (_name, bucket, run, refusedData) => {
  const given = fixture(null, bucket);
  const exchange = jest.spyOn(given.host, '_completeOAuthExchange');
  const result = await run(given.api, 'file.bin');
  expect(result.error).toEqual(new Error(UNSAFE_BUCKET));
  expect(result.data).toBe(refusedData);
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
  expect(given.api.getPublicUrl(path).data?.publicUrl).toBe(`${apiUrl}/public/project-1/bucket/${encoded}`);
});

test('move and copy send bucket-relative paths in the request body', async () => {
  const given = fixture();
  given.fetch.mockImplementation(() => Promise.resolve(Response.json(storageObject({ name: 'to' }))));
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
