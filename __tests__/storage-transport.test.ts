/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { type StorageFetcher, storageRequest } from '../src/storage-transport.ts';

function fetcher(response: Response) {
  const request = jest.fn<StorageFetcher>();
  request.mockResolvedValue(response);
  return request;
}

test('parses JSON success and forwards the request options', async () => {
  const request = fetcher(Response.json({ objects: [{ name: 'one' }] }));
  const options = { method: 'GET', headers: { Authorization: 'Bearer token' } };
  await expect(
    storageRequest(request, 'https://api.volcano.dev/storage/bucket', options),
  ).resolves.toEqual({
    data: { objects: [{ name: 'one' }] },
    error: null,
  });
  expect(request).toHaveBeenCalledWith('https://api.volcano.dev/storage/bucket', options);
});

test('returns an HTTP error with server and retry metadata', async () => {
  const request = fetcher(
    Response.json(
      { error: 'Rate limited', code: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': '3' } },
    ),
  );
  const result = await storageRequest(request, 'https://api.volcano.dev/storage/bucket');
  expect(result.data).toBeNull();
  expect(result.error).toMatchObject({
    message: 'Rate limited',
    status: 429,
    code: 'rate_limited',
    retryAfter: 3,
  });
});

test('preserves binary bytes for a successful blob download', async () => {
  const bytes = Uint8Array.from([0, 255, 1, 128]);
  const request = fetcher(new Response(bytes));
  const result = await storageRequest(request, 'https://api.volcano.dev/storage/bucket/file', {
    responseType: 'blob',
  });
  expect(result.error).toBeNull();
  if (!(result.data instanceof Blob)) {
    throw new TypeError('Expected a Blob');
  }
  expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(bytes);
});

test('parses a failed blob download as a server error', async () => {
  const request = fetcher(Response.json({ error: 'Missing', code: 'not_found' }, { status: 404 }));
  const result = await storageRequest(request, 'https://api.volcano.dev/storage/bucket/file', {
    responseType: 'blob',
  });
  expect(result.data).toBeNull();
  expect(result.error).toMatchObject({ message: 'Missing', status: 404, code: 'not_found' });
});

test('preserves transport errors', async () => {
  const request = jest.fn<StorageFetcher>();
  const failure = new Error('Connection lost');
  request.mockRejectedValue(failure);
  await expect(storageRequest(request, 'https://api.volcano.dev/storage/bucket')).resolves.toEqual({
    data: null,
    error: failure,
  });
});

test('normalizes non-Error failures', async () => {
  const request = jest.fn<StorageFetcher>();
  request.mockRejectedValue('connection lost');
  await expect(storageRequest(request, 'https://api.volcano.dev/storage/bucket')).resolves.toEqual({
    data: null,
    error: new Error('Request failed'),
  });
});
