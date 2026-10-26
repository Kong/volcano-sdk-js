/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { storageObject, uploadSession } from './storage-response-fixtures.ts';
import { formAt, headerAt, responseFixture, textBodyAt } from './support/storage-requests.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

const absentValues = [undefined, null, false, 0, Number.NaN, ''];

function preservesMissingObjectStatus(): void {
  it.each(['status', 'abort', 'download'])('preserves a missing object HTTP status for %s', async (operation) => {
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
  });
}

function createsBuckets(): void {
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
}

function omitsFalsyListArguments(): void {
  it.each(absentValues)('omits a falsy list prefix (%s)', async (prefix) => {
    fetchMock.mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({ objects: [] }) }));

    const bucket = volcano.storage.from('files');
    const result: unknown = await Reflect.apply(bucket.list.bind(bucket), undefined, [prefix]);

    expect(result).toMatchObject({ error: null });
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test.com/storage/files');
  });

  it.each(absentValues)('omits falsy list options (%s)', async (value) => {
    fetchMock.mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve({ objects: [] }) }));

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
}

function defaultsFalsySessionArguments(): void {
  it.each(absentValues)('rejects a falsy upload size locally (%s)', async (totalSize) => {
    const bucket = volcano.storage.from('files');
    const result: unknown = await Reflect.apply(bucket.createUploadSession.bind(bucket), undefined, [
      'file.bin',
      { totalSize },
    ]);

    expect(result).toMatchObject({ error: { message: 'totalSize is required' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(absentValues)('defaults a falsy session content type (%s)', async (contentType) => {
    fetchMock.mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve(uploadSession()) }));

    const bucket = volcano.storage.from('files');
    const result: unknown = await Reflect.apply(bucket.createUploadSession.bind(bucket), undefined, [
      'file.bin',
      { totalSize: 1, contentType },
    ]);

    expect(result).toMatchObject({ error: null });
    const body: unknown = JSON.parse(textBodyAt(0));
    expect(body).toMatchObject({ content_type: 'application/octet-stream' });
  });
}

function defaultsFalsyTransferArguments(): void {
  it.each(absentValues)('defaults a falsy Blob content type (%s)', async (contentType) => {
    fetchMock.mockResolvedValueOnce(responseFixture({ ok: true, json: () => Promise.resolve(storageObject()) }));

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
    fetchMock.mockResolvedValueOnce(responseFixture({ ok: true, blob: () => Promise.resolve(new Blob(['data'])) }));

    const bucket = volcano.storage.from('files');
    const result: unknown = await Reflect.apply(bucket.download.bind(bucket), undefined, ['file.bin', { range }]);

    expect(result).toMatchObject({ error: null });
    expect(headerAt(0, 'Range')).toBeNull();
  });

  it('rejects null session options locally', async () => {
    const bucket = volcano.storage.from('files');
    const result: unknown = await Reflect.apply(bucket.createUploadSession.bind(bucket), undefined, ['file.bin', null]);

    expect(result).toMatchObject({ error: { message: 'totalSize is required' } });
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

function guardsPathTraversal(): void {
  describe('path traversal', () => {
    it('does not let a download path leave the storage route', async () => {
      const { data, error } = await volcano.storage.from('files').download('../../functions/x');

      expect(data).toBeNull();
      expect(error).toEqual(new Error('Storage path cannot contain empty, ".", or ".." segments'));
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it.each(['.', '..', 'photos/avatar.png'])(
      'does not let the bucket name %s leave the storage route',
      async (bucket) => {
        const { data, error } = await volcano.storage.from(bucket).download('functions/x');

        expect(data).toBeNull();
        expect(error).toEqual(new Error('Bucket name cannot contain "/" or be "." or ".."'));
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );

    it('sends a literal percent-encoded dot path as an object name', async () => {
      fetchMock.mockResolvedValueOnce(responseFixture({ ok: true, blob: () => Promise.resolve(new Blob(['data'])) }));

      const { error } = await volcano.storage.from('files').download('%2e%2e/%2E%2E/x');

      expect(error).toBeNull();
      expect(fetchMock.mock.calls[0]?.[0]).toBe('https://api.test.com/storage/files/%252e%252e/%252E%252E/x');
    });
  });
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  preservesMissingObjectStatus();
  createsBuckets();
  describe('JavaScript option compatibility', () => {
    omitsFalsyListArguments();
    defaultsFalsySessionArguments();
    defaultsFalsyTransferArguments();
  });
  guardsPathTraversal();
});
