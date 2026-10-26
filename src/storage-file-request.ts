import { errorResult } from './api-errors.ts';
import type { StorageError } from './index.js';
import type { StorageFileApi } from './storage-file.ts';
import { storageTargetError } from './storage-paths.ts';
import type { StorageRequestResult } from './storage-transport.ts';

export interface StorageResult<T> {
  data: T | null;
  error: StorageError | null;
}

export function validatedResult<T>(
  result: StorageRequestResult,
  guard: (value: unknown) => value is T,
  responseName: string,
): StorageResult<T> {
  if (result.error !== null) {
    return { data: null, error: result.error };
  }
  if (!guard(result.data)) {
    return { data: null, error: new TypeError(`Invalid ${responseName} response`) };
  }
  return { data: result.data, error: null };
}

export function legacyStringDefault(value: unknown, fallback: string): string {
  return value ? String(value) : fallback;
}

export function legacyValueDefault(value: unknown, fallback: unknown): unknown {
  return value ? value : fallback;
}

/** Refuse a bucket or path before a URL parser can resolve it outside the bucket route. */
export function invalidTarget(bucketName: string, paths: readonly unknown[]): StorageResult<never> | null {
  const message = storageTargetError(bucketName, paths);
  return message === null ? null : errorResult(message);
}

export async function preflightPaths(
  host: StorageFileApi,
  paths: readonly unknown[],
): Promise<StorageResult<never> | null> {
  return invalidTarget(host.bucketName, paths) ?? (await host._checkAuth());
}

export function preflight(host: StorageFileApi, ...paths: unknown[]): Promise<StorageResult<never> | null> {
  return preflightPaths(host, paths);
}

// Validated paths always end in a non-empty segment.
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
