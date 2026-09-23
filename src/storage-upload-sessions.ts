import { errorResult } from './api-errors.ts';
import type { CreateUploadSessionOptions } from './index.js';
import type { StorageOperationHost } from './storage-operations.ts';

type StorageSessionHost = Pick<
  StorageOperationHost,
  '_checkAuth' | '_buildUrl' | '_storageRequest'
>;

interface StorageResult {
  data: unknown;
  error: Error | null;
}

/** Create a resumable upload session through the authenticated storage route. */
export async function createStorageUploadSession(
  host: StorageSessionHost,
  path: string,
  options: Partial<CreateUploadSessionOptions> | null | undefined,
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  const totalSize = options?.totalSize;
  if (!Boolean(totalSize)) {
    return errorResult('totalSize is required');
  }
  return host._storageRequest(host._buildUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(uploadSessionBody(path, options, totalSize)),
  });
}

function uploadSessionBody(
  path: string,
  options: Partial<CreateUploadSessionOptions> | null | undefined,
  totalSize: number | undefined,
): object {
  return {
    filename: uploadFileName(path),
    content_type: uploadContentType(options?.contentType),
    total_size: totalSize,
    part_size: options?.partSize,
  };
}

function uploadFileName(path: string): string {
  const name = path.split('/').slice(-1).join('');
  return name.length > 0 ? name : path;
}

function uploadContentType(contentType: unknown): unknown {
  return Boolean(contentType) ? contentType : 'application/octet-stream';
}

/** Upload one part without changing its binary body. */
export async function uploadStoragePart(
  host: StorageSessionHost,
  path: string,
  sessionId: string,
  partNumber: number,
  partData: ArrayBuffer | Blob,
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  return host._storageRequest(host._buildUrl(path), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Upload-Session': sessionId,
      'X-Part-Number': String(partNumber),
    },
    body: partData,
  });
}

/** Finalize a session after all parts have been uploaded. */
export async function completeStorageUploadSession(
  host: StorageSessionHost,
  path: string,
  sessionId: string,
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  return host._storageRequest(host._buildUrl(path), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Upload-Session': sessionId,
      'X-Upload-Complete': 'true',
    },
    body: JSON.stringify({}),
  });
}

/** Read a resumable session without losing the session ownership header. */
export async function getStorageUploadSession(
  host: StorageSessionHost,
  path: string,
  sessionId: string,
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  return host._storageRequest(host._buildUrl(path), {
    method: 'GET',
    headers: { 'X-Upload-Session': sessionId },
  });
}

/** Abort an upload and expose only its error, matching the storage facade. */
export async function abortStorageUploadSession(
  host: StorageSessionHost,
  path: string,
  sessionId: string,
): Promise<{ error: Error | null }> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return { error: authError.error };
  }
  const result = await host._storageRequest(host._buildUrl(path), {
    method: 'DELETE',
    headers: { 'X-Upload-Session': sessionId },
  });
  return { error: result.error };
}
