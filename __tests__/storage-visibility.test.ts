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

// Create a valid JWT-like anon key with project_id
const validAnonKey = `ak-${btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${btoa(JSON.stringify({ project_id: 'proj-123-456' }))}.${btoa('signature')}`;

let volcanoWithValidKey: VolcanoAuth;

function buildsPublicUrls(): void {
  it('should return public URL for a file', () => {
    const { data, error } = volcanoWithValidKey.storage.from('public-bucket').getPublicUrl('images/photo.jpg');

    expect(error).toBeNull();
    expect(data?.publicUrl).toBe('https://api.test.com/public/proj-123-456/public-bucket/images/photo.jpg');
  });

  it('should URL encode paths with spaces', () => {
    const { data, error } = volcanoWithValidKey.storage.from('files').getPublicUrl('folder/file name.txt');

    expect(error).toBeNull();
    expect(data?.publicUrl).toBe('https://api.test.com/public/proj-123-456/files/folder/file%20name.txt');
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
    const { data, error } = volcanoWithValidKey.storage.from('my bucket').getPublicUrl('file.txt');

    expect(error).toBeNull();
    expect(data?.publicUrl).toBe('https://api.test.com/public/proj-123-456/my%20bucket/file.txt');
  });
}

function validatesPublicUrlInputs(): void {
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
    const { data, error } = volcanoWithValidKey.storage.from('avatars').getPublicUrl('user/profile.png');

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

  it.each(['.', 'avatars/../secret.txt', 'avatars//secret.txt', 'avatars/'])(
    'should reject an empty or dot segment path %s',
    (path) => {
      const { data, error } = volcanoWithValidKey.storage.from('avatars').getPublicUrl(path);

      expect(data).toBeNull();
      expect(error?.message).toBe('Storage path cannot contain empty, ".", or ".." segments');
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
}

function updatesVisibility(): void {
  it('should update file visibility to public', async () => {
    const mockResponse = storageObject({
      id: 'obj-123',
      name: 'file.txt',
      is_public: true,
    });

    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { data, error } = await volcano.storage.from('files').updateVisibility('file.txt', true);

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
    const mockResponse = storageObject({
      id: 'obj-123',
      name: 'file.txt',
      is_public: false,
    });

    fetchMock.mockResolvedValueOnce(
      responseFixture({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      }),
    );

    const { data, error } = await volcano.storage.from('files').updateVisibility('file.txt', false);

    expect(error).toBeNull();
    expect(data?.is_public).toBe(false);
  });
}

function reportsVisibilityFailures(): void {
  it('should return error when not authenticated', async () => {
    volcano = new VolcanoAuth(config);

    const { data, error } = await volcano.storage.from('files').updateVisibility('file.txt', true);

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

    const { data, error } = await volcano.storage.from('files').updateVisibility('someone-elses-file.txt', true);

    expect(data).toBeNull();
    expect(error?.message).toBe('only the file owner can change visibility');
  });
}

describe('Storage', () => {
  beforeEach(() => {
    volcano = new VolcanoAuth({ ...config, accessToken: 'test-access-token' });
  });

  describe('getPublicUrl()', () => {
    beforeEach(() => {
      volcanoWithValidKey = new VolcanoAuth({
        apiUrl: 'https://api.test.com',
        anonKey: validAnonKey,
      });
    });

    buildsPublicUrls();
    validatesPublicUrlInputs();
  });
  describe('updateVisibility()', () => {
    updatesVisibility();
    reportsVisibilityFailures();
  });
});
