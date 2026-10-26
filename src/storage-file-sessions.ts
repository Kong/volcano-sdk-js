import { errorResult } from './api-errors.ts';
import type {
  CompleteUploadSessionResponse,
  CreateUploadSessionOptions,
  CreateUploadSessionResponse,
  StorageError,
  UploadPartResponse,
  UploadSessionStatusResponse,
} from './index.js';
import type { StorageFileApi } from './storage-file.ts';
import { fileName, legacyValueDefault, preflight, validatedResult } from './storage-file-request.ts';
import { isCompletedUpload, isUploadPart, isUploadSession, isUploadSessionStatus } from './storage-shapes.ts';

function uploadSessionBody(path: string, options: Partial<CreateUploadSessionOptions>): object {
  return {
    filename: fileName(path),
    content_type: legacyValueDefault(options.contentType, 'application/octet-stream'),
    total_size: options.totalSize,
    part_size: options.partSize,
  };
}

export async function createSession(
  host: StorageFileApi,
  path: string,
  options: Partial<CreateUploadSessionOptions> | null | undefined,
): Promise<CreateUploadSessionResponse> {
  const rejected = await preflight(host, path);
  if (rejected !== null) {
    return rejected;
  }

  if (options === null || options === undefined || !options.totalSize) {
    return errorResult('totalSize is required');
  }

  return validatedResult(
    await host._storageRequest(host._buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadSessionBody(path, options)),
    }),
    isUploadSession,
    'upload session creation',
  );
}

export async function uploadSessionPart(
  host: StorageFileApi,
  path: string,
  sessionId: string,
  partNumber: number,
  partData: ArrayBuffer | Blob,
): Promise<UploadPartResponse> {
  const rejected = await preflight(host, path);
  if (rejected !== null) {
    return rejected;
  }

  return validatedResult(
    await host._storageRequest(host._buildUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Session': sessionId,
        'X-Part-Number': String(partNumber),
      },
      body: partData,
    }),
    isUploadPart,
    'upload part',
  );
}

export async function completeSession(
  host: StorageFileApi,
  path: string,
  sessionId: string,
): Promise<CompleteUploadSessionResponse> {
  const rejected = await preflight(host, path);
  if (rejected !== null) {
    return rejected;
  }

  return validatedResult(
    await host._storageRequest(host._buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Session': sessionId,
        'X-Upload-Complete': 'true',
      },
      body: JSON.stringify({}),
    }),
    isCompletedUpload,
    'completed upload',
  );
}

export async function getSession(
  host: StorageFileApi,
  path: string,
  sessionId: string,
): Promise<UploadSessionStatusResponse> {
  const rejected = await preflight(host, path);
  if (rejected !== null) {
    return rejected;
  }

  return validatedResult(
    await host._storageRequest(host._buildUrl(path), {
      method: 'GET',
      headers: { 'X-Upload-Session': sessionId },
    }),
    isUploadSessionStatus,
    'upload session status',
  );
}

export async function abortSession(
  host: StorageFileApi,
  path: string,
  sessionId: string,
): Promise<{ error: StorageError | null }> {
  const rejected = await preflight(host, path);
  if (rejected !== null) {
    return { error: rejected.error };
  }

  const result = await host._storageRequest(host._buildUrl(path), {
    method: 'DELETE',
    headers: { 'X-Upload-Session': sessionId },
  });

  return { error: result.error };
}
