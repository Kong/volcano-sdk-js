import type {
  CompleteUploadSessionResponse,
  CreateUploadSessionResponse,
  StorageObject,
  UploadPartResponse,
  UploadSessionStatusResponse,
} from '../src/sdk-public-types.ts';

export function storageObject(overrides: Partial<StorageObject> = {}): StorageObject {
  return {
    id: 'object-1',
    bucket_id: 'bucket-1',
    name: 'file.bin',
    is_public: false,
    size: 4,
    mime_type: 'application/octet-stream',
    ...overrides,
  };
}

export function uploadSession(
  overrides: Partial<NonNullable<CreateUploadSessionResponse['data']>> = {},
): NonNullable<CreateUploadSessionResponse['data']> {
  return {
    session_id: 'session-1',
    part_size: 1024,
    total_parts: 2,
    expires_at: '2026-09-24T00:00:00Z',
    ...overrides,
  };
}

export function uploadPart(
  overrides: Partial<NonNullable<UploadPartResponse['data']>> = {},
): NonNullable<UploadPartResponse['data']> {
  return { part_number: 1, etag: 'etag-1', size: 1024, ...overrides };
}

export function completedUpload(
  overrides: Partial<StorageObject> = {},
): NonNullable<CompleteUploadSessionResponse['data']> {
  return { object: storageObject(overrides) };
}

export function uploadStatus(
  overrides: Partial<NonNullable<UploadSessionStatusResponse['data']>> = {},
): NonNullable<UploadSessionStatusResponse['data']> {
  return {
    session_id: 'session-1',
    path: 'file.bin',
    status: 'uploading',
    content_type: 'application/octet-stream',
    total_size: 2048,
    part_size: 1024,
    total_parts: 2,
    parts_uploaded: 1,
    bytes_uploaded: 1024,
    parts: [uploadPart()],
    expires_at: '2026-09-24T00:00:00Z',
    created_at: '2026-09-23T00:00:00Z',
    ...overrides,
  };
}
