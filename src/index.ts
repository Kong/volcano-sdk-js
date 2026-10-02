import { QueryBuilder as RuntimeQueryBuilder } from './database-query.ts';
import type {
  JsonValue,
  QueryBuilder as PublicQueryBuilder,
  RealtimeModule,
  StorageFileApi as PublicStorageFileApi,
} from './sdk-public-types.ts';
import { StorageFileApi as RuntimeStorageFileApi } from './storage-file.ts';

export type * from './sdk-public-types.ts';

/** Lazy-load realtime without adding it to ordinary SDK initialization. */
export async function loadRealtime(): Promise<RealtimeModule> {
  const module = await import('./realtime.ts');
  return {
    VolcanoRealtime: module.VolcanoRealtime,
    RealtimeChannel: module.RealtimeChannel,
  };
}

export {
  VolcanoAuth as default,
  VolcanoAuth,
  VolcanoAuth as VolcanoClient,
} from './volcano-auth.ts';
export const QueryBuilder = RuntimeQueryBuilder;
export type QueryBuilder<T = Record<string, JsonValue>> = PublicQueryBuilder<T>;
export { isBrowser } from './next/request.ts';
export const StorageFileApi = RuntimeStorageFileApi;
export type StorageFileApi = PublicStorageFileApi;
export type { DatabaseConnectionStringOptions } from './database-connection-string.ts';
export { databaseConnectionString } from './database-connection-string.ts';
export {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from './errors.ts';
