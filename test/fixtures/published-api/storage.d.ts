import type { JsonValue } from './auth';
export interface StorageObject {
  id: string;
  bucket_id: string;
  name: string;
  owner_id?: string | null;
  is_public: boolean;
  size: number;
  mime_type: string;
  etag?: string;
  metadata?: Record<string, JsonValue>;
  created_at?: string;
  updated_at?: string;
  public_url?: string;
}
export interface StorageUploadOptions {
  contentType?: string;
}
export interface StorageDownloadOptions {
  range?: string;
}
export interface StorageListOptions {
  limit?: number;
  cursor?: string;
}
export interface StorageError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}
export interface StorageUploadResponse {
  data: StorageObject | null;
  error: StorageError | null;
}
export interface StorageDownloadResponse {
  data: Blob | null;
  error: StorageError | null;
}
export interface StorageListResponse {
  data: StorageObject[] | null;
  error: StorageError | null;
  nextCursor: string | null;
}
export interface StorageRemoveError extends StorageError {
  failures?: {
    path: string;
    error: StorageError;
  }[];
}
export interface StorageRemoveResponse {
  data: {
    deleted: string[];
  } | null;
  error: StorageRemoveError | null;
}
export interface StorageMoveResponse {
  data: StorageObject | null;
  error: StorageError | null;
}
export interface StorageVisibilityResponse {
  data: StorageObject | null;
  error: StorageError | null;
}
export interface CreateUploadSessionOptions {
  totalSize: number;
  contentType?: string;
  partSize?: number;
}
export interface CreateUploadSessionResponse {
  data: {
    session_id: string;
    part_size: number;
    total_parts: number;
    expires_at: string;
  } | null;
  error: StorageError | null;
}
export interface UploadPartResponse {
  data: {
    part_number: number;
    etag: string;
    size: number;
  } | null;
  error: StorageError | null;
}
export interface CompleteUploadSessionResponse {
  data: {
    object: StorageObject;
  } | null;
  error: StorageError | null;
}
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
export interface ResumableUploadOptions {
  contentType?: string;
  partSize?: number;
  onProgress?: (uploaded: number, total: number) => void;
}
export interface StorageFileApi {
  upload(
    path: string,
    fileBody: File | Blob | ArrayBuffer,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResponse>;
  download(path: string, options?: StorageDownloadOptions): Promise<StorageDownloadResponse>;
  list(prefix?: string, options?: StorageListOptions): Promise<StorageListResponse>;
  remove(paths: string | string[]): Promise<StorageRemoveResponse>;
  move(fromPath: string, toPath: string): Promise<StorageMoveResponse>;
  copy(fromPath: string, toPath: string): Promise<StorageMoveResponse>;
  getPublicUrl(path: string): {
    data: {
      publicUrl: string;
    } | null;
    error: StorageError | null;
  };
  updateVisibility(path: string, isPublic: boolean): Promise<StorageVisibilityResponse>;
  createUploadSession(path: string, options: CreateUploadSessionOptions): Promise<CreateUploadSessionResponse>;
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<UploadPartResponse>;
  completeUploadSession(path: string, sessionId: string): Promise<CompleteUploadSessionResponse>;
  getUploadSession(path: string, sessionId: string): Promise<UploadSessionStatusResponse>;
  abortUploadSession(
    path: string,
    sessionId: string,
  ): Promise<{
    error: StorageError | null;
  }>;
  uploadResumable(
    path: string,
    fileBody: File | Blob,
    options?: ResumableUploadOptions,
  ): Promise<CompleteUploadSessionResponse>;
}
export interface Storage {
  from(bucketName: string): StorageFileApi;
}
