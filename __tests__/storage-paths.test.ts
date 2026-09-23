/** @jest-environment node */
import { expect, test } from '@jest/globals';
import {
  buildStorageUrl,
  encodeStoragePath,
  publicStoragePathError,
} from '../src/storage-paths.ts';

test('encodes each storage path segment without losing slash boundaries', () => {
  expect(encodeStoragePath('space here/雪 & #/file.txt')).toBe(
    'space%20here/%E9%9B%AA%20%26%20%23/file.txt',
  );
  expect(encodeStoragePath('a//b/')).toBe('a//b/');
});

test('builds a storage URL with an encoded bucket and path', () => {
  expect(buildStorageUrl('https://api.example.com', 'my bucket', encodeStoragePath('a b/c'))).toBe(
    'https://api.example.com/storage/my%20bucket/a%20b/c',
  );
});

test.each([null, undefined, 4, {}, ''])('rejects a missing storage path: %p', (path) => {
  expect(publicStoragePathError(path)).toBe('Storage path must be a non-empty string');
});

test.each(['.', '..', 'a/./b', 'a/../b'])(
  'rejects a public path containing dot segments: %s',
  (path) => {
    expect(publicStoragePathError(path)).toBe('Public URL paths cannot contain dot segments');
  },
);

test.each(['a/b', '.hidden/file', 'a/.../b'])(
  'accepts an ordinary public storage path: %s',
  (path) => {
    expect(publicStoragePathError(path)).toBeNull();
  },
);
