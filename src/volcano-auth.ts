import {
  convertAnonymous as convertAnonymousAccount,
  getSession as getAccountSession,
  getUser as getAccountUser,
  onAuthStateChange as subscribeToAuthState,
  setSession as adoptAccountSession,
  signIn as signInAccount,
  signInAnonymously as signInAnonymousAccount,
  signUp as signUpAccount,
  signUpAnonymous as signUpAnonymousAccount,
  updateUser as updateAccountUser,
} from './auth-account.ts';
import { MutationBuilder } from './database-mutations.ts';
import { QueryBuilder as RuntimeQueryBuilder } from './database-query.ts';
import { DurableFacade } from './durable-facade.ts';
import { ProjectLocksApi } from './project-locks.ts';
import { SandboxesApi } from './sandboxes.ts';
import type {
  Auth,
  Durable,
  Functions,
  JsonValue,
  Logs,
  MutationBuilder as PublicMutationBuilder,
  ProjectLocks,
  QueryBuilder as PublicQueryBuilder,
  Sandboxes,
  Storage,
  StorageFileApi as PublicStorageFileApi,
  UserResponse,
  VolcanoAuthConfig,
} from './sdk-public-types.ts';
import { StorageFileApi as RuntimeStorageFileApi } from './storage-file.ts';
import { beginOAuthCallback, hasInitialSession, initializeCredentials } from './volcano-auth-bootstrap.ts';
import { GENERATED_TRANSPORT, type RuntimeTransport } from './volcano-auth-config.ts';
import { authApi, durableApi } from './volcano-auth-facades.ts';
import { VolcanoAuthServices } from './volcano-auth-services.ts';

/**
 * Volcano Auth SDK - Official JavaScript client for Volcano
 *
 * @example
 * ```javascript
 * import { VolcanoAuth } from '@volcano.dev/sdk';
 *
 * // Basic usage (uses https://api.volcano.dev by default)
 * const volcano = new VolcanoAuth({
 *   anonKey: 'your-anon-key'
 * });
 *
 * // Or with custom API URL
 * const volcano = new VolcanoAuth({
 *   apiUrl: 'https://api.yourapp.com',
 *   anonKey: 'your-anon-key'
 * });
 *
 * // Sign up
 * const { user, session } = await volcano.auth.signUp({
 *   email: 'user@example.com',
 *   password: 'password123'
 * });
 *
 * // Sign in
 * const { user, session } = await volcano.auth.signIn({
 *   email: 'user@example.com',
 *   password: 'password123'
 * });
 *
 * // Invoke function
 * const result = await volcano.functions.invoke('my-function', {
 *   action: 'getData'
 * });
 * ```
 */

class VolcanoAuth extends VolcanoAuthServices {
  auth: Auth;
  functions: Functions;
  durable: Durable;
  logs: Logs;
  storage: Storage;
  locks: ProjectLocks;
  sandboxes: Sandboxes;

  constructor(config: VolcanoAuthConfig);
  constructor(
    config: VolcanoAuthConfig & {
      timeout?: number;
      transportFactory?: (client: VolcanoAuth) => Partial<RuntimeTransport>;
    },
  ) {
    super(config);
    this._transport = { ...GENERATED_TRANSPORT, ...config.transportFactory?.(this) };
    this._durableFacade = new DurableFacade(this);
    this.accessToken = null;
    this.refreshToken = null;
    initializeCredentials(this, config);
    beginOAuthCallback(this, config);

    // Sub-objects for organization
    this.auth = authApi(this);

    this.functions = {
      invoke: this.invokeFunction.bind(this),
    };

    this.durable = durableApi(this);

    this.logs = {
      search: this.searchLogs.bind(this),
      activity: this.getLogActivity.bind(this),
    };

    this.storage = {
      from: this.storageBucket.bind(this),
    };

    this.locks = new ProjectLocksApi(this);
    this.sandboxes = new SandboxesApi(this);
  }

  /**
   * Select a storage bucket to perform operations on
   * @param {string} bucketName - The name of the bucket
   * @returns {StorageFileApi} - Storage file API for the bucket
   */
  /** @internal */
  storageBucket(bucketName: string): PublicStorageFileApi {
    return new RuntimeStorageFileApi(this, bucketName);
  }

