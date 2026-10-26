import type {
  CreateUploadSessionResponse,
  OpenAPIComponents,
  StorageFileApi,
  UploadSessionStatusResponse,
} from '../../src/index.ts';
import type { Exact as Equal } from '../fixtures/public-api-compatibility.d.ts';

type Assert<T extends true> = T;

type StorageBucket = OpenAPIComponents['schemas']['StorageBucket'];
type StorageObject = OpenAPIComponents['schemas']['StorageObject'];
type _StorageLimitsCanBeNull = Assert<null extends StorageBucket['file_size_limit'] ? true : false>;
type _StorageMimeTypesCanBeNull = Assert<null extends StorageBucket['allowed_mime_types'] ? true : false>;
type _StorageOwnerCanBeNull = Assert<null extends StorageObject['owner_id'] ? true : false>;

type UploadSessionCreated = NonNullable<CreateUploadSessionResponse['data']>;
interface UploadSessionCreatedShape {
  session_id: string;
  part_size: number;
  total_parts: number;
  expires_at: string;
}
type _UploadSessionCreatedMatchesHosting = Assert<Equal<UploadSessionCreated, UploadSessionCreatedShape>>;
type _UploadSessionCreatedKeysMatchOpenAPI = Assert<
  Equal<keyof UploadSessionCreated, keyof OpenAPIComponents['schemas']['CreateUploadSessionResponse']>
>;

type UploadSessionStatus = NonNullable<UploadSessionStatusResponse['data']>;
interface UploadSessionStatusShape {
  session_id: string;
  status: 'pending' | 'uploading' | 'completing' | 'completed' | 'aborted';
  path: string;
  content_type: string;
  total_size: number;
  part_size: number;
  total_parts: number;
  parts_uploaded: number;
  bytes_uploaded: number;
  parts: { part_number: number; etag: string; size: number }[];
  expires_at: string;
  created_at: string;
}
type _UploadSessionStatusMatchesHosting = Assert<Equal<UploadSessionStatus, UploadSessionStatusShape>>;

export type OpenApiStorageContractChecks = [
  _StorageLimitsCanBeNull,
  _StorageMimeTypesCanBeNull,
  _StorageOwnerCanBeNull,
  _UploadSessionCreatedMatchesHosting,
  _UploadSessionCreatedKeysMatchOpenAPI,
  _UploadSessionStatusMatchesHosting,
];

declare const bucket: StorageFileApi;
async function uploadResponseEnvelopes(): Promise<unknown> {
  const completed = await bucket.completeUploadSession('file.bin', 'session');
  const resumed = await bucket.uploadResumable('file.bin', new Blob(['bytes']));
  const uploaded = await bucket.upload('file.bin', new Blob(['bytes']));
  const names: (string | undefined)[] = [completed.data?.object.name, resumed.data?.object.name, uploaded.data?.name];
  return names;
}

async function rejectFlattenedUploadResponses(): Promise<unknown> {
  const completed = await bucket.completeUploadSession('file.bin', 'session');
  const resumed = await bucket.uploadResumable('file.bin', new Blob(['bytes']));
  // @ts-expect-error Completion returns an object envelope, not flattened metadata.
  const completedName: unknown = completed.data?.name;
  // @ts-expect-error Resumable upload preserves the completion envelope.
  const resumedName: unknown = resumed.data?.name;
  return [completedName, resumedName];
}

async function storageErrorMetadata(): Promise<unknown> {
  const results = [
    await bucket.upload('file.bin', new Blob(['bytes'])),
    await bucket.download('file.bin'),
    await bucket.list(),
    await bucket.remove(['file.bin']),
    await bucket.move('file.bin', 'moved.bin'),
    await bucket.copy('file.bin', 'copy.bin'),
    await bucket.updateVisibility('file.bin', false),
    await bucket.createUploadSession('file.bin', { totalSize: 5 }),
    await bucket.uploadPart('file.bin', 'session', 1, new Blob(['bytes'])),
    await bucket.getUploadSession('file.bin', 'session'),
    await bucket.completeUploadSession('file.bin', 'session'),
    await bucket.abortUploadSession('file.bin', 'session'),
    await bucket.uploadResumable('file.bin', new Blob(['bytes'])),
  ];
  return results.map(({ error }) => {
    const status: number | undefined = error?.status;
    const code: string | undefined = error?.code;
    const retryAfter: number | undefined = error?.retryAfter;
    return [status, code, retryAfter];
  });
}

async function removalFailureMetadata(): Promise<unknown> {
  const removed = await bucket.remove(['one.bin', 'two.bin']);
  return (removed.error?.failures ?? []).map((failure) => {
    const path: string = failure.path;
    const status: number | undefined = failure.error.status;
    return [path, status];
  });
}

export const storageContractOperations = {
  uploadResponseEnvelopes,
  rejectFlattenedUploadResponses,
  storageErrorMetadata,
  removalFailureMetadata,
};
