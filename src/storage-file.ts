import { errorResult } from './api-errors.ts';
import { type AuthRetryClient, fetchWithAuthRetry } from './auth-fetch-retry.ts';
import type {
  CreateUploadSessionOptions,
  ResumableUploadOptions,
  StorageDownloadOptions,
  StorageListOptions,
  StorageUploadOptions,
} from './index.js';
import { buildStorageUrl, encodeStoragePath } from './storage-paths.ts';
import { storagePublicUrl } from './storage-public-url.ts';
import { uploadResumable as runResumableUpload } from './storage-resumable.ts';
import {
  storageRequest,
  type StorageRequestOptions,
  type StorageRequestResult,
} from './storage-transport.ts';

interface StorageResult {
  data: unknown;
  error: Error | null;
}

interface StorageListResult {
  data: unknown[] | null;
  error: Error | null;
  nextCursor: string | null;
}

interface StorageAuthContext {
  accessToken: string | null;
}

export interface StorageAuthHost extends AuthRetryClient<StorageAuthContext> {
  readonly apiUrl: string;
  readonly anonKey: string;
  readonly _oauthExchangeError: string | null;
  readonly _transport: {
    uploadStorageObject(
      bucketName: string,
      path: string,
      body: { file: File },
      options: unknown,
    ): Promise<{ data: unknown }>;
    downloadStorageObject(
      bucketName: string,
      path: string,
      options: unknown,
    ): Promise<{ data: unknown }>;
  };
  _generatedOptions(
    mode: 'session',
    headers?: Record<string, string>,
    responseType?: 'blob',
  ): unknown;
}

function legacyStringDefault(value: unknown, fallback: string): string {
  return Boolean(value) ? String(value) : fallback;
}

function legacyValueDefault(value: unknown, fallback: unknown): unknown {
  return Boolean(value) ? value : fallback;
}

function uploadFileBody(
  path: string,
  fileBody: unknown,
  options: StorageUploadOptions,
): File | null {
  if (fileBody instanceof File) {
    return fileBody;
  }
  if (fileBody instanceof Blob || fileBody instanceof ArrayBuffer) {
    return new File([fileBody], legacyStringDefault(path.split('/').pop(), 'file'), {
      type: legacyStringDefault(options.contentType, 'application/octet-stream'),
    });
  }
  return null;
}

function downloadHeaders(options: StorageDownloadOptions): { Range: string } | undefined {
  const range: unknown = options.range;
  return Boolean(range) ? { Range: String(range) } : undefined;
}

function listUrl(host: StorageFileApi, prefix: unknown, options: StorageListOptions): string {
  const params = new URLSearchParams();
  if (Boolean(prefix)) {
    params.set('prefix', String(prefix));
  }
  if (Boolean(options.limit)) {
    params.set('limit', String(options.limit));
  }
  if (Boolean(options.cursor)) {
    params.set('cursor', String(options.cursor));
  }
  const query = params.toString();
  const base = `${host.volcanoAuth.apiUrl}/storage/${encodeURIComponent(host.bucketName)}`;
  return query.length > 0 ? `${base}?${query}` : base;
}

function listFailure(error: Error): StorageListResult {
  return { data: null, error, nextCursor: null };
}

function listObjects(value: object): unknown[] | null {
  const objects: unknown = Reflect.get(value, 'objects');
  if (!Boolean(objects)) {
    return [];
  }
  return Array.isArray(objects) ? objects : null;
}

function listCursor(value: object): string | null {
  const cursor: unknown = Reflect.get(value, 'next_cursor');
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

function listPayload(value: unknown): StorageListResult {
  if (typeof value !== 'object' || value === null) {
    return listFailure(new TypeError('Storage list response is not an object'));
  }
  const objects = listObjects(value);
  if (objects === null) {
    return listFailure(new TypeError('Storage list response has invalid objects'));
  }
  return { data: objects, error: null, nextCursor: listCursor(value) };
}

async function uploadWithFile(
  host: StorageFileApi,
  path: string,
  fileBody: unknown,
  options: StorageUploadOptions,
): Promise<StorageResult> {
  try {
    const file = uploadFileBody(path, fileBody, options);
    if (file === null) {
      return errorResult('Invalid file body type. Expected File, Blob, or ArrayBuffer.');
    }
    const response = await host.volcanoAuth._transport.uploadStorageObject(
      encodeURIComponent(host.bucketName),
      host._encodePath(path),
      { file },
      host.volcanoAuth._generatedOptions('session'),
    );
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Upload failed') };
  }
}

interface RemovedPath {
  path: string;
  error: Error;
}

async function deletePaths(
  host: StorageFileApi,
  paths: string | string[],
): Promise<{ deleted: string[]; failures: RemovedPath[] }> {
  const deleted: string[] = [];
  const failures: RemovedPath[] = [];
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const result = await host._storageRequest(host._buildUrl(path), { method: 'DELETE' });
    if (result.error === null) {
      deleted.push(path);
    } else {
      failures.push({ path, error: result.error });
    }
  }
  return { deleted, failures };
}

function uploadSessionBody(
  path: string,
  options: Partial<CreateUploadSessionOptions> | null | undefined,
): object {
  return {
    filename: legacyStringDefault(path.split('/').pop(), path),
    content_type: legacyValueDefault(options?.contentType, 'application/octet-stream'),
    total_size: options?.totalSize,
    part_size: options?.partSize,
  };
}

