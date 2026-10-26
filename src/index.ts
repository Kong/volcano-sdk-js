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
  const realtime = await import('./realtime.ts');
  return {
    VolcanoRealtime: realtime.VolcanoRealtime,
    RealtimeChannel: realtime.RealtimeChannel,
  };
}

export { VolcanoAuth as default, VolcanoAuth, VolcanoAuth as VolcanoClient } from './volcano-auth.ts';
// oxlint-disable-next-line eslint/no-redeclare -- The published runtime value and public type share this name.
export const QueryBuilder = RuntimeQueryBuilder;
export type QueryBuilder<T = Record<string, JsonValue>> = PublicQueryBuilder<T>;
export { isBrowser } from './next/request.ts';
// oxlint-disable-next-line eslint/no-redeclare -- The published runtime value and public type share this name.
export const StorageFileApi = RuntimeStorageFileApi;
export type StorageFileApi = PublicStorageFileApi;
export type { DatabaseConnectionStringOptions } from './database-connection-string.ts';
export { databaseConnectionString } from './database-connection-string.ts';
export { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoSystemError } from './errors.ts';
