/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.js';
import { sessionToken } from './session-fixtures.ts';

const fetchMock = jest.mocked(globalThis.fetch);

interface ResponseFixture {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  blob?: () => Promise<Blob>;
  headers?: Pick<Headers, 'get'>;
}

function responseStatus(input: ResponseFixture): number {
  return input.status ?? (input.ok === false ? 400 : 200);
}

function responseHeaders(input: ResponseFixture): Headers {
  const headers = new Headers();
  if (input.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

function responseFixture(input: ResponseFixture): Response {
  const response = new Response(null, {
    status: responseStatus(input),
    headers: responseHeaders(input),
  });
  if (input.json !== undefined) {
    jest.spyOn(response, 'json').mockImplementation(input.json);
  }
  if (input.blob !== undefined) {
    jest.spyOn(response, 'blob').mockImplementation(input.blob);
  }
  if (input.headers !== undefined) {
    jest.spyOn(response.headers, 'get').mockImplementation(input.headers.get);
  }
  return response;
}

function requestAt(index: number): RequestInit {
  const call = fetchMock.mock.calls[index];
  if (call?.[1] === undefined) {
    throw new TypeError(`Expected fetch call ${String(index)}`);
  }
  return call[1];
}

function formAt(index: number): FormData {
  const body = requestAt(index).body;
  if (!(body instanceof FormData)) {
    throw new TypeError(`Expected FormData in fetch call ${String(index)}`);
  }
  return body;
}

function textBodyAt(index: number): string {
  const body = requestAt(index).body;
  if (typeof body !== 'string') {
    throw new TypeError(`Expected text body in fetch call ${String(index)}`);
  }
  return body;
}

function headerAt(index: number, name: string): string | null {
  return new Headers(requestAt(index).headers).get(name);
}

describe('Storage', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
  };

  let volcano: VolcanoAuth;

  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  it.each(['status', 'abort', 'download'])(
    'preserves a missing object HTTP status for %s',
    async (operation) => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          status: 404,
          json: () => Promise.resolve({ error: 'not found', code: 'storage_not_found' }),
        }),
      );
      const bucket = volcano.storage.from('uploads');
      let result;
      switch (operation) {
        case 'status': {
          result = await bucket.getUploadSession('missing.bin', 'missing-session');
          break;
        }
        case 'abort': {
          result = await bucket.abortUploadSession('missing.bin', 'missing-session');
          break;
        }
        default: {
          result = await bucket.download('missing.bin');
        }
      }
      expect(result.error).toMatchObject({
        status: 404,
        message: 'not found',
        code: 'storage_not_found',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  describe('storage.from()', () => {
    it('should return StorageFileApi instance', () => {
      const bucket = volcano.storage.from('avatars');
      expect(bucket).toBeDefined();
      expect(typeof bucket.upload).toBe('function');
      expect(typeof bucket.download).toBe('function');
      expect(typeof bucket.list).toBe('function');
      expect(typeof bucket.remove).toBe('function');
      expect(typeof bucket.move).toBe('function');
      expect(typeof bucket.copy).toBe('function');
      expect(typeof bucket.getPublicUrl).toBe('function');
      expect(typeof bucket.updateVisibility).toBe('function');
    });

    it('should store bucket name', () => {
      const bucket = volcano.storage.from('my-bucket');
      expect(Reflect.get(bucket, 'bucketName')).toBe('my-bucket');
    });
  });

  describe('JavaScript option compatibility', () => {
    const absentValues = [undefined, null, false, 0, Number.NaN, ''];

    it.each(absentValues)('omits a falsy list prefix (%s)', async (prefix) => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({ ok: true, json: () => Promise.resolve({ objects: [] }) }),
      );

      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(bucket.list.bind(bucket), undefined, [prefix]);

      expect(result).toMatchObject({ error: null });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test.com/storage/files');
    });

    it.each(absentValues)('omits falsy list options (%s)', async (value) => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({ ok: true, json: () => Promise.resolve({ objects: [] }) }),
      );

      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(bucket.list.bind(bucket), undefined, [
        '',
        {
          limit: value,
          cursor: value,
        },
      ]);

      expect(result).toMatchObject({ error: null });
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test.com/storage/files');
    });

    it.each(absentValues)('rejects a falsy upload size locally (%s)', async (totalSize) => {
      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(
        bucket.createUploadSession.bind(bucket),
        undefined,
        ['file.bin', { totalSize }],
      );

      expect(result).toMatchObject({ error: { message: 'totalSize is required' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(absentValues)('defaults a falsy session content type (%s)', async (contentType) => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({ ok: true, json: () => Promise.resolve({}) }),
      );

      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(
        bucket.createUploadSession.bind(bucket),
        undefined,
        ['file.bin', { totalSize: 1, contentType }],
      );

      expect(result).toMatchObject({ error: null });
      const body: unknown = JSON.parse(textBodyAt(0));
      expect(body).toMatchObject({ content_type: 'application/octet-stream' });
    });

    it.each(absentValues)('defaults a falsy Blob content type (%s)', async (contentType) => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({ ok: true, json: () => Promise.resolve({}) }),
      );

      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(bucket.upload.bind(bucket), undefined, [
        'file.bin',
        new Blob(['data']),
        { contentType },
      ]);

      expect(result).toMatchObject({ error: null });
      expect(formAt(0).get('file')).toMatchObject({ type: 'application/octet-stream' });
    });

    it.each(absentValues)('omits a falsy download range (%s)', async (range) => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({ ok: true, blob: () => Promise.resolve(new Blob(['data'])) }),
      );

      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(bucket.download.bind(bucket), undefined, [
        'file.bin',
        { range },
      ]);

      expect(result).toMatchObject({ error: null });
      expect(headerAt(0, 'Range')).toBeNull();
    });

    it('rejects null session options locally', async () => {
      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(
        bucket.createUploadSession.bind(bucket),
        undefined,
        ['file.bin', null],
      );

      expect(result).toMatchObject({ error: { message: 'totalSize is required' } });
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('upload()', () => {
    it('should upload a File successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        bucket_id: 'bucket-456',
        name: 'avatar.png',
        size: 1024,
        mime_type: 'image/png',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      // Create a mock File
      const file = new File(['test content'], 'avatar.png', { type: 'image/png' });

      const { data, error } = await volcano.storage.from('avatars').upload('user/avatar.png', file);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/avatars/user/avatar.png',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('replays the same upload file after an authentication rejection', async () => {
      volcano = new VolcanoAuth({
        ...config,
        accessToken: sessionToken(),
        refreshToken: 'valid-refresh',
      });
      const file = new File(['hello\u0000\u00FF'], 'file.bin', {
        type: 'application/octet-stream',
      });
      fetchMock
        .mockResolvedValueOnce(
          responseFixture({
            ok: false,
            status: 401,
            json: () => Promise.resolve({ error: 'expired' }),
          }),
        )
        .mockResolvedValueOnce(
          responseFixture({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                access_token: sessionToken(undefined, true),
                refresh_token: 'new-refresh',
                expires_in: 3600,
                user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
              }),
          }),
        )
        .mockResolvedValueOnce(
          responseFixture({
            ok: true,
            status: 201,
            json: () => Promise.resolve({ name: 'file.bin' }),
          }),
        );

      const result = await volcano.storage.from('files').upload('file.bin', file);

      expect(result.error).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3);
      const first = fetchMock.mock.calls[0];
      const replay = fetchMock.mock.calls[2];
      expect(replay?.[0]).toBe(first?.[0]);
      expect(headerAt(2, 'Authorization')).toBe(`Bearer ${sessionToken(undefined, true)}`);
      expect(formAt(0).get('file')).toBe(file);
      expect(formAt(2).get('file')).toBe(file);
    });

    it('should upload a Blob successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'data.json',
        size: 50,
        mime_type: 'application/json',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const blob = new Blob(['{"hello": "world"}'], { type: 'application/json' });

      const { data, error } = await volcano.storage
        .from('files')
        .upload('data.json', blob, { contentType: 'application/json' });

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
    });

    it('should upload an ArrayBuffer successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'binary.bin',
        size: 4,
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const buffer = new ArrayBuffer(4);

      const { data, error } = await volcano.storage.from('files').upload('binary.bin', buffer);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
    });

    it('should return error for invalid file body type', async () => {
      const bucket = volcano.storage.from('files');
      const result: unknown = await Reflect.apply(bucket.upload.bind(bucket), undefined, [
        'test.txt',
        'invalid string body',
      ]);

      expect(result).toMatchObject({
        data: null,
        error: { message: 'Invalid file body type. Expected File, Blob, or ArrayBuffer.' },
      });
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const { data, error } = await volcano.storage.from('files').upload('test.txt', file);

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on upload failure', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'File too large' }),
        }),
      );

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const { data, error } = await volcano.storage.from('files').upload('test.txt', file);

      expect(data).toBeNull();
      expect(error?.message).toBe('File too large');
    });
  });

  describe('download()', () => {
    it('should download a file successfully', async () => {
      const mockBlob = new Blob(['file content'], { type: 'text/plain' });

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        }),
      );

      const { data, error } = await volcano.storage.from('files').download('document.txt');

      expect(error).toBeNull();
      expect(data).toBeInstanceOf(Blob);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/files/document.txt',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('should preserve JSON file bytes as a Blob', async () => {
      const mockBlob = new Blob(['{"hello":"world"}'], { type: 'application/json' });

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          status: 200,
          headers: { get: () => 'application/json' },
          json: () => Promise.resolve({ hello: 'world' }),
          blob: () => Promise.resolve(mockBlob),
        }),
      );

      const { data, error } = await volcano.storage.from('files').download('data.json');

      expect(error).toBeNull();
      expect(data).toBe(mockBlob);
    });

    it('should support Range header for partial downloads', async () => {
      const mockBlob = new Blob(['partial content']);

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          blob: () => Promise.resolve(mockBlob),
        }),
      );

      await volcano.storage.from('files').download('large-file.zip', { range: 'bytes=0-1023' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Range: 'bytes=0-1023',
          }),
        }),
      );
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').download('test.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on download failure', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'File not found' }),
        }),
      );

      const { data, error } = await volcano.storage.from('files').download('nonexistent.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('File not found');
    });
  });

  describe('list()', () => {
    it('should list files successfully', async () => {
      const mockObjects = [
        { id: 'obj-1', name: 'file1.txt', size: 100 },
        { id: 'obj-2', name: 'file2.txt', size: 200 },
      ];

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ objects: mockObjects, next_cursor: null }),
        }),
      );

      const { data, error, nextCursor } = await volcano.storage.from('files').list();

      expect(error).toBeNull();
      expect(data).toEqual(mockObjects);
      expect(nextCursor).toBeNull();
    });

    it('should refresh token on 401 and retry', async () => {
      volcano = new VolcanoAuth({
        ...config,
        accessToken: sessionToken(),
        refreshToken: 'valid-refresh',
      });

      // First call returns 401
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Token expired' }),
        }),
      );

      // Refresh call succeeds
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () =>
            Promise.resolve({
              access_token: sessionToken(undefined, true),
              refresh_token: 'new-refresh-token',
              expires_in: 3600,
              user: { id: 'user-123', email: 'fixture@example.com', status: 'active' },
            }),
        }),
      );

      // Retry call succeeds
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ objects: [], next_cursor: null }),
        }),
      );

      const { error } = await volcano.storage.from('files').list();

      expect(error).toBeNull();
      expect(Reflect.get(volcano, 'accessToken')).toBe(sessionToken(undefined, true));
    });

    it('should list files with prefix', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ objects: [], next_cursor: null }),
        }),
      );

      await volcano.storage.from('files').list('user/documents/');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/files?prefix=user%2Fdocuments%2F',
        expect.any(Object),
      );
    });

    it('should support pagination options', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ objects: [], next_cursor: 'cursor-abc' }),
        }),
      );

      const { nextCursor } = await volcano.storage
        .from('files')
        .list('', { limit: 50, cursor: 'prev-cursor' });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('limit=50'),
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('cursor=prev-cursor'),
        expect.any(Object),
      );
      expect(nextCursor).toBe('cursor-abc');
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').list();

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on list failure', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'Access denied' }),
        }),
      );

      const { data, error } = await volcano.storage.from('files').list();

      expect(data).toBeNull();
      expect(error?.message).toBe('Access denied');
    });
  });

  describe('remove()', () => {
    it('preserves each failed deletion and the first failure metadata', async () => {
      fetchMock
        .mockResolvedValueOnce(
          responseFixture({
            ok: false,
            status: 404,
            json: () => Promise.resolve({ error: 'missing', code: 'not_found' }),
          }),
        )
        .mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({}) }))
        .mockResolvedValueOnce(
          responseFixture({
            ok: false,
            status: 429,
            headers: { get: () => '7' },
            json: () => Promise.resolve({ error: 'slow down', code: 'rate_limited' }),
          }),
        );
      const result = await volcano.storage.from('files').remove(['missing', 'removed', 'limited']);
      expect(result.data?.deleted).toEqual(['removed']);
      expect(result.error).toMatchObject({
        status: 404,
        code: 'not_found',
        failures: [
          { path: 'missing', error: { status: 404, code: 'not_found' } },
          { path: 'limited', error: { status: 429, code: 'rate_limited', retryAfter: 7 } },
        ],
      });
      expect(result.error?.retryAfter).toBeUndefined();
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('preserves metadata when deleting one file fails', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          status: 429,
          headers: { get: () => '7' },
          json: () => Promise.resolve({ error: 'slow down', code: 'rate_limited' }),
        }),
      );
      const result = await volcano.storage.from('files').remove('limited');
      expect(result.error).toMatchObject({ status: 429, code: 'rate_limited', retryAfter: 7 });
      expect(result.data?.deleted).toEqual([]);
    });

    it('should delete a single file successfully', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ message: 'deleted' }),
        }),
      );

      const { data, error } = await volcano.storage.from('files').remove('old-file.txt');

      expect(error).toBeNull();
      expect(data?.deleted).toContain('old-file.txt');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/files/old-file.txt',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should delete multiple files successfully', async () => {
      fetchMock
        .mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({}) }))
        .mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({}) }))
        .mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({}) }));

      const { data, error } = await volcano.storage
        .from('files')
        .remove(['file1.txt', 'file2.txt', 'file3.txt']);

      expect(error).toBeNull();
      expect(data?.deleted).toHaveLength(3);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('should return partial error when some files fail to delete', async () => {
      fetchMock
        .mockResolvedValueOnce(
          responseFixture({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) }),
        )
        .mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({}) }));

      const { data, error } = await volcano.storage
        .from('files')
        .remove(['missing.txt', 'exists.txt']);

      expect(data?.deleted).toContain('exists.txt');
      expect(error?.message).toContain('Failed to delete 1 file(s)');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').remove('test.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('move()', () => {
    it('should move a file successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'new-location/file.txt',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('files')
        .move('old/file.txt', 'new-location/file.txt');

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/files/move',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ from: 'old/file.txt', to: 'new-location/file.txt' }),
        }),
      );
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').move('from.txt', 'to.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on move failure', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'Source not found' }),
        }),
      );

      const { data, error } = await volcano.storage.from('files').move('missing.txt', 'dest.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('Source not found');
    });
  });

  describe('copy()', () => {
    it('should copy a file successfully', async () => {
      const mockResponse = {
        id: 'obj-new',
        name: 'copy/file.txt',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('files')
        .copy('original/file.txt', 'copy/file.txt');

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/files/copy',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ from: 'original/file.txt', to: 'copy/file.txt' }),
        }),
      );
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').copy('from.txt', 'to.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on copy failure', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'Access denied' }),
        }),
      );

      const { data, error } = await volcano.storage.from('files').copy('protected.txt', 'copy.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('Access denied');
    });
  });

  describe('getPublicUrl()', () => {
    // Create a valid JWT-like anon key with project_id
    const validAnonKey = `ak-${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ project_id: 'proj-123-456' }))}.${btoa('signature')}`;

    let volcanoWithValidKey: VolcanoAuth;

    beforeEach(() => {
      volcanoWithValidKey = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: validAnonKey,
      });
    });

    it('should return public URL for a file', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('public-bucket')
        .getPublicUrl('images/photo.jpg');

      expect(error).toBeNull();
      expect(data?.publicUrl).toBe(
        'https://api.test.com/public/proj-123-456/public-bucket/images/photo.jpg',
      );
    });

    it('should URL encode paths with spaces', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('files')
        .getPublicUrl('folder/file name.txt');

      expect(error).toBeNull();
      expect(data?.publicUrl).toBe(
        'https://api.test.com/public/proj-123-456/files/folder/file%20name.txt',
      );
    });

    it('should URL encode paths with special characters', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('user-files')
        .getPublicUrl('screenshots/Screenshot 2026-01-21 at 10.17.07 PM.png');

      expect(error).toBeNull();
      expect(data?.publicUrl).toBe(
        'https://api.test.com/public/proj-123-456/user-files/screenshots/Screenshot%202026-01-21%20at%2010.17.07%20PM.png',
      );
    });

    it('should URL encode bucket names with special characters', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('my bucket')
        .getPublicUrl('file.txt');

      expect(error).toBeNull();
      expect(data?.publicUrl).toBe('https://api.test.com/public/proj-123-456/my%20bucket/file.txt');
    });

    it('should return error for invalid anon key format', () => {
      const volcanoInvalid = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: 'ak-invalid-not-jwt',
      });

      const { data, error } = volcanoInvalid.storage.from('bucket').getPublicUrl('file.txt');

      expect(data).toBeNull();
      expect(error?.message).toContain('Invalid anon key format');
    });

    it('should extract project ID correctly from JWT payload', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('avatars')
        .getPublicUrl('user/profile.png');

      expect(error).toBeNull();
      expect(data?.publicUrl).toContain('/public/proj-123-456/');
    });

    it.each([
      ['an empty path', ''],
      ['multiple paths', ['first.txt', 'second.txt']],
    ])('should reject %s', (_description, path) => {
      const bucket = volcanoWithValidKey.storage.from('avatars');
      const result: unknown = Reflect.apply(bucket.getPublicUrl.bind(bucket), undefined, [path]);

      expect(result).toMatchObject({
        data: null,
        error: { message: 'Storage path must be a non-empty string' },
      });
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['.', 'avatars/../secret.txt'])('should reject dot segment path %s', (path) => {
      const { data, error } = volcanoWithValidKey.storage.from('avatars').getPublicUrl(path);

      expect(data).toBeNull();
      expect(error?.message).toBe('Public URL paths cannot contain dot segments');
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('updateVisibility()', () => {
    it('should update file visibility to public', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'file.txt',
        is_public: true,
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('file.txt', true);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/files/file.txt/visibility',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ is_public: true }),
        }),
      );
    });

    it('should update file visibility to private', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'file.txt',
        is_public: false,
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('file.txt', false);

      expect(error).toBeNull();
      expect(data?.is_public).toBe(false);
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('file.txt', true);

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });

    it('should return error when not the owner', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'only the file owner can change visibility' }),
        }),
      );

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('someone-elses-file.txt', true);

      expect(data).toBeNull();
      expect(error?.message).toBe('only the file owner can change visibility');
    });
  });

  // ========================================================================
  // Resumable Upload Tests
  // ========================================================================

  describe('createUploadSession()', () => {
    it('should create an upload session successfully', async () => {
      const mockResponse = {
        session_id: 'sess-123',
        part_size: 25 * 1024 * 1024,
        total_parts: 4,
        expires_at: '2026-01-30T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('uploads')
        .createUploadSession('large-video.mp4', {
          totalSize: 100 * 1024 * 1024,
          contentType: 'video/mp4',
        });

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/uploads/large-video.mp4',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-access-token',
          }),
        }),
      );
    });

    it('should return error when totalSize is not provided', async () => {
      const bucket = volcano.storage.from('uploads');
      const result: unknown = await Reflect.apply(
        bucket.createUploadSession.bind(bucket),
        undefined,
        ['file.mp4', {}],
      );

      expect(result).toMatchObject({ data: null, error: { message: 'totalSize is required' } });
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage
        .from('uploads')
        .createUploadSession('file.mp4', { totalSize: 1000 });

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('uploadPart()', () => {
    it('should upload a part successfully', async () => {
      const mockResponse = {
        part_number: 1,
        etag: 'abc123',
        size: 25 * 1024 * 1024,
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const partData = new ArrayBuffer(1024);
      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadPart('large-video.mp4', 'sess-123', 1, partData);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/uploads/large-video.mp4',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'X-Upload-Session': 'sess-123',
            'X-Part-Number': '1',
            'Content-Type': 'application/octet-stream',
          }),
        }),
      );
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadPart('file.mp4', 'sess-123', 1, new ArrayBuffer(100));

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('completeUploadSession()', () => {
    it('should complete an upload session successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'large-video.mp4',
        size: 100 * 1024 * 1024,
        mime_type: 'video/mp4',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('uploads')
        .completeUploadSession('large-video.mp4', 'sess-123');

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/uploads/large-video.mp4',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'X-Upload-Session': 'sess-123',
            'X-Upload-Complete': 'true',
          }),
        }),
      );
    });

    it('should return error when not all parts uploaded', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'not all parts uploaded' }),
        }),
      );

      const { data, error } = await volcano.storage
        .from('uploads')
        .completeUploadSession('file.mp4', 'sess-123');

      expect(data).toBeNull();
      expect(error?.message).toBe('not all parts uploaded');
    });
  });

  describe('getUploadSession()', () => {
    it('should get upload session status successfully', async () => {
      const mockResponse = {
        session_id: 'sess-123',
        path: 'large-video.mp4',
        status: 'uploading',
        content_type: 'video/mp4',
        total_size: 100 * 1024 * 1024,
        part_size: 25 * 1024 * 1024,
        total_parts: 4,
        parts_uploaded: 2,
        bytes_uploaded: 50 * 1024 * 1024,
        parts: [
          { part_number: 1, etag: 'etag-1', size: 25 * 1024 * 1024 },
          { part_number: 2, etag: 'etag-2', size: 25 * 1024 * 1024 },
        ],
        expires_at: '2026-01-30T00:00:00Z',
        created_at: '2026-01-23T00:00:00Z',
      };

      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        }),
      );

      const { data, error } = await volcano.storage
        .from('uploads')
        .getUploadSession('large-video.mp4', 'sess-123');

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/uploads/large-video.mp4',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'X-Upload-Session': 'sess-123',
          }),
        }),
      );
    });

    it('should return error for non-existent session', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'session not found' }),
        }),
      );

      const { data, error } = await volcano.storage
        .from('uploads')
        .getUploadSession('file.mp4', 'invalid-session');

      expect(data).toBeNull();
      expect(error?.message).toBe('session not found');
    });
  });

  describe('abortUploadSession()', () => {
    it('should abort an upload session successfully', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ message: 'session aborted' }),
        }),
      );

      const { error } = await volcano.storage
        .from('uploads')
        .abortUploadSession('large-video.mp4', 'sess-123');

      expect(error).toBeNull();
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.test.com/storage/uploads/large-video.mp4',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({
            'X-Upload-Session': 'sess-123',
          }),
        }),
      );
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { error } = await volcano.storage
        .from('uploads')
        .abortUploadSession('file.mp4', 'sess-123');

      expect(error?.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('uploadResumable()', () => {
    it('should upload a file in parts successfully', async () => {
      // Mock create session
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () =>
            Promise.resolve({
              session_id: 'sess-123',
              total_parts: 2,
              part_size: 1024,
            }),
        }),
      );

      // Mock upload part 1
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ part_number: 1, etag: 'etag1' }),
        }),
      );

      // Mock upload part 2
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ part_number: 2, etag: 'etag2' }),
        }),
      );

      // Mock complete session
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () =>
            Promise.resolve({
              id: 'obj-123',
              name: 'file.bin',
              size: 2048,
            }),
        }),
      );

      const file = new Blob([new ArrayBuffer(2048)], { type: 'application/octet-stream' });
      const progressCalls: { uploaded: number; total: number }[] = [];

      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', file, {
          partSize: 1024,
          onProgress(uploaded, total) {
            progressCalls.push({ uploaded, total });
          },
        });

      expect(error).toBeNull();
      expect(data).toMatchObject({ name: 'file.bin' });
      expect(fetchMock).toHaveBeenCalledTimes(4); // create + 2 parts + complete
      expect(progressCalls).toHaveLength(2);
    });

    it('should abort and return error when part upload fails', async () => {
      // Mock create session
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () =>
            Promise.resolve({
              session_id: 'sess-123',
              total_parts: 2,
              part_size: 1024,
            }),
        }),
      );

      // Mock upload part 1 failure
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: false,
          json: () => Promise.resolve({ error: 'upload failed' }),
        }),
      );

      // Mock abort
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({}),
        }),
      );

      const file = new Blob([new ArrayBuffer(2048)]);

      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', file, { partSize: 1024 });

      expect(data).toBeNull();
      expect(error?.message).toBe('upload failed');
    });

    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const file = new Blob([new ArrayBuffer(1024)]);
      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', file);

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
  });
});
