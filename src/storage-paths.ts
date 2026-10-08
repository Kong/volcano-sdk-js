import {
  convertedPathSegment,
  hasLoneSurrogate,
  hasUnsafeSegment,
  UNSAFE_SEGMENTS,
} from './path-segments.ts';

/** Hosting ignores one leading slash, so "/a.txt" and "a.txt" name the same object. */
export function bucketRelativePath(path: string): string {
  return path.startsWith('/') ? path.slice(1) : path;
}

export function encodeStoragePath(path: string): string {
  return bucketRelativePath(path)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function buildStorageUrl(apiUrl: string, bucketName: string, encodedPath: string): string {
  return `${apiUrl}/storage/${encodeURIComponent(bucketName)}/${encodedPath}`;
}

/** Refuse a bucket or object path that a URL parser would move outside its route. */
export function storageTargetError(bucketName: unknown, paths: readonly unknown[]): string | null {
  return bucketNameError(bucketName) ?? storagePathsError(paths);
}

function bucketNameError(bucketName: unknown): string | null {
  return convertedPathSegment('Bucket name', bucketName).error?.message ?? null;
}

function storagePathsError(paths: readonly unknown[]): string | null {
  for (const path of paths) {
    const error = storagePathError(path);
    if (error !== null) {
      return error;
    }
  }
  return null;
}

function storagePathError(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) {
    return 'Storage path must be a non-empty string';
  }
  if (hasUnsafeSegment(bucketRelativePath(path))) {
    return `Storage path ${UNSAFE_SEGMENTS}`;
  }
  if (hasLoneSurrogate(path)) {
    return 'Storage path is not well-formed Unicode';
  }
  return null;
}
