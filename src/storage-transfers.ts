import { errorResult } from './api-errors.ts';
import type { StorageDownloadOptions, StorageUploadOptions } from './index.js';

interface StorageResult<T> {
  data: T | null;
  error: Error | null;
}

export interface StorageTransferHost {
  readonly bucketName: string;
  readonly volcanoAuth: {
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
  };
  _checkAuth(): Promise<StorageResult<never> | null>;
  _encodePath(path: string): string;
}

/** Upload a File, Blob, or ArrayBuffer through the authenticated generated transport. */
export async function uploadStorageFile(
  host: StorageTransferHost,
  path: string,
  fileBody: unknown,
  options: StorageUploadOptions = {},
): Promise<StorageResult<unknown>> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
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
    return { data: null, error: transferError(error, 'Upload failed') };
  }
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
    return new File([fileBody], uploadFileName(path), {
      type: uploadContentType(options.contentType),
    });
  }
  return null;
}

function uploadFileName(path: string): string {
  const name = path.split('/').slice(-1).join('');
  return name.length === 0 ? 'file' : name;
}

function uploadContentType(contentType: string | undefined): string {
  return contentType === undefined || contentType.length === 0
    ? 'application/octet-stream'
    : contentType;
}

/** Download as a Blob so a JSON-looking file keeps its original bytes. */
export async function downloadStorageFile(
  host: StorageTransferHost,
  path: string,
  options: StorageDownloadOptions = {},
): Promise<StorageResult<Blob>> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  try {
    const response = await host.volcanoAuth._transport.downloadStorageObject(
      encodeURIComponent(host.bucketName),
      host._encodePath(path),
      host.volcanoAuth._generatedOptions('session', downloadHeaders(options), 'blob'),
    );
    if (!(response.data instanceof Blob)) {
      return errorResult('Download response is not a Blob');
    }
    return { data: response.data, error: null };
  } catch (error) {
    return { data: null, error: transferError(error, 'Download failed') };
  }
}

function downloadHeaders(options: StorageDownloadOptions): { Range: string } | undefined {
  return options.range === undefined || options.range.length === 0
    ? undefined
    : { Range: options.range };
}

function transferError(value: unknown, message: string): Error {
  return value instanceof Error ? value : new Error(message);
}
