import type {
  CompleteUploadSessionResponse,
  CreateUploadSessionResponse,
  JsonValue,
  StorageObject,
  UploadPartResponse,
  UploadSessionStatusResponse,
} from './sdk-public-types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === null || Object.getPrototypeOf(prototype) === null;
}

function isInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function hasStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => typeof value[field] === 'string');
}

function hasIntegerFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
  return fields.every((field) => isInteger(value[field]));
}

function hasOptionalStringFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return fields.every((field) => !Object.hasOwn(value, field) || typeof value[field] === 'string');
}

function isJsonScalar(value: unknown): value is string | number | boolean | null {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return true;
  }
  return Number.isFinite(value);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (isJsonScalar(value)) {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function hasOptionalMetadata(value: Record<string, unknown>): boolean {
  return (
    !Object.hasOwn(value, 'metadata') ||
    (isRecord(value['metadata']) && isJsonValue(value['metadata']))
  );
}

function hasOptionalOwner(value: Record<string, unknown>): boolean {
  return (
    !Object.hasOwn(value, 'owner_id') ||
    value['owner_id'] === null ||
    typeof value['owner_id'] === 'string'
  );
}

function hasStorageObjectCore(value: Record<string, unknown>): boolean {
  return (
    hasStringFields(value, ['id', 'bucket_id', 'name', 'mime_type']) &&
    hasIntegerFields(value, ['size']) &&
    typeof value['is_public'] === 'boolean'
  );
}

function hasStorageObjectOptionals(value: Record<string, unknown>): boolean {
  return (
    hasOptionalOwner(value) &&
    hasOptionalStringFields(value, ['etag', 'created_at', 'updated_at', 'public_url']) &&
    hasOptionalMetadata(value)
  );
}

export function isStorageObject(value: unknown): value is StorageObject {
  return isRecord(value) && hasStorageObjectCore(value) && hasStorageObjectOptionals(value);
}

export function isStorageObjects(value: unknown): value is StorageObject[] {
  return Array.isArray(value) && value.every(isStorageObject);
}

export function isBlob(value: unknown): value is Blob {
  return value instanceof Blob;
}

export function isUploadSession(
  value: unknown,
): value is NonNullable<CreateUploadSessionResponse['data']> {
  return (
    isRecord(value) &&
    hasStringFields(value, ['session_id', 'expires_at']) &&
    hasIntegerFields(value, ['part_size', 'total_parts'])
  );
}

export function isUploadPart(value: unknown): value is NonNullable<UploadPartResponse['data']> {
  return (
    isRecord(value) &&
    hasStringFields(value, ['etag']) &&
    hasIntegerFields(value, ['part_number', 'size'])
  );
}

export function isCompletedUpload(
  value: unknown,
): value is NonNullable<CompleteUploadSessionResponse['data']> {
  return isRecord(value) && isStorageObject(value['object']);
}

function isUploadStatus(
  value: unknown,
): value is NonNullable<UploadSessionStatusResponse['data']>['status'] {
  return (
    value === 'pending' ||
    value === 'uploading' ||
    value === 'completing' ||
    value === 'completed' ||
    value === 'aborted'
  );
}

function hasUploadStatusCore(value: Record<string, unknown>): boolean {
  return (
    hasStringFields(value, ['session_id', 'path', 'content_type', 'expires_at', 'created_at']) &&
    hasIntegerFields(value, [
      'total_size',
      'part_size',
      'total_parts',
      'parts_uploaded',
      'bytes_uploaded',
    ]) &&
    isUploadStatus(value['status'])
  );
}

export function isUploadSessionStatus(
  value: unknown,
): value is NonNullable<UploadSessionStatusResponse['data']> {
  return (
    isRecord(value) &&
    hasUploadStatusCore(value) &&
    Array.isArray(value['parts']) &&
    value['parts'].every(isUploadPart)
  );
}
