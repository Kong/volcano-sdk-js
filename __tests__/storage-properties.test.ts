/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { assert, asyncProperty, constantFrom, property, string, uint8Array } from 'fast-check';
import { VolcanoClient } from '../src/index.js';
import { propertyOptions } from './support/property-options.ts';

const payload = Buffer.from(JSON.stringify({ project_id: 'property-project' })).toString(
  'base64url',
);
const options = { apiUrl: 'https://api.example.test', anonKey: `ak-header.${payload}.signature` };

afterEach(() => {
  jest.restoreAllMocks();
});

test('public storage URLs encode Unicode without changing query, fragment, or project', () => {
  assert(
    property(string({ unit: 'binary', maxLength: 128 }), (value) => {
      const bucket = new VolcanoClient(options).storage.from('bucket');
      const path = `files/item-${value.replaceAll('/', '-')}`;
      const result = bucket.getPublicUrl(path);
      expect(result.error).toBeNull();
      expect(result.data?.publicUrl).toBe(
        `${options.apiUrl}/public/property-project/bucket/${path
          .split('/')
          .map((segment) => encodeURIComponent(segment))
          .join('/')}`,
      );
      const url = new URL(result.data?.publicUrl ?? '');
      expect(url.search).toBe('');
      expect(url.hash).toBe('');
    }),
    propertyOptions(),
  );
});

test('public storage URLs reject every literal dot segment', () => {
  assert(
    property(string(), constantFrom('.', '..'), (prefix, segment) => {
      const bucket = new VolcanoClient(options).storage.from('bucket');
      const result = bucket.getPublicUrl(`item-${prefix}/${segment}/file`);
      expect(result.data).toBeNull();
      expect(result.error).toBeInstanceOf(Error);
    }),
    propertyOptions(),
  );
});

test('storage downloads preserve arbitrary bytes through the generated transport', async () => {
  await assert(
    asyncProperty(uint8Array({ maxLength: 1024 }), async (bytes) => {
      const response = new Response(new Uint8Array(bytes), {
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      const fetch = jest.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response);
      const bucket = new VolcanoClient({
        ...options,
        accessToken: 'synthetic-access',
      }).storage.from('bucket');
      const result = await bucket.download('payload.bin');
      expect(result.error).toBeNull();
      expect(result.data).toBeInstanceOf(Blob);
      if (result.data === null) {
        throw new Error('Download returned no binary body');
      }
      expect(new Uint8Array(await result.data.arrayBuffer())).toEqual(bytes);
      expect(fetch).toHaveBeenLastCalledWith(
        `${options.apiUrl}/storage/bucket/payload.bin`,
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer synthetic-access' }),
        }),
      );
    }),
    propertyOptions(),
  );
});
