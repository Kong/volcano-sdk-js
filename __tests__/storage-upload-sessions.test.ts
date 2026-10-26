/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { completedUpload } from './storage-response-fixtures.ts';
import { responseFixture } from './support/storage-requests.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function createsUploadSessions(): void {
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

    const { data, error } = await volcano.storage.from('uploads').createUploadSession('large-video.mp4', {
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
}

function rejectsInvalidUploadSessions(): void {
  it('should return error when totalSize is not provided', async () => {
    const bucket = volcano.storage.from('uploads');
    const result: unknown = await Reflect.apply(bucket.createUploadSession.bind(bucket), undefined, ['file.mp4', {}]);

    expect(result).toMatchObject({ data: null, error: { message: 'totalSize is required' } });
  });

  it('should return error when not authenticated', async () => {
    volcano = new VolcanoAuth(config);

    const { data, error } = await volcano.storage.from('uploads').createUploadSession('file.mp4', { totalSize: 1000 });

    expect(data).toBeNull();
    expect(error?.message).toBe('No active session. Please sign in first.');
  });
}

function uploadsParts(): void {
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
}

function completesUploadSessions(): void {
  it('should complete an upload session successfully', async () => {
    const mockResponse = completedUpload({
      id: 'obj-123',
      name: 'large-video.mp4',
      size: 100 * 1024 * 1024,
      mime_type: 'video/mp4',
    });

    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { data, error } = await volcano.storage.from('uploads').completeUploadSession('large-video.mp4', 'sess-123');

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
}

function reportsIncompleteUploads(): void {
  it('should return error when not all parts uploaded', async () => {
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: false,
        json: () => Promise.resolve({ error: 'not all parts uploaded' }),
      }),
    );

    const { data, error } = await volcano.storage.from('uploads').completeUploadSession('file.mp4', 'sess-123');

    expect(data).toBeNull();
    expect(error?.message).toBe('not all parts uploaded');
  });
}

function readsUploadSessions(): void {
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

    const { data, error } = await volcano.storage.from('uploads').getUploadSession('large-video.mp4', 'sess-123');

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
}

function reportsMissingUploadSessions(): void {
  it('should return error for non-existent session', async () => {
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: false,
        json: () => Promise.resolve({ error: 'session not found' }),
      }),
    );

    const { data, error } = await volcano.storage.from('uploads').getUploadSession('file.mp4', 'invalid-session');

    expect(data).toBeNull();
    expect(error?.message).toBe('session not found');
  });
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  describe('createUploadSession()', () => {
    createsUploadSessions();
    rejectsInvalidUploadSessions();
  });
  uploadsParts();
  describe('completeUploadSession()', () => {
    completesUploadSessions();
    reportsIncompleteUploads();
  });
  describe('getUploadSession()', () => {
    readsUploadSessions();
    reportsMissingUploadSessions();
  });
});
