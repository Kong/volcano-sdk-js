import { expect, test } from '@jest/globals';
import {
  isBlob,
  isCompletedUpload,
  isStorageObject,
  isStorageObjects,
  isUploadPart,
  isUploadSession,
  isUploadSessionStatus,
} from '../src/storage-shapes.ts';
import {
  completedUpload,
  storageObject,
  uploadPart,
  uploadSession,
  uploadStatus,
} from './storage-response-fixtures.ts';

test('storage object requires all core fields and preserves optional wire fields', () => {
  expect(isStorageObject(storageObject())).toBe(true);
  expect(
    isStorageObject(
      storageObject({
        owner_id: null,
        etag: 'etag',
        public_url: 'https://example.com/file.bin',
        created_at: '2026-09-23T00:00:00Z',
        updated_at: '2026-09-23T00:00:00Z',
        metadata: { labels: ['one', null, true, 12, { nested: 'value' }] },
      }),
    ),
  ).toBe(true);
  expect(isStorageObject(storageObject({ owner_id: 'user-1' }))).toBe(true);
  const metadata = { category: 'test' };
  Object.setPrototypeOf(metadata, null);
  expect(isStorageObject({ ...storageObject(), metadata })).toBe(true);
});

test.each([
  null,
  [],
  new Date(),
  { ...storageObject(), id: 12 },
  { ...storageObject(), bucket_id: null },
  { ...storageObject(), name: false },
  { ...storageObject(), mime_type: 12 },
  { ...storageObject(), size: 1.5 },
  { ...storageObject(), is_public: 'true' },
  { ...storageObject(), owner_id: 12 },
  { ...storageObject(), etag: 12 },
  { ...storageObject(), created_at: false },
  { ...storageObject(), updated_at: false },
  { ...storageObject(), public_url: 12 },
  { ...storageObject(), metadata: [] },
  { ...storageObject(), metadata: { bad: Number.NaN } },
  { ...storageObject(), metadata: { bad: () => 'value' } },
  { ...storageObject(), metadata: { bad: new Date() } },
  { ...storageObject(), metadata: { nested: ['valid', new Date()] } },
  { ...storageObject(), metadata: { nested: { valid: 'yes', bad: Number.NaN } } },
])('rejects malformed storage object: %p', (value) => {
  expect(isStorageObject(value)).toBe(false);
});

test('rejects a callable object with a record prototype and storage fields', () => {
  const value = Object.assign((entry: unknown) => entry, {
    id: 'obj-1',
    bucket_id: 'bucket-1',
    mime_type: 'application/octet-stream',
    size: 1,
    is_public: false,
  });
  Object.setPrototypeOf(value, Object.prototype);
  expect(isStorageObject(value)).toBe(false);
});

test('validates arrays of storage objects and binary responses', () => {
  expect(isStorageObjects([storageObject()])).toBe(true);
  expect(isStorageObjects([storageObject(), { name: 'incomplete' }])).toBe(false);
  expect(isStorageObjects({ objects: [] })).toBe(false);
  expect(isBlob(new Blob(['binary']))).toBe(true);
  expect(isBlob(new ArrayBuffer(4))).toBe(false);
});

test.each([
  [isUploadSession, uploadSession()],
  [isUploadPart, uploadPart()],
  [isCompletedUpload, completedUpload()],
  [isUploadSessionStatus, uploadStatus()],
] as const)('accepts a complete upload wire response', (guard, value) => {
  expect(guard(value)).toBe(true);
});

test.each([isUploadSession, isUploadPart, isCompletedUpload, isUploadSessionStatus])(
  'accepts an upload wire response with all optional fields omitted',
  (guard) => {
    expect(guard({})).toBe(true);
  },
);

test('accepts partial upload status and part objects', () => {
  expect(isUploadSessionStatus({ status: 'pending', parts: [{ etag: 'etag' }] })).toBe(true);
  expect(isUploadSessionStatus({ ...uploadStatus(), parts: [uploadPart(), {}] })).toBe(true);
});

test.each([
  [isUploadSession, { ...uploadSession(), session_id: null }],
  [isUploadSession, { ...uploadSession(), expires_at: null }],
  [isUploadSession, { ...uploadSession(), part_size: -1 }],
  [isUploadSession, { ...uploadSession(), total_parts: -1 }],
  [isUploadPart, { ...uploadPart(), etag: false }],
  [isUploadPart, { ...uploadPart(), part_number: -1 }],
  [isUploadPart, { ...uploadPart(), size: 1.5 }],
  [isCompletedUpload, { object: { name: 'incomplete' } }],
  [isUploadSessionStatus, { ...uploadStatus(), status: 'unknown' }],
  [isUploadSessionStatus, { ...uploadStatus(), total_size: -1 }],
  [isUploadSessionStatus, { ...uploadStatus(), part_size: -1 }],
  [isUploadSessionStatus, { ...uploadStatus(), total_parts: -1 }],
  [isUploadSessionStatus, { ...uploadStatus(), parts_uploaded: -1 }],
  [isUploadSessionStatus, { ...uploadStatus(), bytes_uploaded: -1 }],
  [isUploadSessionStatus, { ...uploadStatus(), session_id: null }],
  [isUploadSessionStatus, { ...uploadStatus(), path: null }],
  [isUploadSessionStatus, { ...uploadStatus(), content_type: null }],
  [isUploadSessionStatus, { ...uploadStatus(), expires_at: null }],
  [isUploadSessionStatus, { ...uploadStatus(), created_at: null }],
  [isUploadSessionStatus, { ...uploadStatus(), parts: 'invalid' }],
  [isUploadSessionStatus, { ...uploadStatus(), parts: [uploadPart(), { etag: false }] }],
] as const)('rejects a malformed upload wire response', (guard, value) => {
  expect(guard(value)).toBe(false);
});

test.each(['pending', 'uploading', 'completing', 'completed', 'aborted'] as const)(
  'accepts upload status %s',
  (status) => {
    expect(isUploadSessionStatus(uploadStatus({ status }))).toBe(true);
  },
);
