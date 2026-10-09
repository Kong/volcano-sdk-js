/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { storagePublicUrl } from '../src/storage-public-url.ts';
import * as tokenClaims from '../src/token-claims.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

function token(payload: unknown): string {
  return `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;
}

test('encodes the bucket and each path segment into the public URL', () => {
  const result = storagePublicUrl(
    'https://api.volcano.dev',
    'user uploads',
    token({ project_id: 'project-1' }),
    'images/photo name.png',
  );
  expect(result).toEqual({
    data: {
      publicUrl: 'https://api.volcano.dev/public/project-1/user%20uploads/images/photo%20name.png',
    },
    error: null,
  });
});

test.each([
  ['', 'Storage path must be a non-empty string'],
  ['.', 'Storage path cannot contain empty, ".", or ".." segments'],
  ['folder/../photo.png', 'Storage path cannot contain empty, ".", or ".." segments'],
  ['folder//photo.png', 'Storage path cannot contain empty, ".", or ".." segments'],
  ['photo\uD800.png', 'Storage path is not well-formed Unicode'],
])('rejects an invalid public path: %p', (path, message) => {
  const result = storagePublicUrl('https://api.volcano.dev', 'bucket', token({}), path);
  expect(result).toEqual({ data: null, error: new Error(message) });
});

test.each([
  ['', 'Bucket name must be a non-empty string'],
  ['.', 'Bucket name cannot contain "/" or be "." or ".."'],
  ['..', 'Bucket name cannot contain "/" or be "." or ".."'],
  ['team/..', 'Bucket name cannot contain "/" or be "." or ".."'],
  ['b\uD800', 'Bucket name is not well-formed Unicode'],
])('rejects an invalid public bucket %p before the path', (bucketName, message) => {
  const result = storagePublicUrl('https://api.volcano.dev', bucketName, token({}), '..');
  expect(result).toEqual({ data: null, error: new Error(message) });
});

test('drops a single leading slash from the public URL path', () => {
  const result = storagePublicUrl(
    'https://api.volcano.dev',
    'bucket',
    token({ project_id: 'project-1' }),
    '/images/photo.png',
  );
  expect(result.data?.publicUrl).toBe(
    'https://api.volcano.dev/public/project-1/bucket/images/photo.png',
  );
});

test('encodes the anon-key project ID as one path segment', () => {
  const result = storagePublicUrl(
    'https://api.volcano.dev',
    'bucket',
    token({ project_id: 'team project?x#y' }),
    'file.txt',
  );
  expect(result.data?.publicUrl).toBe(
    'https://api.volcano.dev/public/team%20project%3Fx%23y/bucket/file.txt',
  );
});

test.each([
  ['.', 'Project ID in anon key cannot contain "/" or be "." or ".."'],
  ['..', 'Project ID in anon key cannot contain "/" or be "." or ".."'],
  ['team/..', 'Project ID in anon key cannot contain "/" or be "." or ".."'],
  [' ', 'Project ID in anon key must be a non-empty string'],
])('rejects the anon-key project ID %p', (projectId, message) => {
  const result = storagePublicUrl(
    'https://api.volcano.dev',
    'bucket',
    token({ project_id: projectId }),
    'file.txt',
  );
  expect(result).toEqual({ data: null, error: new Error(message) });
});

test('rejects an anon key without exactly three parts', () => {
  const result = storagePublicUrl('https://api.volcano.dev', 'bucket', 'not-a-jwt', 'file.txt');
  expect(result).toEqual({ data: null, error: new Error('Invalid anon key format') });
});

test.each([null, 'value', {}, { project_id: null }, { project_id: 42 }, { project_id: '' }])(
  'rejects an anon key without a string project ID: %p',
  (payload) => {
    const result = storagePublicUrl(
      'https://api.volcano.dev',
      'bucket',
      token(payload),
      'file.txt',
    );
    expect(result).toEqual({ data: null, error: new Error('Project ID not found in anon key') });
  },
);

test('reports malformed anon-key JSON', () => {
  const result = storagePublicUrl('https://api.volcano.dev', 'bucket', 'a.invalid.c', 'file.txt');
  expect(result.data).toBeNull();
  expect(result.error?.message).toMatch(/^Failed to parse anon key:/);
});

test('reports a path that cannot be encoded as the path, not the anon key', () => {
  const result = storagePublicUrl(
    'https://api.volcano.dev',
    'bucket',
    token({ project_id: 'project-1' }),
    '\uD800',
  );
  expect(result).toEqual({
    data: null,
    error: new Error('Storage path is not well-formed Unicode'),
  });
});

test('normalizes a non-Error failure from the decoder', () => {
  const controller = new AbortController();
  controller.abort('unexpected');
  jest.spyOn(tokenClaims, 'decodeBase64Url').mockImplementation(() => {
    controller.signal.throwIfAborted();
    return '';
  });
  const result = storagePublicUrl('https://api.volcano.dev', 'bucket', 'a.b.c', 'file.txt');
  expect(result).toEqual({
    data: null,
    error: new Error('Failed to parse anon key: Unknown error'),
  });
});
