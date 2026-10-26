/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { completedUpload, uploadPart, uploadSession } from './storage-response-fixtures.ts';
import { responseFixture } from './support/storage-requests.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function mockTwoPartUpload(): void {
  // Mock create session
  fetchMock.mockResolvedValueOnce(
    responseFixture({
      ok: true,
      json: () => Promise.resolve(uploadSession({ session_id: 'sess-123', total_parts: 2, part_size: 1024 })),
    }),
  );

  // Mock upload part 1
  fetchMock.mockResolvedValueOnce(
    responseFixture({
      ok: true,
      json: () => Promise.resolve(uploadPart({ part_number: 1, etag: 'etag1' })),
    }),
  );

  // Mock upload part 2
  fetchMock.mockResolvedValueOnce(
    responseFixture({
      ok: true,
      json: () => Promise.resolve(uploadPart({ part_number: 2, etag: 'etag2' })),
    }),
  );

  // Mock complete session
  fetchMock.mockResolvedValueOnce(
    responseFixture({
      ok: true,
      json: () => Promise.resolve(completedUpload({ id: 'obj-123', name: 'file.bin', size: 2048 })),
    }),
  );
}

function abortsUploadSessions(): void {
  describe('abortUploadSession()', () => {
    it('should abort an upload session successfully', async () => {
      fetchMock.mockResolvedValueOnce(
        responseFixture({
          ok: true,
          json: () => Promise.resolve({ message: 'session aborted' }),
        }),
      );

      const { error } = await volcano.storage.from('uploads').abortUploadSession('large-video.mp4', 'sess-123');

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

      const { error } = await volcano.storage.from('uploads').abortUploadSession('file.mp4', 'sess-123');

      expect(error?.message).toBe('No active session. Please sign in first.');
    });
  });
}

function uploadsInParts(): void {
  it('should upload a file in parts successfully', async () => {
    mockTwoPartUpload();

    const file = new Blob([new ArrayBuffer(2048)], { type: 'application/octet-stream' });
    const progressCalls: { uploaded: number; total: number }[] = [];

    const { data, error } = await volcano.storage.from('uploads').uploadResumable('file.bin', file, {
      partSize: 1024,
      onProgress(uploaded, total) {
        progressCalls.push({ uploaded, total });
      },
    });

    expect(error).toBeNull();
    expect(data).toMatchObject({ object: { name: 'file.bin' } });
    // create + 2 parts + complete
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(progressCalls).toHaveLength(2);
  });
}

function abortsFailedResumableUploads(): void {
  it('should abort and return error when part upload fails', async () => {
    // Mock create session
    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve(uploadSession({ session_id: 'sess-123', total_parts: 2, part_size: 1024 })),
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

    const { data, error } = await volcano.storage.from('uploads').uploadResumable('file.bin', file, { partSize: 1024 });

    expect(data).toBeNull();
    expect(error?.message).toBe('upload failed');
  });

  it('should return error when not authenticated', async () => {
    volcano = new VolcanoAuth(config);

    const file = new Blob([new ArrayBuffer(1024)]);
    const { data, error } = await volcano.storage.from('uploads').uploadResumable('file.bin', file);

    expect(data).toBeNull();
    expect(error?.message).toBe('No active session. Please sign in first.');
  });
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  abortsUploadSessions();
  describe('uploadResumable()', () => {
    uploadsInParts();
    abortsFailedResumableUploads();
  });
});
