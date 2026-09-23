export function encodeStoragePath(path: string): string {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function buildStorageUrl(apiUrl: string, bucketName: string, encodedPath: string): string {
  return `${apiUrl}/storage/${encodeURIComponent(bucketName)}/${encodedPath}`;
}

export function publicStoragePathError(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0) {
    return 'Storage path must be a non-empty string';
  }
  if (path.split('/').some((segment) => segment === '.' || segment === '..')) {
    return 'Public URL paths cannot contain dot segments';
  }
  return null;
}
