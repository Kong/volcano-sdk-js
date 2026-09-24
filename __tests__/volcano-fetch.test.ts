/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { volcanoFetch } from '../src/volcano-fetch.ts';

test('requires both a transport client and an authorization mode', async () => {
  const client = { _generatedFetch: jest.fn(() => Promise.resolve(new Response())) };
  await expect(volcanoFetch('/path', { volcanoAuthorization: 'anon' })).rejects.toThrow(
    'Generated transport requires a Volcano client and authorization mode',
  );
  await expect(volcanoFetch('/path', { volcanoClient: client })).rejects.toThrow(
    'Generated transport requires a Volcano client and authorization mode',
  );
  expect(client._generatedFetch).not.toHaveBeenCalled();
});

test('preserves plain text and opaque binary responses', async () => {
  const textResponse = new Response('hello', { headers: { 'Content-Type': 'text/plain' } });
  const binary = Uint8Array.from([0, 255, 128]);
  const binaryResponse = new Response(binary, {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  const client = { _generatedFetch: jest.fn(() => Promise.resolve(textResponse)) };
  const options = { volcanoAuthorization: 'anon' as const, volcanoClient: client };

  await expect(volcanoFetch('/text', options)).resolves.toMatchObject({ data: 'hello' });
  client._generatedFetch.mockResolvedValue(binaryResponse);
  const result = await volcanoFetch<{ data: Blob }>('/binary', options);
  expect(result.data).toBeInstanceOf(Blob);
  expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(binary);

  client._generatedFetch.mockResolvedValue(new Response(binary));
  const unlabelled = await volcanoFetch<{ data: Blob }>('/unlabelled', options);
  expect(new Uint8Array(await unlabelled.data.arrayBuffer())).toEqual(binary);
});

test('uses a JSON reader when the response has no Blob reader', async () => {
  const noBlobReader = new Response('{"ok":true}', {
    headers: { 'Content-Type': 'application/octet-stream' },
  });
  Object.defineProperty(noBlobReader, 'blob', { value: undefined });
  const client = { _generatedFetch: jest.fn(() => Promise.resolve(noBlobReader)) };
  const options = { volcanoAuthorization: 'session' as const, volcanoClient: client };
  await expect(volcanoFetch('/no-blob-reader', options)).resolves.toMatchObject({
    data: { ok: true },
  });
});

test('uses a status fallback when an error body is null', async () => {
  const client = {
    _generatedFetch: jest.fn(() => Promise.resolve(Response.json(null, { status: 400 }))),
  };
  await expect(
    volcanoFetch('/error', { volcanoAuthorization: 'anon', volcanoClient: client }),
  ).rejects.toMatchObject({ message: 'Request failed with status 400', status: 400, info: null });
  await expect(
    volcanoFetch('/error', { volcanoAuthorization: 'anon', volcanoClient: client }),
  ).rejects.not.toHaveProperty('code');
});

test('preserves the fallback error for a scalar response with no retry metadata', async () => {
  const client = {
    _generatedFetch: jest.fn(() => Promise.resolve(Response.json('invalid', { status: 400 }))),
  };
  const options = { volcanoAuthorization: 'anon' as const, volcanoClient: client };
  await expect(volcanoFetch('/error', options)).rejects.toMatchObject({
    message: 'Request failed with status 400',
    info: 'invalid',
  });
  await expect(volcanoFetch('/error', options)).rejects.not.toHaveProperty('code');
  await expect(volcanoFetch('/error', options)).rejects.not.toHaveProperty('retryAfter');
});

test.each([204, 205])('does not parse an empty HTTP %i response', async (status) => {
  const response = new Response(null, { status });
  const json = jest.spyOn(response, 'json');
  const blob = jest.spyOn(response, 'blob');
  const client = { _generatedFetch: jest.fn(() => Promise.resolve(response)) };
  const result = volcanoFetch<{ data: unknown }>('/empty', {
    volcanoAuthorization: 'anon',
    volcanoClient: client,
  });
  await expect(result).resolves.toMatchObject({ status, data: undefined });
  expect(json).not.toHaveBeenCalled();
  expect(blob).not.toHaveBeenCalled();
});

test('does not parse an empty HTTP 304 response before reporting the status', async () => {
  const response = new Response(null, { status: 304 });
  const json = jest.spyOn(response, 'json');
  const blob = jest.spyOn(response, 'blob');
  const client = { _generatedFetch: jest.fn(() => Promise.resolve(response)) };
  await expect(
    volcanoFetch('/not-modified', { volcanoAuthorization: 'anon', volcanoClient: client }),
  ).rejects.toMatchObject({ status: 304, info: undefined });
  expect(json).not.toHaveBeenCalled();
  expect(blob).not.toHaveBeenCalled();
});
