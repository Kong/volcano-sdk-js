import { errorResult } from './api-errors.ts';
import { type PathSegment, pathSegment } from './path-segments.ts';
import { encodeStoragePath, storageTargetError } from './storage-paths.ts';
import { decodeBase64Url } from './token-claims.ts';

interface PublicUrlResult {
  data: { publicUrl: string } | null;
  error: Error | null;
}

/** Build the legacy public URL only after validating its segments and anon-key claim. */
export function storagePublicUrl(
  apiUrl: string,
  bucketName: string,
  anonKey: string,
  path: string,
): PublicUrlResult {
  const targetError = storageTargetError(bucketName, [path]);
  if (targetError !== null) {
    return errorResult(targetError);
  }
  const parts = anonKey.split('.');
  if (!isTokenParts(parts)) {
    return errorResult('Invalid anon key format');
  }
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(parts[1]));
    const project = projectSegment(payload);
    if (project.error !== null) {
      return errorResult(project.error);
    }
    const encodedPath = encodeStoragePath(path);
    const publicUrl = `${apiUrl}/public/${project.segment}/${encodeURIComponent(bucketName)}/${encodedPath}`;
    return { data: { publicUrl }, error: null };
  } catch (error) {
    return errorResult(`Failed to parse anon key: ${parseErrorMessage(error)}`);
  }
}

function isTokenParts(parts: string[]): parts is [string, string, string] {
  return parts.length === 3;
}

function projectSegment(payload: unknown): PathSegment {
  const projectId = projectIdFrom(payload);
  return projectId === null
    ? { segment: null, error: new Error('Project ID not found in anon key') }
    : pathSegment('Project ID in anon key', projectId);
}

function projectIdFrom(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const projectId: unknown = Reflect.get(payload, 'project_id');
  return nonEmptyProjectId(projectId);
}

function nonEmptyProjectId(projectId: unknown): string | null {
  return typeof projectId === 'string' && projectId.length > 0 ? projectId : null;
}

function parseErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
