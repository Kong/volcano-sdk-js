import type { StorageListOptions } from './index.js';

interface StorageResult {
  data: unknown;
  error: Error | null;
}

interface StorageListResult {
  data: unknown[] | null;
  error: Error | null;
  nextCursor: string | null;
}

export interface StorageOperationHost {
  readonly bucketName: string;
  readonly volcanoAuth: { readonly apiUrl: string };
  _checkAuth(): Promise<StorageResult | null>;
  _buildUrl(path: string): string;
  _storageRequest(url: string, options: RequestInit): Promise<StorageResult>;
}

/** List bucket objects while validating the outer response shape and cursor. */
export async function listStorageObjects(
  host: StorageOperationHost,
  prefix = '',
  options: StorageListOptions = {},
): Promise<StorageListResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return { data: null, error: authError.error, nextCursor: null };
  }
  const result = await host._storageRequest(listUrl(host, prefix, options), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });
  if (result.error !== null) {
    return { data: null, error: result.error, nextCursor: null };
  }
  return listResponse(result.data);
}

function listUrl(host: StorageOperationHost, prefix: string, options: StorageListOptions): string {
  const params = new URLSearchParams();
  if (prefix.length > 0) {
    params.set('prefix', prefix);
  }
  if (hasLimit(options.limit)) {
    params.set('limit', String(options.limit));
  }
  if (hasCursor(options.cursor)) {
    params.set('cursor', options.cursor);
  }
  const query = params.toString();
  const base = `${host.volcanoAuth.apiUrl}/storage/${encodeURIComponent(host.bucketName)}`;
  return query.length > 0 ? `${base}?${query}` : base;
}

function hasLimit(value: number | undefined): value is number {
  return value !== undefined && value !== 0;
}

function hasCursor(value: string | undefined): value is string {
  return value !== undefined && value.length > 0;
}

function listResponse(value: unknown): StorageListResult {
  if (!isRecord(value)) {
    return {
      data: null,
      error: new TypeError('Storage list response is not an object'),
      nextCursor: null,
    };
  }
  const objects = isUnknownArray(value['objects']) ? value['objects'] : [];
  const cursor = value['next_cursor'];
  const nextCursor = typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
  return { data: objects, error: null, nextCursor };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isUnknownArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

interface StorageFailure {
  path: string;
  error: Error;
}

export interface StorageRemoveError extends Error {
  failures: StorageFailure[];
  status?: number;
  code?: string;
  retryAfter?: number;
}

/** Delete every requested path and report partial success with per-path failures. */
export async function removeStorageObjects(
  host: StorageOperationHost,
  paths: string | string[],
): Promise<{ data: { deleted: string[] } | null; error: StorageRemoveError | Error | null }> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return { data: null, error: authError.error };
  }
  const deleted: string[] = [];
  const failures: StorageFailure[] = [];
  for (const path of Array.isArray(paths) ? paths : [paths]) {
    const result = await host._storageRequest(host._buildUrl(path), { method: 'DELETE' });
    if (result.error === null) {
      deleted.push(path);
    } else {
      failures.push({ path, error: result.error });
    }
  }
  return removeResult(deleted, failures);
}

function removeResult(
  deleted: string[],
  failures: StorageFailure[],
): { data: { deleted: string[] }; error: StorageRemoveError | null } {
  const first = failures[0];
  if (first === undefined) {
    return { data: { deleted }, error: null };
  }
  const error: StorageRemoveError = Object.assign(
    new Error(
      `Failed to delete ${String(failures.length)} file(s): ${failures.map((item) => item.path).join(', ')}`,
    ),
    { failures },
  );
  copyErrorMetadata(error, first.error);
  return { data: { deleted }, error };
}

function copyErrorMetadata(target: StorageRemoveError, source: Error): void {
  const status = numericMetadata(source, 'status');
  if (status !== undefined) {
    target.status = status;
  }
  const code = stringMetadata(source, 'code');
  if (code !== undefined) {
    target.code = code;
  }
  const retryAfter = numericMetadata(source, 'retryAfter');
  if (retryAfter !== undefined) {
    target.retryAfter = retryAfter;
  }
}

function numericMetadata(source: Error, name: string): number | undefined {
  if (!(name in source)) {
    return undefined;
  }
  const value: unknown = Reflect.get(source, name);
  return typeof value === 'number' ? value : undefined;
}

function stringMetadata(source: Error, name: string): string | undefined {
  if (!(name in source)) {
    return undefined;
  }
  const value: unknown = Reflect.get(source, name);
  return typeof value === 'string' ? value : undefined;
}

/** Move or copy a file within one bucket using the same authenticated request path. */
export async function transferStorageObject(
  host: StorageOperationHost,
  operation: 'move' | 'copy',
  fromPath: string,
  toPath: string,
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  return host._storageRequest(
    `${host.volcanoAuth.apiUrl}/storage/${encodeURIComponent(host.bucketName)}/${operation}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: fromPath, to: toPath }),
    },
  );
}

/** Change visibility without constructing a separate unauthenticated transport. */
export async function updateStorageVisibility(
  host: StorageOperationHost,
  path: string,
  isPublic: boolean,
): Promise<StorageResult> {
  const authError = await host._checkAuth();
  if (authError !== null) {
    return authError;
  }
  return host._storageRequest(`${host._buildUrl(path)}/visibility`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_public: isPublic }),
  });
}
