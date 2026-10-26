import { type AuthRetryClient, fetchWithAuthRetry } from './auth-fetch-retry.ts';
import type {
  CompleteUploadSessionResponse,
  CreateUploadSessionOptions,
  CreateUploadSessionResponse,
  ResumableUploadOptions,
  StorageDownloadOptions,
  StorageDownloadResponse,
  StorageError,
  StorageListOptions,
  StorageListResponse,
  StorageMoveResponse,
  StorageRemoveResponse,
  StorageUploadOptions,
  StorageUploadResponse,
  StorageVisibilityResponse,
  UploadPartResponse,
  UploadSessionStatusResponse,
} from './index.js';
import {
  deletePaths,
  downloadHeaders,
  listPayload,
  listUrl,
  removeError,
  transferObject,
  uploadWithFile,
} from './storage-file-objects.ts';
import {
  invalidTarget,
  preflight,
  preflightPaths,
  sessionRefusal,
  type StorageResult,
  validatedResult,
} from './storage-file-request.ts';
import {
  abortSession,
  completeSession,
  createSession,
  getSession,
  uploadSessionPart,
} from './storage-file-sessions.ts';
import { buildStorageUrl, encodeStoragePath } from './storage-paths.ts';
import { storagePublicUrl } from './storage-public-url.ts';
import { uploadResumable as runResumableUpload } from './storage-resumable.ts';
import { isBlob, isCompletedUpload, isStorageObject } from './storage-shapes.ts';
import { storageRequest, type StorageRequestOptions, type StorageRequestResult } from './storage-transport.ts';

interface StorageAuthContext {
  accessToken: string | null;
}

export interface StorageAuthHost extends AuthRetryClient<StorageAuthContext> {
  readonly apiUrl: string;
  readonly anonKey: string;
  readonly _oauthExchangeError: Error | string | null;
  readonly _transport: {
    uploadStorageObject(
      bucketName: string,
      path: string,
      body: { file: File },
      options: unknown,
    ): Promise<{ data: unknown }>;
    downloadStorageObject(bucketName: string, path: string, options: unknown): Promise<{ data: unknown }>;
  };
  _generatedOptions(mode: 'session', headers?: Record<string, string>, responseType?: 'blob'): unknown;
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
  _checkAuth(): Promise<StorageResult<never> | null> {
    return sessionRefusal(this);
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
  async _storageRequest(url: string, options: StorageRequestOptions = {}): Promise<StorageRequestResult> {
    return await storageRequest(
      (requestUrl, requestOptions) => fetchWithAuthRetry(this.volcanoAuth, requestUrl, requestOptions),
      url,
      options,
    );
  }

  /**
   * Upload a file to the bucket
   */
  async upload(path: string, fileBody: unknown, options: StorageUploadOptions = {}): Promise<StorageUploadResponse> {
    const rejected = await preflight(this, path);
    if (rejected !== null) {
      return rejected;
    }
    return uploadWithFile(this, path, fileBody, options);
  }

  /**
   * Download a file from the bucket
   */
  async download(path: string, options: StorageDownloadOptions = {}): Promise<StorageDownloadResponse> {
    const rejected = await preflight(this, path);
    if (rejected !== null) {
      return rejected;
    }

    try {
      const response = await this.volcanoAuth._transport.downloadStorageObject(
        encodeURIComponent(this.bucketName),
        this._encodePath(path),
        this.volcanoAuth._generatedOptions('session', downloadHeaders(options), 'blob'),
      );
      return validatedResult({ data: response.data, error: null }, isBlob, 'storage download');
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Download failed') };
    }
  }

  /**
   * List files in the bucket
   */
  async list(prefix: unknown = '', options: StorageListOptions = {}): Promise<StorageListResponse> {
    const rejected = await preflight(this);
    if (rejected !== null) {
      return { data: null, error: rejected.error, nextCursor: null };
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
  async remove(paths: string | string[]): Promise<StorageRemoveResponse> {
    // Copy the list so the paths deleted are the paths checked.
    const requested = Array.isArray(paths) ? paths.slice() : [paths];
    const rejected = await preflightPaths(this, requested);
    if (rejected !== null) {
      return rejected;
    }

    const { deleted, failures } = await deletePaths(this, requested);
    const first = failures[0];
    if (first !== undefined) {
      return { data: { deleted }, error: removeError(failures, first.error) };
    }

    return { data: { deleted }, error: null };
  }

  /**
   * Move/rename a file within the bucket
   */
  move(fromPath: string, toPath: string): Promise<StorageMoveResponse> {
    return transferObject(this, fromPath, toPath, 'move');
  }

  /**
   * Copy a file within the bucket
   */
  copy(fromPath: string, toPath: string): Promise<StorageMoveResponse> {
    return transferObject(this, fromPath, toPath, 'copy');
  }

  /**
   * Get the public URL for a file (only works for files with is_public=true)
   */
  getPublicUrl(path: string): { data: { publicUrl: string } | null; error: Error | null } {
    return storagePublicUrl(this.volcanoAuth.apiUrl, this.bucketName, this.volcanoAuth.anonKey, path);
  }

  /**
   * Update the visibility (public/private) of a file
   */
  async updateVisibility(path: string, isPublic: boolean): Promise<StorageVisibilityResponse> {
    const rejected = await preflight(this, path);
    if (rejected !== null) {
      return rejected;
    }

    return validatedResult(
      await this._storageRequest(`${this._buildUrl(path)}/visibility`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: isPublic }),
      }),
      isStorageObject,
      'storage visibility',
    );
  }

  // ========================================================================
  // Resumable Upload Methods
  // ========================================================================

  createUploadSession(
    path: string,
    options: Partial<CreateUploadSessionOptions> | null | undefined,
  ): Promise<CreateUploadSessionResponse> {
    return createSession(this, path, options);
  }

  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<UploadPartResponse> {
    return uploadSessionPart(this, path, sessionId, partNumber, partData);
  }

  completeUploadSession(path: string, sessionId: string): Promise<CompleteUploadSessionResponse> {
    return completeSession(this, path, sessionId);
  }

  getUploadSession(path: string, sessionId: string): Promise<UploadSessionStatusResponse> {
    return getSession(this, path, sessionId);
  }

  abortUploadSession(path: string, sessionId: string): Promise<{ error: StorageError | null }> {
    return abortSession(this, path, sessionId);
  }

  async uploadResumable(
    path: string,
    fileBody: File | Blob,
    options: ResumableUploadOptions = {},
  ): Promise<CompleteUploadSessionResponse> {
    const invalid = invalidTarget(this.bucketName, [path]);
    if (invalid !== null) {
      return invalid;
    }
    return validatedResult(
      await runResumableUpload(this, path, fileBody, options),
      isCompletedUpload,
      'resumable upload',
    );
  }
}
