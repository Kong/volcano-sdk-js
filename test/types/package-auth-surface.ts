import {
  type StorageFileApi as EsmStorageFileApi,
  VolcanoAuth as EsmVolcanoAuthConstructor,
} from '../../dist/index.esm.mjs';
import { type StorageFileApi, VolcanoAuth as CjsVolcanoAuth } from '../../dist/index.js';

type VolcanoAuth = InstanceType<typeof CjsVolcanoAuth>;
type EsmVolcanoAuth = InstanceType<typeof EsmVolcanoAuthConstructor>;
type PublishedMember =
  | 'auth'
  | 'functions'
  | 'durable'
  | 'logs'
  | 'storage'
  | 'locks'
  | 'database'
  | 'from'
  | 'insert'
  | 'update'
  | 'delete'
  | 'initialize';
type SameMembers<Client> = [
  Exclude<keyof Client, PublishedMember>,
  Exclude<PublishedMember, keyof Client>,
] extends [never, never]
  ? true
  : false;
type RequireTrue<Value extends true> = Value;

export type CjsPublishedSurface = RequireTrue<SameMembers<VolcanoAuth>>;
export type EsmPublishedSurface = RequireTrue<SameMembers<EsmVolcanoAuth>>;

declare const cjsClient: VolcanoAuth;
declare const esmClient: EsmVolcanoAuth;

export const cjsBucket: StorageFileApi = cjsClient.storage.from('assets');
export const esmBucket: EsmStorageFileApi = esmClient.storage.from('assets');
export const cjsConstructed: VolcanoAuth = new CjsVolcanoAuth({ anonKey: 'project.key' });
export const esmConstructed: EsmVolcanoAuth = new EsmVolcanoAuthConstructor({
  anonKey: 'project.key',
});
export const cjsDatabase = cjsClient.database('default').from('items');
export const esmInitialization = esmClient.initialize();

// Credential replacement must go through the session APIs.
// @ts-expect-error credentials are internal implementation state
cjsClient.accessToken = 'untracked';
// @ts-expect-error credentials are internal implementation state
cjsClient.refreshToken = 'untracked';
// @ts-expect-error credentials are internal implementation state
esmClient.accessToken = 'untracked';
// @ts-expect-error credentials are internal implementation state
esmClient.refreshToken = 'untracked';
export const cjsInvalidConfig = {
  anonKey: 'project.key',
  // @ts-expect-error the transport factory is a test seam, not public configuration
  transportFactory: () => ({}),
} satisfies ConstructorParameters<typeof CjsVolcanoAuth>[0];
export const esmInvalidConfig = {
  anonKey: 'project.key',
  // @ts-expect-error the transport factory is a test seam, not public configuration
  transportFactory: () => ({}),
} satisfies ConstructorParameters<typeof EsmVolcanoAuthConstructor>[0];
// @ts-expect-error session generation is internal implementation state
export type CjsInternalGeneration = typeof cjsClient._sessionGeneration;
// @ts-expect-error transport replacement is internal implementation state
export type EsmInternalTransport = typeof esmClient._transport;
// @ts-expect-error public auth operations are exposed through the auth facade
export type CjsDirectSignIn = typeof cjsClient.signIn;
// @ts-expect-error public auth operations are exposed through the auth facade
export type EsmDirectSignIn = typeof esmClient.signIn;
