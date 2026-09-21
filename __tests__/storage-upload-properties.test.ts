/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import { assert, asyncProperty, uint8Array } from 'fast-check';
import { type StorageObject, VolcanoClient } from '../src/index.js';
import { propertyOptions } from './support/property-options.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

function uploadedObject(size: number): StorageObject {
  return {
    id: 'object-id',
    bucket_id: 'bucket-id',
    name: 'payload.bin',
    is_public: false,
    size,
    mime_type: 'application/octet-stream',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

async function uploadedBytes(body: RequestInit['body']): Promise<Uint8Array> {
  if (!(body instanceof FormData)) {
    throw new TypeError('Upload must use multipart form data');
  }
  const file = body.get('file');
  if (!(file instanceof Blob)) {
    throw new TypeError('Upload must contain a binary file');
  }
  return new Uint8Array(await file.arrayBuffer());
}

test('storage uploads preserve arbitrary bytes and the captured session credential', async () => {
  await assert(
    asyncProperty(uint8Array({ maxLength: 1024 }), async (bytes) => {
      const metadata = uploadedObject(bytes.length);
      const fetch = jest.spyOn(globalThis, 'fetch').mockImplementationOnce(async (_input, init) => {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer upload-session');
        expect(await uploadedBytes(init?.body)).toEqual(bytes);
        return Response.json(metadata, { status: 201 });
      });
      const client = new VolcanoClient({
        apiUrl: 'https://api.example.test',
        anonKey: 'synthetic-anon',
        accessToken: 'upload-session',
      });
      const original = new Uint8Array(bytes);
      const result = await client.storage
        .from('bucket')
        .upload('payload.bin', new Blob([original]));
      expect(result.error).toBeNull();
      expect(result.data).toEqual(metadata);
      expect(original).toEqual(bytes);
      expect(fetch).toHaveBeenLastCalledWith(
        'https://api.example.test/storage/bucket/payload.bin',
        expect.objectContaining({ method: 'POST' }),
      );
    }),
    propertyOptions(),
  );
});
