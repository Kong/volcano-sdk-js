/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { authSignin, downloadStorageObject } from '../src/generated/client.ts';

test('generated fetch preserves text responses as strings', async () => {
  const html = '<!doctype html><title>Preview</title>';
  const volcanoClient = {
    _generatedFetch: jest.fn(() =>
      Promise.resolve(
        new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    ),
  };

  const result = await authSignin(
    { email: 'user@example.test', password: 'secret' },
    { volcanoClient, volcanoAuthorization: 'session' },
  );

  expect(result.data).toBe(html);
  expect(result.status).toBe(200);
});

test('storage downloads preserve HTML bytes as a Blob', async () => {
  const html = '<!doctype html><title>Stored file</title>';
  const volcanoClient = {
    _generatedFetch: jest.fn(() =>
      Promise.resolve(
        new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    ),
  };

  const result = await downloadStorageObject('bucket', 'index.html', {
    volcanoClient,
    volcanoAuthorization: 'session',
    volcanoResponseType: 'blob',
  });

  expect(result.data).toBeInstanceOf(Blob);
  if (!(result.data instanceof Blob)) {
    throw new TypeError('Expected a binary response');
  }
  await expect(result.data.text()).resolves.toBe(html);
});