function removeError(failures: { path: string; error: Error }[], firstError: Error): Error {
  const error = Object.assign(
    new Error(
      `Failed to delete ${String(failures.length)} file(s): ${failures.map((item) => item.path).join(', ')}`,
    ),
    { failures },
  );
  for (const field of ['status', 'code', 'retryAfter']) {
    if (field in firstError) {
      const value: unknown = Reflect.get(firstError, field);
      if (value !== undefined) {
        Reflect.set(error, field, value);
      }
    }
  }
  return error;
}

export class StorageFileApi {
  readonly volcanoAuth: StorageAuthHost;
  readonly bucketName: string;

  constructor(volcanoAuth: StorageAuthHost, bucketName: string) {
    this.volcanoAuth = volcanoAuth;
    this.bucketName = bucketName;
  }

  /**
   * Check if user is authenticated
   * @private
   */
  async _checkAuth(): Promise<StorageResult | null> {
    await this.volcanoAuth._completeOAuthExchange();
    if (!Boolean(this.volcanoAuth.accessToken)) {
      return errorResult(
        legacyStringDefault(
          this.volcanoAuth._oauthExchangeError,
          'No active session. Please sign in first.',
        ),
      );
    }
    return null;
  }

  /**
   * Build a storage URL for the given path
   * @private
   */
  _buildUrl(path: string): string {
    return buildStorageUrl(this.volcanoAuth.apiUrl, this.bucketName, this._encodePath(path));
  }

  /**
   * Encode a storage path for use in URLs
   * @private
   */
  _encodePath(path: string): string {
    return encodeStoragePath(path);
  }

  /**
   * Make an authenticated storage request
   * @private
   */
  async _storageRequest(
    url: string,
    options: StorageRequestOptions = {},
  ): Promise<StorageRequestResult> {
    return storageRequest(
      (requestUrl, requestOptions) =>
        fetchWithAuthRetry(this.volcanoAuth, requestUrl, requestOptions),
      url,
      options,
    );
  }

  /**
   * Upload a file to the bucket
   */
  async upload(
    path: string,
    fileBody: unknown,
    options: StorageUploadOptions = {},
  ): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }
    return uploadWithFile(this, path, fileBody, options);
  }

  /**
   * Download a file from the bucket
   */
  async download(path: string, options: StorageDownloadOptions = {}): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    try {
      const response = await this.volcanoAuth._transport.downloadStorageObject(
        encodeURIComponent(this.bucketName),
        this._encodePath(path),
        this.volcanoAuth._generatedOptions('session', downloadHeaders(options), 'blob'),
      );
      return { data: response.data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Download failed') };
    }
  }

  /**
   * List files in the bucket
   */
  async list(prefix: unknown = '', options: StorageListOptions = {}): Promise<StorageListResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return { data: null, error: authError.error, nextCursor: null };
    }

    const result = await this._storageRequest(listUrl(this, prefix, options), {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (result.error !== null) {
      return { data: null, error: result.error, nextCursor: null };
    }

    return listPayload(result.data);
  }

  /**
   * Delete one or more files from the bucket
   */
  async remove(paths: string | string[]): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    const { deleted, failures } = await deletePaths(this, paths);
    const first = failures[0];
    if (first !== undefined) {
      return { data: { deleted }, error: removeError(failures, first.error) };
    }

    return { data: { deleted }, error: null };
  }

  /**
   * Move/rename a file within the bucket
   */
  async move(fromPath: string, toPath: string): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    return this._storageRequest(
      `${this.volcanoAuth.apiUrl}/storage/${encodeURIComponent(this.bucketName)}/move`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      },
    );
  }

  /**
   * Copy a file within the bucket
   */
  async copy(fromPath: string, toPath: string): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    return this._storageRequest(
      `${this.volcanoAuth.apiUrl}/storage/${encodeURIComponent(this.bucketName)}/copy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      },
    );
  }

  /**
   * Get the public URL for a file (only works for files with is_public=true)
   */
  getPublicUrl(path: string): { data: { publicUrl: string } | null; error: Error | null } {
    return storagePublicUrl(
      this.volcanoAuth.apiUrl,
      this.bucketName,
      this.volcanoAuth.anonKey,
      path,
    );
  }

  /**
   * Update the visibility (public/private) of a file
   */
  async updateVisibility(path: string, isPublic: boolean): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    return this._storageRequest(`${this._buildUrl(path)}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    });
  }

  // ========================================================================
  // Resumable Upload Methods
  // ========================================================================

  async createUploadSession(
    path: string,
    options: Partial<CreateUploadSessionOptions> | null | undefined,
  ): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    if (!Boolean(options?.totalSize)) {
      return errorResult('totalSize is required');
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadSessionBody(path, options)),
    });
  }

  async uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Session': sessionId,
        'X-Part-Number': String(partNumber),
      },
      body: partData,
    });
  }

  async completeUploadSession(path: string, sessionId: string): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Session': sessionId,
        'X-Upload-Complete': 'true',
      },
      body: JSON.stringify({}),
    });
  }

  async getUploadSession(path: string, sessionId: string): Promise<StorageResult> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'GET',
      headers: { 'X-Upload-Session': sessionId },
    });
  }

  async abortUploadSession(path: string, sessionId: string): Promise<{ error: Error | null }> {
    const authError = await this._checkAuth();
    if (authError !== null) {
      return { error: authError.error };
    }

    const result = await this._storageRequest(this._buildUrl(path), {
      method: 'DELETE',
      headers: { 'X-Upload-Session': sessionId },
    });

    return { error: result.error };
  }

  uploadResumable(
    path: string,
    fileBody: File | Blob,
    options: ResumableUploadOptions = {},
  ): Promise<StorageResult> {
    return runResumableUpload(this, path, fileBody, options);
  }
}
