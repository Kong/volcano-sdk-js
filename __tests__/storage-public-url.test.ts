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

test.each(['', '.', 'folder/../photo.png'])('rejects an invalid public path: %p', (path) => {
  const result = storagePublicUrl('https://api.volcano.dev', 'bucket', token({}), path);
  expect(result.data).toBeNull();
  expect(result.error?.message).toMatch(/path|dot segments/i);
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

test('reports a path encoding failure', () => {
  const result = storagePublicUrl(
    'https://api.volcano.dev',
    'bucket',
    token({ project_id: 'project-1' }),
    '\uD800',
  );
  expect(result.data).toBeNull();
  expect(result.error?.message).toMatch(/^Failed to parse anon key:/);
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
