/** @jest-environment node */
import { expect, jest, test } from '@jest/globals';
import { assert, asyncProperty, uint8Array } from 'fast-check';
import {
  downloadStorageFile,
  type StorageTransferHost,
  uploadStorageFile,
} from '../src/storage-transfers.ts';
import { propertyOptions } from './support/property-options.ts';

function fixture() {
  const checkAuth = jest.fn<StorageTransferHost['_checkAuth']>();
  const encodePath = jest.fn<StorageTransferHost['_encodePath']>();
  const generatedOptions = jest.fn<StorageTransferHost['volcanoAuth']['_generatedOptions']>();
  const upload = jest.fn<StorageTransferHost['volcanoAuth']['_transport']['uploadStorageObject']>();
  const download =
    jest.fn<StorageTransferHost['volcanoAuth']['_transport']['downloadStorageObject']>();
  checkAuth.mockResolvedValue(null);
  encodePath.mockImplementation((path) => encodeURIComponent(path));
  generatedOptions.mockReturnValue({ transport: true });
  upload.mockResolvedValue({ data: { id: 'stored' } });
  download.mockResolvedValue({ data: new Blob(['downloaded']) });
  const host: StorageTransferHost = {
    bucketName: 'user uploads',
    volcanoAuth: {
      _transport: { uploadStorageObject: upload, downloadStorageObject: download },
      _generatedOptions: generatedOptions,
    },
    _checkAuth: checkAuth,
    _encodePath: encodePath,
  };
  return { host, checkAuth, encodePath, generatedOptions, upload, download };
}

test('uploads a File unchanged with the encoded bucket and path', async () => {
  const given = fixture();
  const file = new File(['hello'], 'photo.png', { type: 'image/png' });
  await expect(uploadStorageFile(given.host, 'profile/photo.png', file)).resolves.toEqual({
    data: { id: 'stored' },
    error: null,
  });
  expect(given.upload).toHaveBeenCalledWith(
    'user%20uploads',
    'profile%2Fphoto.png',
    { file },
    { transport: true },
  );
  expect(given.generatedOptions).toHaveBeenCalledWith('session');
});

test('wraps a Blob in a File with the explicit content type', async () => {
  const given = fixture();
  await uploadStorageFile(given.host, 'nested/data.json', new Blob(['{}']), {
    contentType: 'application/json',
  });
  const call = given.upload.mock.calls[0];
  if (call === undefined) {
    throw new TypeError('Expected an upload');
  }
  expect(call[2].file.name).toBe('data.json');
  expect(call[2].file.type).toBe('application/json');
  expect(await call[2].file.text()).toBe('{}');
});

test('uses the default MIME type and filename for a path ending in a slash', async () => {
  const given = fixture();
  await uploadStorageFile(given.host, 'nested/', new ArrayBuffer(1), { contentType: '' });
  const call = given.upload.mock.calls[0];
  if (call === undefined) {
    throw new TypeError('Expected an upload');
  }
  expect(call[2].file.name).toBe('file');
  expect(call[2].file.type).toBe('application/octet-stream');
});

test('rejects unsupported file bodies before transport', async () => {
  const given = fixture();
  const result = await uploadStorageFile(given.host, 'file.bin', 'not binary');
  expect(result.data).toBeNull();
  expect(result.error?.message).toBe(
    'Invalid file body type. Expected File, Blob, or ArrayBuffer.',
  );
  expect(given.upload).not.toHaveBeenCalled();
});

test('refuses an upload without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(uploadStorageFile(given.host, 'file.bin', new Blob())).resolves.toEqual({
    data: null,
    error,
  });
  expect(given.upload).not.toHaveBeenCalled();
});

test('preserves an upload transport Error', async () => {
  const given = fixture();
  const error = new Error('upload refused');
  given.upload.mockRejectedValue(error);
  await expect(uploadStorageFile(given.host, 'file.bin', new Blob())).resolves.toEqual({
    data: null,
    error,
  });
});

test('normalizes a non-Error upload failure', async () => {
  const given = fixture();
  given.upload.mockRejectedValue('upload refused');
  await expect(uploadStorageFile(given.host, 'file.bin', new Blob())).resolves.toEqual({
    data: null,
    error: new Error('Upload failed'),
  });
});

test('uploads arbitrary binary ArrayBuffer content without byte changes', async () => {
  await assert(
    asyncProperty(uint8Array({ maxLength: 256 }), async (bytes) => {
      const given = fixture();
      await uploadStorageFile(given.host, 'binary.dat', Uint8Array.from(bytes).buffer);
      const call = given.upload.mock.calls[0];
      if (call === undefined) {
        throw new TypeError('Expected an upload');
      }
      expect(new Uint8Array(await call[2].file.arrayBuffer())).toEqual(bytes);
    }),
    propertyOptions(),
  );
});

test('downloads a Blob with a Range header', async () => {
  const given = fixture();
  const blob = new Blob([Uint8Array.from([0, 255, 128])]);
  given.download.mockResolvedValue({ data: blob });
  await expect(
    downloadStorageFile(given.host, 'binary.dat', { range: 'bytes=0-2' }),
  ).resolves.toEqual({ data: blob, error: null });
  expect(given.download).toHaveBeenCalledWith('user%20uploads', 'binary.dat', {
    transport: true,
  });
  expect(given.generatedOptions).toHaveBeenCalledWith('session', { Range: 'bytes=0-2' }, 'blob');
  expect(new Uint8Array(await blob.arrayBuffer())).toEqual(Uint8Array.from([0, 255, 128]));
});

test('omits an empty Range header', async () => {
  const given = fixture();
  await downloadStorageFile(given.host, 'file.bin', { range: '' });
  expect(given.generatedOptions).toHaveBeenCalledWith('session', undefined, 'blob');
});

test('rejects a nonbinary download response', async () => {
  const given = fixture();
  given.download.mockResolvedValue({ data: { message: 'not a file' } });
  await expect(downloadStorageFile(given.host, 'file.bin')).resolves.toEqual({
    data: null,
    error: new Error('Download response is not a Blob'),
  });
});

test('refuses a download without authentication', async () => {
  const given = fixture();
  const error = new Error('No active session');
  given.checkAuth.mockResolvedValue({ data: null, error });
  await expect(downloadStorageFile(given.host, 'file.bin')).resolves.toEqual({ data: null, error });
  expect(given.download).not.toHaveBeenCalled();
});

test('preserves a download transport Error', async () => {
  const given = fixture();
  const error = new Error('download refused');
  given.download.mockRejectedValue(error);
  await expect(downloadStorageFile(given.host, 'file.bin')).resolves.toEqual({ data: null, error });
});

test('normalizes a non-Error download failure', async () => {
  const given = fixture();
  given.download.mockRejectedValue('download refused');
  await expect(downloadStorageFile(given.host, 'file.bin')).resolves.toEqual({
    data: null,
    error: new Error('Download failed'),
  });
});
