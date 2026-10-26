/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';
import { sessionToken } from './session-fixtures.ts';
import { storageObject } from './storage-response-fixtures.ts';
import { formAt, headerAt, responseFixture } from './support/storage-requests.ts';

const fetchMock = jest.mocked(globalThis.fetch);

const config = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

let volcano: VolcanoAuth;

function mockReplayedUpload(): void {
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
        json: () => Promise.resolve(storageObject()),
      }),
    );
}

function uploadsFiles(): void {
  it('should upload a File successfully', async () => {
    const mockResponse = storageObject({
      id: 'obj-123',
      bucket_id: 'bucket-456',
      name: 'avatar.png',
      size: 1024,
      mime_type: 'image/png',
    });

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
}

function replaysRejectedUploads(): void {
  it('replays the same upload file after an authentication rejection', async () => {
    volcano = new VolcanoAuth({
      ...config,
      accessToken: sessionToken(),
      refreshToken: 'valid-refresh',
    });
    const file = new File(['hello\u0000\u00FF'], 'file.bin', {
      type: 'application/octet-stream',
    });
    mockReplayedUpload();

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
}

function uploadsBinaryBodies(): void {
  it('should upload a Blob successfully', async () => {
    const mockResponse = storageObject({
      id: 'obj-123',
      name: 'data.json',
      size: 50,
      mime_type: 'application/json',
    });

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
    const mockResponse = storageObject({
      id: 'obj-123',
      name: 'binary.bin',
      size: 4,
    });

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
}

function reportsUploadFailures(): void {
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
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  describe('upload()', () => {
    uploadsFiles();
    replaysRejectedUploads();
    uploadsBinaryBodies();
    reportsUploadFailures();
  });
});
