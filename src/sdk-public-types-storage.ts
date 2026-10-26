import type { JsonValue } from './sdk-public-types-json.ts';

// ============================================================================
// Storage Types
// ============================================================================

/** Storage object metadata */
export interface StorageObject {
  id: string;
  bucket_id: string;
  name: string;
  owner_id?: string | null;
  /** Whether the file is publicly accessible (default: false) */
  is_public: boolean;
  size: number;
  mime_type: string;
  etag?: string;
  metadata?: Record<string, JsonValue>;
  created_at?: string;
  updated_at?: string;
  /**
   * Public URL for this file (only set for public files).
   * This URL requires no authentication and can be shared anywhere.
   * Set by the API - use this instead of constructing URLs client-side.
   */
  public_url?: string;
}

/** Upload options */
export interface StorageUploadOptions {
  /** MIME type (auto-detected from File if not provided) */
  contentType?: string;
}

/** Download options */
export interface StorageDownloadOptions {
  /** Range header for partial downloads (e.g., 'bytes=0-1023') */
  range?: string;
}

/** List options */
export interface StorageListOptions {
  /** Maximum number of files to return (default: 100, max: 1000) */
  limit?: number;
  /** Pagination cursor from previous response */
  cursor?: string;
}

/** Storage errors include HTTP metadata when a server response is available. */
export interface StorageError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

/** Upload response */
export interface StorageUploadResponse {
  data: StorageObject | null;
  error: StorageError | null;
}

/** Download response */
export interface StorageDownloadResponse {
  data: Blob | null;
  error: StorageError | null;
}

/** List response */
export interface StorageListResponse {
  data: StorageObject[] | null;
  error: StorageError | null;
  nextCursor: string | null;
}

/** Remove response */
export interface StorageRemoveError extends StorageError {
  /** Per-path failures when deletion reached the server; top-level metadata describes the first failure. */
  failures?: { path: string; error: StorageError }[];
}

export interface StorageRemoveResponse {
  data: { deleted: string[] } | null;
  error: StorageRemoveError | null;
}

/** Move/Copy response */
export interface StorageMoveResponse {
  data: StorageObject | null;
  error: StorageError | null;
}

/** Visibility update response */
export interface StorageVisibilityResponse {
  data: StorageObject | null;
  error: StorageError | null;
}

/** Options for creating a resumable upload session */
export interface CreateUploadSessionOptions {
  /** Total file size in bytes */
  totalSize: number;
  /** MIME type (default: application/octet-stream) */
  contentType?: string;
  /** Part size in bytes (default: 25MB, min: 5MB, max: 25MB) */
  partSize?: number;
}

/** Response from creating an upload session */
export interface CreateUploadSessionResponse {
  data: {
    session_id: string;
    part_size: number;
    total_parts: number;
    expires_at: string;
  } | null;
  error: StorageError | null;
}

/** Response from uploading a part */
export interface UploadPartResponse {
  data: {
    part_number: number;
    etag: string;
    size: number;
  } | null;
  error: StorageError | null;
}

/** Response from completing an upload session */
export interface CompleteUploadSessionResponse {
  data: { object: StorageObject } | null;
  error: StorageError | null;
}

/** Response from getting upload session status */
export interface UploadSessionStatusResponse {
  data: {
    session_id: string;
    path: string;
    status: 'pending' | 'uploading' | 'completing' | 'completed' | 'aborted';
    content_type: string;
    total_size: number;
    part_size: number;
    total_parts: number;
    parts_uploaded: number;
    bytes_uploaded: number;
    parts: {
      part_number: number;
      etag: string;
      size: number;
    }[];
    expires_at: string;
    created_at: string;
  } | null;
  error: StorageError | null;
}

/** Options for resumable upload */
export interface ResumableUploadOptions {
  /** MIME type (auto-detected from File if not provided) */
  contentType?: string;
  /** Part size in bytes (default: 25MB) */
  partSize?: number;
  /** Progress callback */
  onProgress?: (uploaded: number, total: number) => void;
}

/**
 * Storage File API for operations on a specific bucket. Every method returns an
 * error without a request when the bucket name or an object path breaks the
 * path rules in the storage guide: for example a blank or non-string value, an
 * empty, "." or ".." path segment, a bucket name that contains "/", or a lone
 * UTF-16 surrogate. One leading "/" on a path is dropped.
 */
export interface StorageFileApi {
  /** Upload a file to the bucket */
  upload(
    path: string,
    fileBody: File | Blob | ArrayBuffer,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResponse>;

  /** Download a file from the bucket */
  download(path: string, options?: StorageDownloadOptions): Promise<StorageDownloadResponse>;

  /** List files in the bucket */
  list(prefix?: string, options?: StorageListOptions): Promise<StorageListResponse>;

  /** Delete one or more files from the bucket */
  remove(paths: string | string[]): Promise<StorageRemoveResponse>;

  /** Move/rename a file within the bucket */
  move(fromPath: string, toPath: string): Promise<StorageMoveResponse>;

  /** Copy a file within the bucket */
  copy(fromPath: string, toPath: string): Promise<StorageMoveResponse>;

  /**
   * Get the public URL for a file (only works for public files).
   * NOTE: The list() and updateVisibility() methods return file objects with
   * a public_url field already set by the API. Using that field is preferred.
   */
  getPublicUrl(path: string): { data: { publicUrl: string } | null; error: StorageError | null };

  /** Update the visibility (public/private) of a file */
  updateVisibility(path: string, isPublic: boolean): Promise<StorageVisibilityResponse>;

  // ========================================================================
  // Resumable Upload Methods (for large files)
  // ========================================================================

  /**
   * Create a resumable upload session for large files.
   * Use this for files over 100MB or when you need resume capability.
   */
  createUploadSession(path: string, options: CreateUploadSessionOptions): Promise<CreateUploadSessionResponse>;

  /**
   * Upload a part of a resumable upload session.
   * @param path - The path where the file will be stored
   * @param sessionId - The upload session ID
   * @param partNumber - Part number (1 to 10000)
   * @param partData - The part data to upload
   */
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<UploadPartResponse>;

  /**
   * Complete a resumable upload session after all parts are uploaded.
   */
  completeUploadSession(path: string, sessionId: string): Promise<CompleteUploadSessionResponse>;

  /**
   * Get the status of a resumable upload session.
   * Useful for resuming interrupted uploads.
   */
  getUploadSession(path: string, sessionId: string): Promise<UploadSessionStatusResponse>;

  /**
   * Abort a resumable upload session and clean up any uploaded parts.
   */
  abortUploadSession(path: string, sessionId: string): Promise<{ error: StorageError | null }>;

  /**
   * Upload a large file using resumable upload with automatic chunking.
   * This is a convenience method that handles the entire resumable upload flow.
   */
  uploadResumable(
    path: string,
    fileBody: File | Blob,
    options?: ResumableUploadOptions,
  ): Promise<CompleteUploadSessionResponse>;
}

/** Storage API */
export interface Storage {
  /** Select a storage bucket to perform operations on */
  from(bucketName: string): StorageFileApi;
}
