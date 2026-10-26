/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { sessionToken } from './session-fixtures.ts';
import { storageObject } from './storage-response-fixtures.ts';
import { responseFixture } from './support/storage-requests.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function downloadsFiles(): void {
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
}

function downloadsRangesAndFailures(): void {
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
}

function listsFiles(): void {
  it('should list files successfully', async () => {
    const mockObjects = [
      storageObject({ id: 'obj-1', name: 'file1.txt', size: 100 }),
      storageObject({ id: 'obj-2', name: 'file2.txt', size: 200 }),
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
}

function refreshesExpiredListTokens(): void {
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
}

function listsWithQueryOptions(): void {
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

    const { nextCursor } = await volcano.storage.from('files').list('', { limit: 50, cursor: 'prev-cursor' });

    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('limit=50'), expect.any(Object));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('cursor=prev-cursor'), expect.any(Object));
    expect(nextCursor).toBe('cursor-abc');
  });
}

function reportsListFailures(): void {
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
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  describe('download()', () => {
    downloadsFiles();
    downloadsRangesAndFailures();
  });
  describe('list()', () => {
    listsFiles();
    refreshesExpiredListTokens();
    listsWithQueryOptions();
    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').list();

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
    reportsListFailures();
  });
});
