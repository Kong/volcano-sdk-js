/** @jest-environment node */

const {
  downloadStorageObject,
  renderAuthPagePreview,
} = require('../src/generated-runtime/client.js');

describe('generated text responses', () => {
  test('managed page previews return HTML as a string', async () => {
    const html = '<!doctype html><title>Preview</title>';
    const volcanoClient = {
      _generatedFetch: jest
        .fn()
        .mockResolvedValue(
          new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
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
      _generatedFetch: jest
        .fn()
        .mockResolvedValue(
          new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
        ),
    };

    const result = await downloadStorageObject('bucket', 'index.html', {
      volcanoClient,
      volcanoAuthorization: 'session',
      volcanoResponseType: 'blob',
    });

    expect(result.data).toBeInstanceOf(Blob);
    await expect(result.data.text()).resolves.toBe(html);
  });
});
