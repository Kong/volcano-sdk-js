import type { Auth, JsonValue, UserResponse, VolcanoAuthConfig } from './auth';
import type { MutationBuilder, QueryBuilder } from './database';
import type { Durable, Functions } from './durable';
import type { ProjectLocks } from './locks';
import type { Logs } from './logs';
import type { Sandboxes } from './sandboxes';
import type { Storage } from './storage';
export type {
  components as OpenAPIComponents,
  operations as OpenAPIOperations,
  paths as OpenAPIPaths,
} from '../../../dist/generated/openapi';
export { AuthRefreshDiscardedError, AuthSessionChangedError, VolcanoSystemError } from '../../../dist/errors';
export class VolcanoAuth {
  constructor(config: VolcanoAuthConfig);
  auth: Auth;
  functions: Functions;
  durable: Durable;
  logs: Logs;
  storage: Storage;
  locks: ProjectLocks;
  sandboxes: Sandboxes;
  database(databaseName: string): VolcanoAuth;
  from<T = Record<string, JsonValue>>(table: string): QueryBuilder<T>;
  insert<T = Record<string, JsonValue>>(table: string, values: Record<string, JsonValue>): MutationBuilder<T>;
  update<T = Record<string, JsonValue>>(table: string, values: Record<string, JsonValue>): MutationBuilder<T>;
  delete<T = Record<string, JsonValue>>(table: string): MutationBuilder<T>;
  initialize(): Promise<UserResponse>;
}
export { VolcanoAuth as VolcanoClient };
export default VolcanoAuth;
export function isBrowser(): boolean;
export interface RealtimeModule {
  VolcanoRealtime: typeof import('../../../dist/realtime').VolcanoRealtime;
  RealtimeChannel: typeof import('../../../dist/realtime').RealtimeChannel;
}
export function loadRealtime(): Promise<RealtimeModule>;
export {
  databaseConnectionString,
  type DatabaseConnectionStringOptions,
} from '../../../dist/database-connection-string';
