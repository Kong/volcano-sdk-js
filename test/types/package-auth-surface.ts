import type {
  StorageFileApi as EsmStorageFileApi,
  VolcanoAuth as EsmVolcanoAuth,
} from '../../dist/index.esm.mjs';
import type { StorageFileApi, VolcanoAuth } from '../../dist/index.js';

declare const cjsClient: VolcanoAuth;
declare const esmClient: EsmVolcanoAuth;

export const cjsBucket: StorageFileApi = cjsClient.storage.from('assets');
export const esmBucket: EsmStorageFileApi = esmClient.storage.from('assets');

// Credential replacement must go through the session APIs.
// @ts-expect-error credentials are internal implementation state
cjsClient.accessToken = 'untracked';
// @ts-expect-error credentials are internal implementation state
cjsClient.refreshToken = 'untracked';
// @ts-expect-error credentials are internal implementation state
esmClient.accessToken = 'untracked';
// @ts-expect-error credentials are internal implementation state
esmClient.refreshToken = 'untracked';
