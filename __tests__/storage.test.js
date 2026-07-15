const { createVolcanoClient } = require('../src/index.ts');

const requestFromFetchCall = (index = 0) => {
  const [input, init] = global.fetch.mock.calls[index];
  return input instanceof Request ? input : new Request(input, init);
};

describe('Storage', () => {
  const config = {
    accessToken: 'test-access-token',
    anonKey: 'ak-test-anon-key',
    baseUrl: 'https://api.test.com',
  };

  let volcano;

  beforeEach(() => {
    volcano = createVolcanoClient(config);
  });

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
      expect(bucket.bucketName).toBe('my-bucket');
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

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      // Create a mock File
      const file = new File(['test content'], 'avatar.png', { type: 'image/png' });

      const { data, error } = await volcano.storage.from('avatars').upload('user/avatar.png', file);
      const request = requestFromFetchCall();

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(request.url).toBe(
        'https://api.test.com/storage/avatars/upload?path=user%2Favatar.png',
      );
      expect(request.method).toBe('POST');
      expect(request.headers.get('Content-Type')).toMatch(/^multipart\/form-data; boundary=/);
      expect(request.headers.get('Authorization')).toBe('Bearer test-access-token');
    });

    it('should upload a Blob successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'data.json',
        size: 50,
        mime_type: 'application/json',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

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

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const buffer = new ArrayBuffer(4);

      const { data, error } = await volcano.storage.from('files').upload('binary.bin', buffer);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
    });

    it('should return error for invalid file body type', async () => {
      const { data, error } = await volcano.storage
        .from('files')
        .upload('test.txt', 'invalid string body');

      expect(data).toBeNull();
      expect(error.message).toBe('Invalid file body type. Expected File, Blob, or ArrayBuffer.');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const { data, error } = await volcano.storage.from('files').upload('test.txt', file);

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on upload failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'File too large' }),
      });

      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      const { data, error } = await volcano.storage.from('files').upload('test.txt', file);

      expect(data).toBeNull();
      expect(error.message).toBe('File too large');
    });
  });

  describe('download()', () => {
    it('should download a file successfully', async () => {
      const mockBlob = new Blob(['file content'], { type: 'text/plain' });

      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { data, error } = await volcano.storage.from('files').download('document.txt');

      expect(error).toBeNull();
      expect(data).toBeInstanceOf(Blob);
      expect(fetch.mock.calls[0][0]).toBe('https://api.test.com/storage/files/document.txt');
      expect(fetch.mock.calls[0][1].method).toBe('GET');
      expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe(
        'Bearer test-access-token',
      );
    });

    it('should support Range header for partial downloads', async () => {
      const mockBlob = new Blob(['partial content']);

      global.fetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      await volcano.storage.from('files').download('large-file.zip', { range: 'bytes=0-1023' });

      expect(new Headers(fetch.mock.calls[0][1].headers).get('Range')).toBe('bytes=0-1023');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage.from('files').download('test.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on download failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'File not found' }),
      });

      const { data, error } = await volcano.storage.from('files').download('nonexistent.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('File not found');
    });

    it('does not refresh a download 401 when automatic refresh is disabled', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'expired' }),
      });
      volcano = createVolcanoClient({
        accessToken: 'expired-token',
        auth: { autoRefreshToken: false },
        baseUrl: 'https://api.test.com',
        refreshToken: 'refresh-token',
      });

      const result = await volcano.storage.from('files').download('document.txt');

      expect(result.error.message).toBe('expired');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('list()', () => {
    it('should list files successfully', async () => {
      const mockObjects = [
        { id: 'obj-1', name: 'file1.txt', size: 100 },
        { id: 'obj-2', name: 'file2.txt', size: 200 },
      ];

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ objects: mockObjects, next_cursor: null }),
      });

      const { data, error, nextCursor } = await volcano.storage.from('files').list();

      expect(error).toBeNull();
      expect(data).toEqual(mockObjects);
      expect(nextCursor).toBeNull();
    });

    it('waits for an asynchronously persisted session before checking credentials', async () => {
      const storedSession = {
        access_token: 'persisted-access-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        expires_in: 3600,
        refresh_token: 'persisted-refresh-token',
        user: { id: 'stored-user' },
      };
      const storage = {
        getItem: jest.fn(async () => JSON.stringify(storedSession)),
        removeItem: jest.fn(),
        setItem: jest.fn(),
      };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ objects: [], next_cursor: null }),
      });
      volcano = createVolcanoClient({
        auth: { storage, storageKey: 'persisted-storage-session' },
        baseUrl: 'https://api.test.com',
      });

      const result = await volcano.storage.from('files').list();

      expect(result.error).toBeNull();
      expect(requestFromFetchCall().headers.get('Authorization')).toBe(
        'Bearer persisted-access-token',
      );
    });

    it('should refresh token on 401 and retry', async () => {
      volcano = createVolcanoClient({
        accessToken: 'expired-token',
        anonKey: 'ak-test-anon-key',
        baseUrl: 'https://api.test.com',
        refreshToken: 'valid-refresh',
      });

      // First call returns 401
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Token expired' }),
      });

      // Refresh call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token',
            expires_in: 3600,
          }),
      });

      // Retry call succeeds
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ objects: [], next_cursor: null }),
      });

      const { error } = await volcano.storage.from('files').list();

      expect(error).toBeNull();
      expect(requestFromFetchCall(2).headers.get('Authorization')).toBe('Bearer new-access-token');
    });

    it('does not refresh a 401 when automatic refresh is disabled', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'expired' }),
      });
      volcano = createVolcanoClient({
        accessToken: 'expired-token',
        anonKey: 'ak-test-anon-key',
        auth: { autoRefreshToken: false },
        baseUrl: 'https://api.test.com',
        refreshToken: 'refresh-token',
      });

      const result = await volcano.storage.from('files').list();

      expect(result.error.message).toBe('expired');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should list files with prefix', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ objects: [], next_cursor: null }),
      });

      await volcano.storage.from('files').list('user/documents/');

      expect(requestFromFetchCall().url).toBe(
        'https://api.test.com/storage/files?prefix=user%2Fdocuments%2F',
      );
    });

    it('should support pagination options', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ objects: [], next_cursor: 'cursor-abc' }),
      });

      const { nextCursor } = await volcano.storage
        .from('files')
        .list('', { limit: 50, cursor: 'prev-cursor' });
      const request = requestFromFetchCall();

      expect(request.url).toContain('limit=50');
      expect(request.url).toContain('cursor=prev-cursor');
      expect(nextCursor).toBe('cursor-abc');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage.from('files').list();

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on list failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Access denied' }),
      });

      const { data, error } = await volcano.storage.from('files').list();

      expect(data).toBeNull();
      expect(error.message).toBe('Access denied');
    });
  });

  describe('remove()', () => {
    it('should delete a single file successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'deleted' }),
      });

      const { data, error } = await volcano.storage.from('files').remove('old-file.txt');

      expect(error).toBeNull();
      expect(data.deleted).toContain('old-file.txt');
      expect(fetch).toHaveBeenCalledWith(
        'https://api.test.com/storage/files/old-file.txt',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should delete multiple files successfully', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

      const { data, error } = await volcano.storage
        .from('files')
        .remove(['file1.txt', 'file2.txt', 'file3.txt']);

      expect(error).toBeNull();
      expect(data.deleted).toHaveLength(3);
      expect(fetch).toHaveBeenCalledTimes(3);
    });

    it('should return partial error when some files fail to delete', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) })
        .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Not found' }) });

      const { data, error } = await volcano.storage
        .from('files')
        .remove(['exists.txt', 'missing.txt']);

      expect(data.deleted).toContain('exists.txt');
      expect(error.message).toContain('Failed to delete 1 file(s)');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage.from('files').remove('test.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('move()', () => {
    it('should move a file successfully', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'new-location/file.txt',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('files')
        .move('old/file.txt', 'new-location/file.txt');
      const request = requestFromFetchCall();

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(request.url).toBe('https://api.test.com/storage/files/move');
      expect(request.method).toBe('POST');
      await expect(request.clone().json()).resolves.toEqual({
        from: 'old/file.txt',
        to: 'new-location/file.txt',
      });
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage.from('files').move('from.txt', 'to.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on move failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Source not found' }),
      });

      const { data, error } = await volcano.storage.from('files').move('missing.txt', 'dest.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('Source not found');
    });
  });

  describe('copy()', () => {
    it('should copy a file successfully', async () => {
      const mockResponse = {
        id: 'obj-new',
        name: 'copy/file.txt',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('files')
        .copy('original/file.txt', 'copy/file.txt');
      const request = requestFromFetchCall();

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(request.url).toBe('https://api.test.com/storage/files/copy');
      expect(request.method).toBe('POST');
      await expect(request.clone().json()).resolves.toEqual({
        from: 'original/file.txt',
        to: 'copy/file.txt',
      });
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage.from('files').copy('from.txt', 'to.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });

    it('should return error on copy failure', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Access denied' }),
      });

      const { data, error } = await volcano.storage.from('files').copy('protected.txt', 'copy.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('Access denied');
    });
  });

  describe('getPublicUrl()', () => {
    const tokenForProject = (projectId, prefix = '') =>
      prefix +
      btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) +
      '.' +
      btoa(JSON.stringify({ project_id: projectId })) +
      '.' +
      btoa('signature');
    const validAnonKey = tokenForProject('proj-123-456', 'ak-');

    let volcanoWithValidKey;

    beforeEach(() => {
      volcanoWithValidKey = createVolcanoClient({
        anonKey: validAnonKey,
        baseUrl: 'https://api.test.com',
      });
    });

    it('should return public URL for a file', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('public-bucket')
        .getPublicUrl('images/photo.jpg');

      expect(error).toBeNull();
      expect(data.publicUrl).toBe(
        'https://api.test.com/public/proj-123-456/public-bucket/images/photo.jpg',
      );
    });

    it('should URL encode paths with spaces', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('files')
        .getPublicUrl('folder/file name.txt');

      expect(error).toBeNull();
      expect(data.publicUrl).toBe(
        'https://api.test.com/public/proj-123-456/files/folder/file%20name.txt',
      );
    });

    it('should URL encode paths with special characters', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('user-files')
        .getPublicUrl('screenshots/Screenshot 2026-01-21 at 10.17.07 PM.png');

      expect(error).toBeNull();
      expect(data.publicUrl).toBe(
        'https://api.test.com/public/proj-123-456/user-files/screenshots/Screenshot%202026-01-21%20at%2010.17.07%20PM.png',
      );
    });

    it('should URL encode bucket names with special characters', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('my bucket')
        .getPublicUrl('file.txt');

      expect(error).toBeNull();
      expect(data.publicUrl).toBe('https://api.test.com/public/proj-123-456/my%20bucket/file.txt');
    });

    it('should return error when no storage credential contains a project ID', () => {
      const volcanoInvalid = createVolcanoClient({
        anonKey: 'ak-invalid-not-jwt',
        baseUrl: 'https://api.test.com',
      });

      const { data, error } = volcanoInvalid.storage.from('bucket').getPublicUrl('file.txt');

      expect(data).toBeNull();
      expect(error.message).toBe('Project ID not found in storage credentials');
    });

    it('should prefer the access-token project over the anon project', () => {
      const accessClient = createVolcanoClient({
        accessToken: tokenForProject('access-project'),
        anonKey: tokenForProject('anon-project', 'ak-'),
        baseUrl: 'https://api.test.com',
      });

      const { data, error } = accessClient.storage.from('files').getPublicUrl('file.txt');

      expect(error).toBeNull();
      expect(data.publicUrl).toBe('https://api.test.com/public/access-project/files/file.txt');
    });

    it('should extract project ID correctly from JWT payload', () => {
      const { data, error } = volcanoWithValidKey.storage
        .from('avatars')
        .getPublicUrl('user/profile.png');

      expect(error).toBeNull();
      expect(data.publicUrl).toContain('/public/proj-123-456/');
    });
  });

  describe('updateVisibility()', () => {
    it('should update file visibility to public', async () => {
      const mockResponse = {
        id: 'obj-123',
        name: 'file.txt',
        is_public: true,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('file.txt', true);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith(
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

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('file.txt', false);

      expect(error).toBeNull();
      expect(data.is_public).toBe(false);
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('file.txt', true);

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });

    it('should return error when not the owner', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'only the file owner can change visibility' }),
      });

      const { data, error } = await volcano.storage
        .from('files')
        .updateVisibility('someone-elses-file.txt', true);

      expect(data).toBeNull();
      expect(error.message).toBe('only the file owner can change visibility');
    });
  });

  // ========================================================================
  // Resumable Upload Tests
  // ========================================================================

  describe('createUploadSession()', () => {
    it('should create an upload session successfully', async () => {
      const mockResponse = {
        session_id: 'sess-123',
        path: 'large-video.mp4',
        total_size: 100 * 1024 * 1024,
        part_size: 25 * 1024 * 1024,
        total_parts: 4,
        expires_at: '2026-01-30T00:00:00Z',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('uploads')
        .createUploadSession('large-video.mp4', {
          totalSize: 100 * 1024 * 1024,
          contentType: 'video/mp4',
        });

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetch.mock.calls[0][0]).toBe('https://api.test.com/storage/uploads/large-video.mp4');
      const headers = new Headers(fetch.mock.calls[0][1].headers);
      expect(headers.get('Content-Type')).toBe('application/json');
      expect(headers.get('Authorization')).toBe('Bearer test-access-token');
      expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
        content_type: 'video/mp4',
        total_size: 100 * 1024 * 1024,
      });
    });

    it('should return error when totalSize is not provided', async () => {
      const { data, error } = await volcano.storage
        .from('uploads')
        .createUploadSession('file.mp4', {});

      expect(data).toBeNull();
      expect(error.message).toBe('totalSize is required');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage
        .from('uploads')
        .createUploadSession('file.mp4', { totalSize: 1000 });

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('uploadPart()', () => {
    it('should upload a part successfully', async () => {
      const mockResponse = {
        part_number: 1,
        etag: 'abc123',
        size: 25 * 1024 * 1024,
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const partData = new ArrayBuffer(1024);
      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadPart('large-video.mp4', 'sess-123', 1, partData);

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      const headers = new Headers(fetch.mock.calls[0][1].headers);
      expect(fetch.mock.calls[0][1].method).toBe('PUT');
      expect(headers.get('X-Upload-Session')).toBe('sess-123');
      expect(headers.get('X-Part-Number')).toBe('1');
      expect(headers.get('Content-Type')).toBe('application/octet-stream');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadPart('file.mp4', 'sess-123', 1, new ArrayBuffer(100));

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('completeUploadSession()', () => {
    it('should complete an upload session successfully', async () => {
      const mockResponse = {
        object: {
          id: 'obj-123',
          name: 'large-video.mp4',
          size: 100 * 1024 * 1024,
          mime_type: 'video/mp4',
        },
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('uploads')
        .completeUploadSession('large-video.mp4', 'sess-123');

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      const headers = new Headers(fetch.mock.calls[0][1].headers);
      expect(fetch.mock.calls[0][1].method).toBe('POST');
      expect(headers.get('X-Upload-Session')).toBe('sess-123');
      expect(headers.get('X-Upload-Complete')).toBe('true');
      expect(headers.get('Content-Type')).toBeNull();
      expect(fetch.mock.calls[0][1].body).toBeUndefined();
    });

    it('should return error when not all parts uploaded', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'not all parts uploaded' }),
      });

      const { data, error } = await volcano.storage
        .from('uploads')
        .completeUploadSession('file.mp4', 'sess-123');

      expect(data).toBeNull();
      expect(error.message).toBe('not all parts uploaded');
    });
  });

  describe('getUploadSession()', () => {
    it('should get upload session status successfully', async () => {
      const mockResponse = {
        session_id: 'sess-123',
        path: 'large-video.mp4',
        status: 'pending',
        total_parts: 4,
        uploaded_parts: 2,
        missing_parts: [3, 4],
        expires_at: '2026-01-30T00:00:00Z',
      };

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const { data, error } = await volcano.storage
        .from('uploads')
        .getUploadSession('large-video.mp4', 'sess-123');

      expect(error).toBeNull();
      expect(data).toEqual(mockResponse);
      expect(fetch.mock.calls[0][1].method).toBe('GET');
      expect(new Headers(fetch.mock.calls[0][1].headers).get('X-Upload-Session')).toBe('sess-123');
    });

    it('should return error for non-existent session', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'session not found' }),
      });

      const { data, error } = await volcano.storage
        .from('uploads')
        .getUploadSession('file.mp4', 'invalid-session');

      expect(data).toBeNull();
      expect(error.message).toBe('session not found');
    });
  });

  describe('abortUploadSession()', () => {
    it('should abort an upload session successfully', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ message: 'session aborted' }),
      });

      const { error } = await volcano.storage
        .from('uploads')
        .abortUploadSession('large-video.mp4', 'sess-123');

      expect(error).toBeNull();
      expect(fetch.mock.calls[0][1].method).toBe('DELETE');
      expect(new Headers(fetch.mock.calls[0][1].headers).get('X-Upload-Session')).toBe('sess-123');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const { error } = await volcano.storage
        .from('uploads')
        .abortUploadSession('file.mp4', 'sess-123');

      expect(error.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('uploadResumable()', () => {
    it('should upload a file in parts successfully', async () => {
      // Mock create session
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: 'sess-123',
            total_parts: 2,
            part_size: 1024,
          }),
      });

      // Mock upload part 1
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ part_number: 1, etag: 'etag1' }),
      });

      // Mock upload part 2
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ part_number: 2, etag: 'etag2' }),
      });

      // Mock complete session
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            object: {
              id: 'obj-123',
              name: 'file.bin',
              size: 2048,
            },
          }),
      });

      const file = new Blob([new ArrayBuffer(2048)], { type: 'application/octet-stream' });
      const progressCalls = [];

      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', file, {
          partSize: 1024,
          onProgress: (uploaded, total) => {
            progressCalls.push({ uploaded, total });
          },
        });

      expect(error).toBeNull();
      expect(data.name).toBe('file.bin');
      expect(fetch).toHaveBeenCalledTimes(4); // create + 2 parts + complete
      expect(progressCalls).toHaveLength(2);
    });

    it('uses the binary MIME fallback for an untyped Blob', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'stop after session request' }),
      });

      await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', new Blob([new ArrayBuffer(8)]));

      expect(JSON.parse(global.fetch.mock.calls[0][1].body).content_type).toBe(
        'application/octet-stream',
      );
    });

    it('should abort and return error when part upload fails', async () => {
      // Mock create session
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            session_id: 'sess-123',
            total_parts: 2,
            part_size: 1024,
          }),
      });

      // Mock upload part 1 failure
      global.fetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'upload failed' }),
      });

      // Mock abort
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      const file = new Blob([new ArrayBuffer(2048)]);

      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', file, { partSize: 1024 });

      expect(data).toBeNull();
      expect(error.message).toBe('upload failed');
    });

    it('uses a fresh signal to abort a session after caller cancellation', async () => {
      const caller = new AbortController();
      let startPartUpload;
      const partUploadStarted = new Promise((resolve) => {
        startPartUpload = resolve;
      });
      let cleanupSignal;
      const fetchMock = jest.fn((_input, options) => {
        if (fetchMock.mock.calls.length === 1) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({ session_id: 'sess-cancelled', total_parts: 1, part_size: 1024 }),
          });
        }
        if (fetchMock.mock.calls.length === 2) {
          startPartUpload();
          return new Promise((_resolve, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), {
              once: true,
            });
          });
        }
        cleanupSignal = options.signal;
        return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
      });
      const client = createVolcanoClient({ ...config, fetch: fetchMock });

      const pending = client.storage
        .from('uploads')
        .uploadResumable('file.bin', new Blob([new ArrayBuffer(1024)]), {
          signal: caller.signal,
        });
      await partUploadStarted;
      caller.abort(new DOMException('Cancelled by caller', 'AbortError'));
      const result = await pending;

      expect(result.error).toMatchObject({
        message: 'Cancelled by caller',
        name: 'VolcanoApiError',
      });
      expect(result.error.cause).toMatchObject({ name: 'AbortError' });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(cleanupSignal.aborted).toBe(false);
      expect(fetchMock.mock.calls[2][1].method).toBe('DELETE');
    });

    it('should return error when not authenticated', async () => {
      volcano = createVolcanoClient({ baseUrl: 'https://api.test.com' });

      const file = new Blob([new ArrayBuffer(1024)]);
      const { data, error } = await volcano.storage
        .from('uploads')
        .uploadResumable('file.bin', file);

      expect(data).toBeNull();
      expect(error.message).toBe('No active session. Please sign in first.');
    });
  });

  describe('generated request controls', () => {
    it.each(['list', 'move', 'copy'])(
      'applies per-call request controls to %s',
      async (operation) => {
        const setTimeoutSpy = jest.spyOn(globalThis, 'setTimeout');
        try {
          let requestSignal;
          const caller = new AbortController();
          const addAbortListener = jest.spyOn(caller.signal, 'addEventListener');
          const fetchMock = jest.fn(
            (input, init) =>
              new Promise((_resolve, reject) => {
                requestSignal = input instanceof Request ? input.signal : init.signal;
                if (requestSignal.aborted) {
                  reject(requestSignal.reason);
                  return;
                }
                requestSignal.addEventListener('abort', () => reject(requestSignal.reason), {
                  once: true,
                });
              }),
          );
          const timeoutClient = createVolcanoClient({
            ...config,
            auth: { persistSession: false },
            fetch: fetchMock,
          });
          const bucket = timeoutClient.storage.from('files');
          const pending =
            operation === 'list'
              ? bucket.list('', { signal: caller.signal, timeoutMs: 10 })
              : bucket[operation]('from.txt', 'to.txt', {
                  signal: caller.signal,
                  timeoutMs: 10,
                });
          for (let attempt = 0; attempt < 100 && fetchMock.mock.calls.length === 0; attempt += 1) {
            await Promise.resolve();
          }
          expect(fetchMock).toHaveBeenCalledTimes(1);
          expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), 10);
          expect(addAbortListener).toHaveBeenCalledWith('abort', expect.any(Function), {
            once: true,
          });
          caller.abort(new DOMException('Cancelled by caller', 'AbortError'));
          const result = await pending;

          expect(requestSignal).toBeDefined();
          expect(requestSignal.aborted).toBe(true);
          expect(requestSignal.reason).toMatchObject({ name: 'AbortError' });
          expect(result.error).not.toBeNull();
        } finally {
          setTimeoutSpy.mockRestore();
        }
      },
    );
  });
});
