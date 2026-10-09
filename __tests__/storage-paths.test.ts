/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import {
  bucketRelativePath,
  buildStorageUrl,
  encodeStoragePath,
  storageTargetError,
} from '../src/storage-paths.ts';

const UNSAFE_PATH = 'Storage path cannot contain empty, ".", or ".." segments';
const UNSAFE_BUCKET = 'Bucket name cannot contain "/" or be "." or ".."';

function storagePathError(path: unknown): string | null {
  return storageTargetError('bucket', [path]);
}

function bucketNameError(bucketName: unknown): string | null {
  return storageTargetError(bucketName, []);
}

test('encodes each storage path segment without losing slash boundaries', () => {
  expect(encodeStoragePath('space here/雪 & #/file.txt')).toBe(
    'space%20here/%E9%9B%AA%20%26%20%23/file.txt',
  );
  expect(encodeStoragePath('a//b/')).toBe('a//b/');
});

test.each([
  ['/a/b', 'a/b'],
  ['//a', '/a'],
  ['a/b', 'a/b'],
  ['a/', 'a/'],
  ['/', ''],
])('drops one leading slash from %p', (path, relative) => {
  expect(bucketRelativePath(path)).toBe(relative);
  expect(encodeStoragePath(path)).toBe(relative);
});

test('builds a storage URL with an encoded bucket and path', () => {
  expect(buildStorageUrl('https://api.example.com', 'my bucket', encodeStoragePath('a b/c'))).toBe(
    'https://api.example.com/storage/my%20bucket/a%20b/c',
  );
});

test.each([
  ['%2e%2e', '%252e%252e'],
  ['%2E%2E/%2e', '%252E%252E/%252e'],
  ['.%2e/x', '.%252e/x'],
  ['a\\..\\b', 'a%5C..%5Cb'],
])('encodes the literal path %s instead of decoding it into a dot segment', (path, encoded) => {
  expect(storagePathError(path)).toBeNull();
  const url = buildStorageUrl('https://api.example.com', 'bucket', encodeStoragePath(path));
  expect(url).toBe(`https://api.example.com/storage/bucket/${encoded}`);
  expect(new URL(url).pathname).toBe(`/storage/bucket/${encoded}`);
});

test.each([null, undefined, 4, {}, ''])('rejects a missing storage path: %p', (path) => {
  expect(storagePathError(path)).toBe('Storage path must be a non-empty string');
});

test.each([
  '.',
  '..',
  './a',
  '../a',
  'a/.',
  'a/..',
  'a/./b',
  'a/../b',
  '../../functions/x',
  'a//b',
  'a/',
  '/',
  '//a',
  '/../a',
])('rejects a path with an empty or dot segment: %s', (path) => {
  expect(storagePathError(path)).toBe(UNSAFE_PATH);
});

test.each(['a', 'a/b', '/a', '/a/b', '.hidden/file', 'a/.../b', 'a/..b/c.', '雪/🌋 file.txt'])(
  'accepts an ordinary storage path: %s',
  (path) => {
    expect(storagePathError(path)).toBeNull();
  },
);

test.each(['', ' '])('rejects a missing bucket name: %p', (bucketName) => {
  expect(bucketNameError(bucketName)).toBe('Bucket name must be a non-empty string');
});

test.each([null, undefined, {}, { toString: () => 'bucket' }, Symbol('bucket')])(
  'rejects the bucket name %p, which is not a string, number, bigint or boolean',
  (bucketName) => {
    expect(bucketNameError(bucketName)).toBe('Bucket name must be a non-empty string');
  },
);

test.each([2024, 7n, true])('accepts the bucket name %p as its string form', (bucketName) => {
  expect(bucketNameError(bucketName)).toBeNull();
});

test.each(['.', '..', '/', '/bucket', 'bucket/', 'a/b', 'a/..', '../a'])(
  'rejects the bucket name %s, which is a dot segment or contains "/"',
  (bucketName) => {
    expect(bucketNameError(bucketName)).toBe(UNSAFE_BUCKET);
  },
);

test.each(['bucket', 'my bucket', 'user_files-2', '.bucket', '...', 'a\\b', '%2e%2e', 'a%2Fb'])(
  'accepts an ordinary bucket name: %s',
  (bucketName) => {
    expect(bucketNameError(bucketName)).toBeNull();
  },
);

test('reports the bucket before any path', () => {
  expect(storageTargetError('..', ['', '..'])).toBe(UNSAFE_BUCKET);
});

test('reports the first invalid path in order', () => {
  expect(storageTargetError('bucket', ['ok', '', '..'])).toBe(
    'Storage path must be a non-empty string',
  );
  expect(storageTargetError('bucket', ['ok', 'a/..', ''])).toBe(UNSAFE_PATH);
});

test.each(['a\uD800', 'ok/\uDC00.txt'])(
  'rejects the lone surrogate in %p, which encodeURIComponent cannot encode',
  (path) => {
    expect(storagePathError(path)).toBe('Storage path is not well-formed Unicode');
  },
);

test('rejects a bucket name with a lone surrogate', () => {
  expect(bucketNameError('b\uD800')).toBe('Bucket name is not well-formed Unicode');
});

test('accepts a valid bucket with valid paths', () => {
  expect(storageTargetError('bucket', ['a', '/b/c'])).toBeNull();
});
