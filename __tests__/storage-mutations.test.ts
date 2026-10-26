/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { storageObject } from './storage-response-fixtures.ts';
import { responseFixture } from './support/storage-requests.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function preservesDeletionFailures(): void {
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
}

function deletesFiles(): void {
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

    const { data, error } = await volcano.storage.from('files').remove(['file1.txt', 'file2.txt', 'file3.txt']);

    expect(error).toBeNull();
    expect(data?.deleted).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
}

function reportsIncompleteDeletes(): void {
  it('should return partial error when some files fail to delete', async () => {
    fetchMock
      .mockResolvedValueOnce(responseFixture({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) }))
      .mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({}) }));

    const { data, error } = await volcano.storage.from('files').remove(['missing.txt', 'exists.txt']);

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
}

function movesFiles(): void {
  it('should move a file successfully', async () => {
    const mockResponse = storageObject({
      id: 'obj-123',
      name: 'new-location/file.txt',
    });

    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { data, error } = await volcano.storage.from('files').move('old/file.txt', 'new-location/file.txt');

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
}

function reportsMoveFailures(): void {
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
}

function copiesFiles(): void {
  it('should copy a file successfully', async () => {
    const mockResponse = storageObject({
      id: 'obj-new',
      name: 'copy/file.txt',
    });

    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { data, error } = await volcano.storage.from('files').copy('original/file.txt', 'copy/file.txt');

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
}

function reportsCopyFailures(): void {
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
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  describe('remove()', () => {
    preservesDeletionFailures();
    deletesFiles();
    reportsIncompleteDeletes();
  });
  describe('move()', () => {
    movesFiles();
    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').move('from.txt', 'to.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
    reportsMoveFailures();
  });
  describe('copy()', () => {
    copiesFiles();
    it('should return error when not authenticated', async () => {
      volcano = new VolcanoAuth(config);

      const { data, error } = await volcano.storage.from('files').copy('from.txt', 'to.txt');

      expect(data).toBeNull();
      expect(error?.message).toBe('No active session. Please sign in first.');
    });
    reportsCopyFailures();
  });
});