  /** @internal */
  _generatedOptions(
    volcanoAuthorization: 'anon' | 'session',
    headers?: Record<string, string>,
    responseType?: 'blob',
    timeoutMs?: number,
  ): {
    volcanoAuthorization: 'anon' | 'session';
    volcanoClient: VolcanoAuth;
    headers?: Record<string, string>;
    volcanoResponseType?: 'blob';
    volcanoTimeoutMs?: number;
  } {
    return {
      volcanoAuthorization,
      volcanoClient: this,
      ...(headers === undefined ? {} : { headers }),
      ...(responseType === undefined ? {} : { volcanoResponseType: responseType }),
      ...(timeoutMs === undefined ? {} : { volcanoTimeoutMs: timeoutMs }),
    };
  }

  from<T = Record<string, JsonValue>>(table: string): PublicQueryBuilder<T>;
  from(table: string): RuntimeQueryBuilder | PublicQueryBuilder<unknown> {
    return new RuntimeQueryBuilder(this, table, this._currentDatabaseName);
  }

  database(databaseName: string): VolcanoAuth;
  database(databaseName: string): this {
    this._currentDatabaseName = databaseName;
    return this;
  }

  insert<T = Record<string, JsonValue>>(table: string, values: Record<string, JsonValue>): PublicMutationBuilder<T>;
  insert(table: string, values: Record<string, unknown>): MutationBuilder | PublicMutationBuilder<unknown> {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'insert', values);
  }

  update<T = Record<string, JsonValue>>(table: string, values: Record<string, JsonValue>): PublicMutationBuilder<T>;
  update(table: string, values: Record<string, unknown>): MutationBuilder | PublicMutationBuilder<unknown> {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'update', values);
  }

  delete<T = Record<string, JsonValue>>(table: string): PublicMutationBuilder<T>;
  delete(table: string): MutationBuilder | PublicMutationBuilder<unknown> {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'delete', null);
  }

  /** @internal */
  async signUp(options: Parameters<typeof signUpAccount>[1]): ReturnType<typeof signUpAccount> {
    return await signUpAccount(this, options);
  }

  /** @internal */
  async signIn(options: Parameters<typeof signInAccount>[1]): ReturnType<typeof signInAccount> {
    return await signInAccount(this, options);
  }

  /** @internal */
  getSession(): ReturnType<typeof getAccountSession> {
    return getAccountSession(this);
  }

  /** @internal */
  setSession(session: Parameters<typeof adoptAccountSession>[1]): ReturnType<typeof adoptAccountSession> {
    return adoptAccountSession(this, session);
  }

  /** @internal */
  async getUser(): ReturnType<typeof getAccountUser> {
    return await getAccountUser(this);
  }

  /** @internal */
  async updateUser(options: Parameters<typeof updateAccountUser>[1]): ReturnType<typeof updateAccountUser> {
    return await updateAccountUser(this, options);
  }

  /**
   * Register a callback for auth state changes.
   * @param {Function} callback - Called with user object (or null) on auth state change
   * @returns {Function} Unsubscribe function
   */
  /** @internal */
  onAuthStateChange(callback: Parameters<typeof subscribeToAuthState>[1]): ReturnType<typeof subscribeToAuthState> {
    return subscribeToAuthState(this, callback);
  }

  /** @internal */
  async signInAnonymously(metadata: Record<string, unknown> = {}): ReturnType<typeof signInAnonymousAccount> {
    return await signInAnonymousAccount(this, metadata);
  }

  /** @internal */
  async signUpAnonymous(metadata: Record<string, unknown> = {}): ReturnType<typeof signUpAnonymousAccount> {
    return await signUpAnonymousAccount(this, metadata);
  }

  /** @internal */
  async convertAnonymous(
    options: Parameters<typeof convertAnonymousAccount>[1],
  ): ReturnType<typeof convertAnonymousAccount> {
    return await convertAnonymousAccount(this, options);
  }

  async initialize(): Promise<UserResponse> {
    if (!hasInitialSession(this)) {
      return { user: null, error: null };
    }
    await this._completeOAuthExchange();
    if (this._oauthExchangeError !== null) {
      const error = this._oauthExchangeError;
      this._oauthExchangeError = null;
      return { user: null, error };
    }
    return await this.getUser();
  }
}

export { VolcanoAuth };
