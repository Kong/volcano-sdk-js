/** @jest-environment node */
import { expect, jest, test } from '@jest/globals';
import { downloadStorageObject, renderAuthPagePreview } from '../src/generated/client.ts';

test('managed page previews return HTML as a string', async () => {
  const html = '<!doctype html><title>Preview</title>';
  const volcanoClient = {
    _generatedFetch: jest.fn(() =>
      Promise.resolve(
        new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
      ),
    ),
  };

  const result = await renderAuthPagePreview(
    'project-id',
    'login',
    { ticket: 'preview-ticket' },
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
