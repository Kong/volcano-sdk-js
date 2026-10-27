import { errorResult } from './api-errors.ts';
import { isFalsy } from './falsy.ts';
import type {
  StorageDownloadOptions,
  StorageListOptions,
  StorageListResponse,
  StorageMoveResponse,
  StorageObject,
  StorageRemoveError,
  StorageUploadOptions,
  StorageUploadResponse,
} from './index.js';
import type { StorageFileApi } from './storage-file.ts';
import { fileName, legacyStringDefault, preflight, validatedResult } from './storage-file-request.ts';
import { bucketRelativePath } from './storage-paths.ts';
import { isStorageObject, isStorageObjects } from './storage-shapes.ts';

function uploadFileBody(path: string, fileBody: unknown, options: StorageUploadOptions): File | null {
  if (fileBody instanceof File) {
    return fileBody;
  }
  if (fileBody instanceof Blob || fileBody instanceof ArrayBuffer) {
    return new File([fileBody], fileName(path), {
      type: legacyStringDefault(options.contentType, 'application/octet-stream'),
    });
  }
  return null;
}

export function downloadHeaders(options: StorageDownloadOptions): { Range: string } | undefined {
  const range: unknown = options.range;
  return isFalsy(range) ? undefined : { Range: String(range) };
}

export function listUrl(host: StorageFileApi, prefix: unknown, options: StorageListOptions): string {
  const params = new URLSearchParams();
  if (!isFalsy(prefix)) {
    params.set('prefix', String(prefix));
  }
  if (!isFalsy(options.limit)) {
    params.set('limit', String(options.limit));
  }
  if (!isFalsy(options.cursor)) {
    params.set('cursor', String(options.cursor));
  }
  const query = params.toString();
  const base = `${host.volcanoAuth.apiUrl}/storage/${encodeURIComponent(host.bucketName)}`;
  return query.length > 0 ? `${base}?${query}` : base;
}

function listFailure(error: Error): StorageListResponse {
  return { data: null, error, nextCursor: null };
}

function listObjects(value: object): StorageObject[] | null {
  const objects: unknown = Reflect.get(value, 'objects');
  if (isFalsy(objects)) {
    return [];
  }
  return isStorageObjects(objects) ? objects : null;
}

function listCursor(value: object): string | null {
  const cursor: unknown = Reflect.get(value, 'next_cursor');
  return typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
}

export function listPayload(value: unknown): StorageListResponse {
  if (typeof value !== 'object' || value === null) {
    return listFailure(new TypeError('Storage list response is not an object'));
  }
  const objects = listObjects(value);
  if (objects === null) {
    return listFailure(new TypeError('Storage list response has invalid objects'));
  }
  return { data: objects, error: null, nextCursor: listCursor(value) };
}

export async function uploadWithFile(
  host: StorageFileApi,
  path: string,
  fileBody: unknown,
  options: StorageUploadOptions,
): Promise<StorageUploadResponse> {
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
    return validatedResult({ data: response.data, error: null }, isStorageObject, 'storage upload');
  } catch (error) {
    return { data: null, error: error instanceof Error ? error : new Error('Upload failed') };
  }
}

interface RemovedPath {
  path: string;
  error: Error;
}

export async function deletePaths(
  host: StorageFileApi,
  paths: readonly string[],
): Promise<{ deleted: string[]; failures: RemovedPath[] }> {
  const deleted: string[] = [];
  const failures: RemovedPath[] = [];
  for (const path of paths) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- Delete one path at a time so a long list never bursts the API.
    const result = await host._storageRequest(host._buildUrl(path), { method: 'DELETE' });
    if (result.error === null) {
      deleted.push(path);
    } else {
      failures.push({ path, error: result.error });
    }
  }
  return { deleted, failures };
}

function transferBody(fromPath: string, toPath: string): string {
  return JSON.stringify({ from: bucketRelativePath(fromPath), to: bucketRelativePath(toPath) });
}

export async function transferObject(
  host: StorageFileApi,
  fromPath: string,
  toPath: string,
  operation: 'move' | 'copy',
): Promise<StorageMoveResponse> {
  const rejected = await preflight(host, fromPath, toPath);
  if (rejected !== null) {
    return rejected;
  }

  return validatedResult(
    await host._storageRequest(
      `${host.volcanoAuth.apiUrl}/storage/${encodeURIComponent(host.bucketName)}/${operation}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: transferBody(fromPath, toPath),
      },
    ),
    isStorageObject,
    `storage ${operation}`,
  );
}

export function removeError(failures: { path: string; error: Error }[], firstError: Error): StorageRemoveError {
  const error = Object.assign(
    new Error(`Failed to delete ${String(failures.length)} file(s): ${failures.map((item) => item.path).join(', ')}`),
    { failures },
  );
  for (const field of ['status', 'code', 'retryAfter']) {
    const value: unknown = Reflect.get(firstError, field);
    if (value !== undefined) {
      Reflect.set(error, field, value);
    }
  }
  return error;
}
