import { jest } from '@jest/globals';
import { type StorageAuthHost, StorageFileApi } from '../../src/storage-file.ts';
import { storageObject } from '../storage-response-fixtures.ts';

type Upload = StorageAuthHost['_transport']['uploadStorageObject'];
type Download = StorageAuthHost['_transport']['downloadStorageObject'];

export const apiUrl = 'https://api.volcano.dev';
const anonKey = `header.${Buffer.from(JSON.stringify({ project_id: 'project-1' })).toString('base64url')}.signature`;

export interface Fixture {
  api: StorageFileApi;
  host: StorageAuthHost;
  fetch: jest.MockedFunction<typeof fetch>;
  upload: jest.Mock<Upload>;
  download: jest.Mock<Download>;
}

export function fixture(accessToken: string | null = 'token', bucketName = 'bucket'): Fixture {
  const request = jest.fn<typeof fetch>();
  globalThis.fetch = request;
  const upload = jest.fn<Upload>();
  const download = jest.fn<Download>();
  upload.mockResolvedValue({ data: storageObject() });
  download.mockResolvedValue({ data: new Blob(['data']) });
  const host: StorageAuthHost = {
    apiUrl,
    anonKey,
    timeout: 1000,
    accessToken,
    _oauthExchangeError: null,
    _transport: { uploadStorageObject: upload, downloadStorageObject: download },
    _generatedOptions(mode, headers, responseType) {
      return { volcanoAuthorization: mode, headers, responseType };
    },
    _completeOAuthExchange: () => Promise.resolve(),
    _captureAuthContext() {
      return { accessToken: this.accessToken };
    },
    _refreshSessionForContext: () => Promise.resolve({ error: new Error('refresh unavailable') }),
    _isAuthContextCurrent() {
      return true;
    },
  };
  return { api: new StorageFileApi(host, bucketName), host, fetch: request, upload, download };
}
