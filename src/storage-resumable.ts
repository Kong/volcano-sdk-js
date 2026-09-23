import type { ResumableUploadOptions } from './index.js';

interface StorageResult {
  data: unknown;
  error: Error | null;
}

interface UploadSession {
  sessionId: string;
  totalParts: number;
  partSize: number;
}

export interface ResumableStorageHost {
  _checkAuth(): Promise<StorageResult | null>;
  createUploadSession(
    path: string,
    options: { totalSize: number; contentType: string; partSize: number },
  ): Promise<StorageResult>;
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: Blob,
  ): Promise<StorageResult>;
  abortUploadSession(path: string, sessionId: string): Promise<{ error: Error | null }>;
  completeUploadSession(path: string, sessionId: string): Promise<StorageResult>;
}

const DEFAULT_UPLOAD_PART_SIZE = 25 * 1024 * 1024;

/** Coordinate resumable upload without trusting the session response body. */
export async function uploadResumable(
  host: ResumableStorageHost,
  path: string,
  fileBody: File | Blob,
  options: ResumableUploadOptions = {},
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }

  return startUpload(host, path, fileBody, options);
}

async function startUpload(
  host: ResumableStorageHost,
  path: string,
  fileBody: File | Blob,
  options: ResumableUploadOptions,
): Promise<StorageResult> {
  try {
    const started = await host.createUploadSession(path, {
      totalSize: fileBody.size,
      contentType: uploadContentType(fileBody, options.contentType),
      partSize: uploadPartSize(options.partSize),
    });
    if (started.error !== null) {
      return { data: null, error: started.error };
    }
    return await uploadParts(host, path, fileBody, sessionFrom(started.data), options.onProgress);
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error : new Error('Resumable upload failed'),
    };
  }
}

function uploadContentType(fileBody: File | Blob, configured: string | undefined): string {
  if (configured !== undefined && configured.length > 0) {
    return configured;
  }
  const fileType = fileBody instanceof File ? fileBody.type : '';
  return fileType.length > 0 ? fileType : 'application/octet-stream';
}

function uploadPartSize(configured: number | undefined): number {
  return configured === undefined || configured === 0 ? DEFAULT_UPLOAD_PART_SIZE : configured;
}

function sessionFrom(value: unknown): UploadSession {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('Upload session response is not an object');
  }
  return {
    sessionId: requiredSessionId(value),
    totalParts: requiredCount(value),
    partSize: requiredPartSize(value),
  };
}

function requiredSessionId(value: object): string {
  if (!('session_id' in value) || typeof value.session_id !== 'string') {
    throw new TypeError('Upload session has no ID');
  }
  return value.session_id;
}

function requiredCount(value: object): number {
  if (!('total_parts' in value) || !validCount(value.total_parts)) {
    throw new TypeError('Upload session has an invalid part count');
  }
  return value.total_parts;
}

function requiredPartSize(value: object): number {
  if (!('part_size' in value) || !validPartSize(value.part_size)) {
    throw new TypeError('Upload session has an invalid part size');
  }
  return value.part_size;
}

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function validPartSize(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

async function uploadParts(
  host: ResumableStorageHost,
  path: string,
  fileBody: File | Blob,
  session: UploadSession,
  onProgress: ResumableUploadOptions['onProgress'],
): Promise<StorageResult> {
  for (let partNumber = 1; partNumber <= session.totalParts; partNumber += 1) {
    const start = (partNumber - 1) * session.partSize;
    const end = Math.min(start + session.partSize, fileBody.size);
    const partData = fileBody.slice(start, end);
    const result = await host.uploadPart(path, session.sessionId, partNumber, partData);
    if (result.error !== null) {
      return abortFailedPart(host, path, session.sessionId, result.error);
    }
    if (onProgress !== undefined) {
      onProgress(end, fileBody.size);
    }
  }
  return host.completeUploadSession(path, session.sessionId);
}

async function abortFailedPart(
  host: ResumableStorageHost,
  path: string,
  sessionId: string,
  partError: Error,
): Promise<StorageResult> {
  const aborted = await host.abortUploadSession(path, sessionId);
  if (aborted.error !== null) {
    console.warn(`[Storage] Failed to abort upload session ${sessionId}:`, aborted.error.message);
  }
  return { data: null, error: partError };
}
