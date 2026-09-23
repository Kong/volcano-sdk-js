import {
  cancelEmailChange as cancelAccountEmailChange,
  confirmEmail as confirmAccountEmail,
  confirmEmailChange as confirmAccountEmailChange,
  convertAnonymous as convertAnonymousAccount,
  forgotPassword as forgotAccountPassword,
  getSession as getAccountSession,
  getUser as getAccountUser,
  onAuthStateChange as subscribeToAuthState,
  requestEmailChange as requestAccountEmailChange,
  resendConfirmation as resendAccountConfirmation,
  resetPassword as resetAccountPassword,
  resetPasswordForEmail as resetAccountPasswordForEmail,
  setSession as adoptAccountSession,
  signIn as signInAccount,
  signInAnonymously as signInAnonymousAccount,
  signUp as signUpAccount,
  signUpAnonymous as signUpAnonymousAccount,
  updateUser as updateAccountUser,
} from './auth-account.ts';
import {
  generateAuthStateNonce,
  getStorageItem,
  hasOAuthCallbackInUrl,
  hasSessionInUrl,
  peekAuthRedirectUrl,
  peekAuthState,
  removeOAuthResponseParams,
  removeStorageItem,
  setStorageItem,
  storeAuthState,
  stripAuthHashFromUrl,
  stripOAuthQueryFromUrl,
  takeAuthRedirectUrl,
  takeAuthState,
} from './auth-browser.ts';
import { fetchWithAuthRetry } from './auth-fetch-retry.ts';
import { anonFetch, authFetchUrl, authFetchWithContext } from './auth-http.ts';
import {
  getHostedAuthUrl as createHostedAuthUrl,
  resolveOAuthRedirectTarget,
  resolveProjectIdForHostedAuth,
  signInWithHostedAuth as beginHostedAuth,
  signInWithOAuth as beginOAuth,
  signInWithProvider,
} from './auth-oauth-url.ts';
import {
  callOAuthAPI as callProviderAPI,
  getLinkedOAuthProviders as getAccountLinkedProviders,
  getOAuthProviderToken as getAccountProviderToken,
  linkOAuthProvider as linkAccountProvider,
  refreshOAuthToken as refreshAccountProviderToken,
  unlinkOAuthProvider as unlinkAccountProvider,
} from './auth-provider.ts';
import {
  completeOAuthExchange,
  consumeOAuthCodeFromUrl,
  consumeSessionFromUrl,
  replaceSessionFromUrl,
} from './auth-redirect.ts';
import { AuthSessionOperations } from './auth-session.ts';
import {
  type AuthContext,
  fetchSessionRefresh,
  performSessionRefresh,
  type RefreshResult,
  refreshSession,
  refreshSessionForContext,
  revokeAccessSession,
  signOut,
  signOutCaptured,
  type SignOutResult,
} from './auth-session-lifecycle.ts';
import {
  adoptSessionInMemory,
  captureAuthContext,
  clearSession,
  clearSessionAtGeneration,
  isAuthContextCurrent,
  notifyAuthCallbacks,
  setRefreshedSession,
  setSession,
} from './auth-session-state.ts';
import {
  deleteAllOtherSessions as deleteAccountOtherSessions,
  deleteSession as deleteAccountSession,
  getSessions as getAccountSessions,
} from './auth-user-sessions.ts';
import { MutationBuilder } from './database-mutations.ts';
import { QueryBuilder, queryDatabaseSelectTransport } from './database-query.ts';
import { DurableFacade } from './durable-facade.ts';
import { AuthRefreshDiscardedError, AuthSessionChangedError } from './errors.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';
import { invokeFunction as invokeFunctionWithClient } from './function-invoke.ts';
import {
  isResolutionOutcome,
  type ResolutionOutcome,
  resolveFunctionByHttp,
} from './function-resolution.ts';
import {
  cachedFunctionResolution,
  clearFunctionResolveCache,
  clearSharedFunctionResolveStateForTests,
  functionResolveCacheKey,
  type FunctionResolveState,
  getSharedFunctionResolveState,
  pruneFunctionResolveCache,
} from './function-resolve-cache.ts';
import { functionInvokeUrl, sanitizeFunctionIdentifierForHost } from './function-url.ts';
import {
  acquireProjectLock,
  authSignin,
  downloadStorageObject,
  getDurableExecution,
  listDurableExecutions,
  releaseProjectLock,
  startDurableExecutionFromApplication,
  stopDurableExecution,
  uploadStorageObject,
} from './generated/client.ts';
import { isBrowser } from './next/request.ts';
import { ProjectLocksApi } from './project-locks.ts';
import { logActivityResult, logSearchResult } from './project-logs.ts';
import type {
  Auth,
  Durable,
  Functions,
  Logs,
  ProjectLocks,
  Storage,
  VolcanoAuthConfig,
} from './sdk-public-types.ts';
import { StorageFileApi } from './storage-file.ts';

export type * from './sdk-public-types.ts';

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

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_API_URL = 'https://api.volcano.dev';
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds
const STORAGE_KEY_ACCESS_TOKEN = 'volcano_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'volcano_refresh_token';
// The idempotency header's documented limit. Checked here so a name that is too
// long fails before the start is sent, rather than coming back as a 400 the
// caller has to read.
const GENERATED_TRANSPORT = {
  acquireProjectLock,
  authSignin,
  downloadStorageObject,
  getDurableExecution,
  listDurableExecutions,
  queryDatabaseSelect: queryDatabaseSelectTransport,
  releaseProjectLock,
  startDurableExecutionFromApplication,
  stopDurableExecution,
  uploadStorageObject,
};

function requireAnonKey(anonKey: unknown): asserts anonKey is string {
  if (typeof anonKey !== 'string' || anonKey === '') {
    throw new Error('anonKey is required. Get your anon key from project settings.');
  }
  if (anonKey.startsWith('sk-') && isBrowser()) {
    throw new Error(
      '[VOLCANO SECURITY ERROR] Service keys (sk-*) cannot be used in client-side code. ' +
        'Service keys bypass Row Level Security and expose your database to unauthorized access. ' +
        'Use an anon key (ak-*) for browser/client-side applications. ' +
        'Service keys should only be used in secure server-side environments. ' +
        'See: https://docs.volcano.hosting/security/keys',
    );
  }
}

function configApiUrl(config: VolcanoAuthConfig): string {
  const url = config.apiUrl === '' ? DEFAULT_API_URL : (config.apiUrl ?? DEFAULT_API_URL);
  return url.replace(/\/$/, '');
}

function configTimeout(value: number | undefined): number {
  return typeof value === 'number' && value !== 0 && !Number.isNaN(value)
    ? value
    : DEFAULT_TIMEOUT_MS;
}

// ============================================================================
// VolcanoAuth Class
// ============================================================================

class VolcanoAuth {
  readonly apiUrl: string;
  readonly anonKey: string;
  readonly timeout: number;
  _currentDatabaseName: string | null;
  currentUser: unknown;
  _sessionGeneration: number;
  _urlSessionConsumed: boolean;
  _pendingUrlAuthNotify: boolean;
  _oauthExchangePromise: Promise<boolean> | null;
  _sessionOperations: AuthSessionOperations<RefreshResult, SignOutResult>;
  _oauthExchangeError: Error | null;
  _authCallbacks: ((user: unknown) => void)[];
  _functionResolveState: FunctionResolveState;
  _transport: typeof GENERATED_TRANSPORT;
  _durableFacade: DurableFacade;
  accessToken: string | null;
  refreshToken: string | null;
  auth: Auth;
  functions: Functions;
  durable: Durable;
  logs: Logs;
  storage: Storage;
  locks: ProjectLocks;

  constructor(
    config: VolcanoAuthConfig & {
      timeout?: number;
      transportFactory?: (client: VolcanoAuth) => typeof GENERATED_TRANSPORT;
    },
  ) {
    requireAnonKey(config.anonKey);
    this.apiUrl = configApiUrl(config);
    this.anonKey = config.anonKey;
    this.timeout = configTimeout(config.timeout);
    this._currentDatabaseName = null;
    this.currentUser = null;
    this._sessionGeneration = 0;
    // Tracks whether a managed-redirect session was already adopted from the URL
    // fragment so repeated getUser()/initialize() calls don't re-adopt and
    // re-fire auth callbacks when the hash can't be stripped (see
    // _consumeSessionFromUrl / _stripAuthHashFromUrl).
    this._urlSessionConsumed = false;
    // A redirect session adopted in the constructor (the common SPA path) can't
    // fire onAuthStateChange yet — no listeners are registered and currentUser
    // is still null. Remember the adoption so the first getUser()/initialize()
    // that resolves a user announces the SIGNED_IN transition exactly once.
    this._pendingUrlAuthNotify = false;
    this._oauthExchangePromise = null;
    this._sessionOperations = new AuthSessionOperations();
    // Keep a terminal callback error until initialize()/refreshSession() consumes
    // it or a new session is set or cleared.
    this._oauthExchangeError = null;
    this._authCallbacks = [];
    this._functionResolveState = getSharedFunctionResolveState();
    this._transport = (config.transportFactory ?? (() => GENERATED_TRANSPORT))(this);
    this._durableFacade = new DurableFacade(this);
    this.accessToken = null;
    this.refreshToken = null;
    this._initializeCredentials(config);
    this._beginOAuthCallback(config);

    // Sub-objects for organization
    this.auth = {
      signUp: this.signUp.bind(this),
      signIn: this.signIn.bind(this),
      getSession: this.getSession.bind(this),
      setSession: this.setSession.bind(this),
      signOut: this.signOut.bind(this),
      getUser: this.getUser.bind(this),
      updateUser: this.updateUser.bind(this),
      refreshSession: this.refreshSession.bind(this),
      onAuthStateChange: this.onAuthStateChange.bind(this),
      user: () => this.currentUser,
      // Anonymous user methods
      signInAnonymously: this.signInAnonymously.bind(this),
      signUpAnonymous: this.signUpAnonymous.bind(this),
      convertAnonymous: this.convertAnonymous.bind(this),
      // Email confirmation methods
      confirmEmail: this.confirmEmail.bind(this),
      resendConfirmation: this.resendConfirmation.bind(this),
      // Password recovery methods
      resetPasswordForEmail: this.resetPasswordForEmail.bind(this),
      forgotPassword: this.forgotPassword.bind(this),
      resetPassword: this.resetPassword.bind(this),
      // Email change methods
      requestEmailChange: this.requestEmailChange.bind(this),
      confirmEmailChange: this.confirmEmailChange.bind(this),
      cancelEmailChange: this.cancelEmailChange.bind(this),
      // Managed hosted auth pages
      getHostedAuthUrl: this.getHostedAuthUrl.bind(this),
      signInWithHostedAuth: this.signInWithHostedAuth.bind(this),
      // OAuth methods
      signInWithOAuth: this.signInWithOAuth.bind(this),
      signInWithGoogle: this.signInWithGoogle.bind(this),
      signInWithGitHub: this.signInWithGitHub.bind(this),
      signInWithMicrosoft: this.signInWithMicrosoft.bind(this),
      signInWithApple: this.signInWithApple.bind(this),
      linkOAuthProvider: this.linkOAuthProvider.bind(this),
      unlinkOAuthProvider: this.unlinkOAuthProvider.bind(this),
      getLinkedOAuthProviders: this.getLinkedOAuthProviders.bind(this),
      refreshOAuthToken: this.refreshOAuthToken.bind(this),
      getOAuthProviderToken: this.getOAuthProviderToken.bind(this),
      callOAuthAPI: this.callOAuthAPI.bind(this),
      // Session management methods
      getSessions: this.getSessions.bind(this),
      deleteSession: this.deleteSession.bind(this),
      deleteAllOtherSessions: this.deleteAllOtherSessions.bind(this),
    };

    this.functions = {
      invoke: this.invokeFunction.bind(this),
    };

    this.durable = {
      start: this.startDurableExecution.bind(this),
      get: this.getDurableExecution.bind(this),
      list: this.listDurableExecutions.bind(this),
      stop: this.stopDurableExecution.bind(this),
    };

    this.logs = {
      search: this.searchLogs.bind(this),
      activity: this.getLogActivity.bind(this),
    };

    this.storage = {
      from: this.storageBucket.bind(this),
    };

    this.locks = new ProjectLocksApi(this);
  }

  private _initializeCredentials(config: VolcanoAuthConfig): void {
    if (typeof config.accessToken === 'string' && config.accessToken !== '') {
      this.accessToken = config.accessToken;
      this.refreshToken = config.refreshToken === '' ? null : (config.refreshToken ?? null);
      return;
    }
    this.accessToken = this._getStorageItem(STORAGE_KEY_ACCESS_TOKEN);
    this.refreshToken = this._getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
    this._pendingUrlAuthNotify = this._consumeSessionFromUrl();
  }

  private _beginOAuthCallback(config: VolcanoAuthConfig): void {
    if (typeof config.accessToken === 'string' && config.accessToken !== '') {
      return;
    }
    if (!this._hasOAuthCallbackInUrl()) {
      return;
    }
    this._oauthExchangePromise = this._consumeOAuthCodeFromUrl();
    // Completion owns errors and clears the pending promise even before another auth call.
    void this._completeOAuthExchange();
  }

  // ========================================================================
  // Logs Methods
  // ========================================================================

  async _postProjectLogRequest(
    projectId: string,
    endpoint: string,
    request: unknown,
  ): Promise<{ data: unknown; error: Error | null }> {
    if (typeof projectId !== 'string' || projectId.trim() === '') {
      return { data: null, error: new Error('projectId must be a non-empty string') };
    }

    const result = await this._authFetch(
      `/projects/${encodeURIComponent(projectId)}/logs/${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify(Boolean(request) ? request : {}),
      },
    );

    if (result.ok !== true) {
      return { data: null, error: result.error };
    }

    return { data: result.data, error: null };
  }

  async searchLogs(
    projectId: string,
    request: import('./sdk-public-types.ts').LogSearchRequest,
  ): Promise<import('./sdk-public-types.ts').LogsResponse<import('./sdk-public-types.ts').LogSearchResponse>> {
    const result = await this._postProjectLogRequest(projectId, 'search', request);
    return result.error === null ? logSearchResult(result.data) : { data: null, error: result.error };
  }

  async getLogActivity(
    projectId: string,
    request: import('./sdk-public-types.ts').LogActivityRequest,
  ): Promise<import('./sdk-public-types.ts').LogsResponse<import('./sdk-public-types.ts').LogActivityResponse>> {
    const result = await this._postProjectLogRequest(projectId, 'activity', request);
    return result.error === null
      ? logActivityResult(result.data)
      : { data: null, error: result.error };
  }

  // ========================================================================
  // Storage Methods
  // ========================================================================

  /**
   * Select a storage bucket to perform operations on
   * @param {string} bucketName - The name of the bucket
   * @returns {StorageFileApi} - Storage file API for the bucket
   */
  storageBucket(bucketName: string): StorageFileApi {
    return new StorageFileApi(this, bucketName);
  }

  // ========================================================================
  // Internal Fetch Helpers
  // ========================================================================

  /**
   * Make an authenticated request with access token
   * @private
   */
  async _authFetch(
    path: string | (() => string),
    options: RequestInit | (() => RequestInit) = {},
  ): Promise<Awaited<ReturnType<typeof authFetchWithContext>>['result']> {
    const { result } = await this._authFetchWithContext(path, options);
    return result;
  }

  async _authFetchWithContext(
    path: string | (() => string),
    options: RequestInit | (() => RequestInit) = {},
  ): ReturnType<typeof authFetchWithContext> {
    return authFetchWithContext(this, path, options);
  }

  async _authFetchUrl(
    url: string,
    fetchOptions: RequestInit = {},
  ): ReturnType<typeof authFetchUrl> {
    return authFetchUrl(this, url, fetchOptions);
  }

  _generatedOptions(
    volcanoAuthorization: 'anon' | 'session',
    headers?: Record<string, string>,
    responseType?: 'blob',
  ): {
    volcanoAuthorization: 'anon' | 'session';
    volcanoClient: VolcanoAuth;
    headers?: Record<string, string>;
    volcanoResponseType?: 'blob';
  } {
    return {
      volcanoAuthorization,
      volcanoClient: this,
      ...(headers === undefined ? {} : { headers }),
      ...(responseType === undefined ? {} : { volcanoResponseType: responseType }),
    };
  }

  async _generatedFetch(
    path: string,
    options: RequestInit,
    authorization: 'anon' | 'session',
  ): Promise<Response> {
    const url = `${this.apiUrl}${path}`;
    if (authorization === 'anon') {
      const headers = new Headers(options.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${this.anonKey}`);
      }
      return fetchWithTimeout(
        url,
        {
          ...options,
          headers,
        },
        this.timeout,
      );
    }

    return fetchWithAuthRetry(this, url, options);
  }

  _getFunctionInvokeUrl(
    functionIdentifier: unknown,
    resolvedInvokeUrl: unknown,
  ): ReturnType<typeof functionInvokeUrl> {
    return functionInvokeUrl(this.apiUrl, functionIdentifier, resolvedInvokeUrl);
  }

  _functionResolveCacheKey(
    functionName: string,
    token: string,
    useAnonKey: boolean,
  ): ReturnType<typeof functionResolveCacheKey> {
    return functionResolveCacheKey(this.apiUrl, functionName, token, useAnonKey);
  }

  _clearFunctionResolveCache(functionName: string, token: string, useAnonKey: boolean): void {
    const cacheKey = this._functionResolveCacheKey(functionName, token, useAnonKey);
    clearFunctionResolveCache(this._functionResolveState, cacheKey);
  }

  async _resolveFunctionIdByName(
    functionName: string,
    options: {
      authContext: AuthContext;
      token: string | null;
      useAnonKey: boolean;
      allowRefresh?: boolean;
    },
  ): Promise<{ functionId: string | null; invokeUrl: unknown; token: string | null }> {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionName);
    if (hostLabel === null) {
      throw new Error(
        'functionName must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }
    const { authContext, token, useAnonKey } = options;
    this._assertCurrentAuthContext(authContext);
    if (token === null) {
      throw new Error('No credential available to resolve function');
    }
    const cacheKey = this._functionResolveCacheKey(hostLabel, token, useAnonKey);
    const cached = this._readFunctionResolveCache(cacheKey, token);
    if (cached !== null) {
      return cached;
    }
    return await this._resolveUncachedFunction(hostLabel, functionName, cacheKey, token, options);
  }

  private _assertCurrentAuthContext(authContext: AuthContext): void {
    if (!this._isAuthContextCurrent(authContext)) {
      throw new AuthSessionChangedError();
    }
  }

  private _readFunctionResolveCache(
    cacheKey: string,
    token: string,
  ): { functionId: string | null; invokeUrl: unknown; token: string } | null {
    const now = Date.now();
    pruneFunctionResolveCache(this._functionResolveState, now);
    const rawCached = this._functionResolveState.cache.get(cacheKey);
    const cached = cachedFunctionResolution(rawCached);
    if (cached !== null && cached.expiresAt > now) {
      if (cached.error !== null) {
        throw Object.assign(new Error(cached.error), { status: 404 }, cached.errorMetadata);
      }
      return { functionId: cached.functionId, invokeUrl: cached.invokeUrl, token };
    }
    if (rawCached !== undefined) {
      this._functionResolveState.cache.delete(cacheKey);
    }
    return null;
  }

  private async _resolveUncachedFunction(
    hostLabel: string,
    functionName: string,
    cacheKey: string,
    token: string,
    options: {
      authContext: AuthContext;
      useAnonKey: boolean;
      allowRefresh?: boolean;
    },
  ): Promise<{ functionId: string | null; invokeUrl: unknown; token: string | null }> {
    let pending = this._functionResolveState.inFlight.get(cacheKey);
    const ownsPending = pending === undefined;
    if (pending === undefined) {
      // Share only the credentialed HTTP result. Session validation and 401
      // refresh belong to each caller, not the shared request.
      pending = resolveFunctionByHttp(this, hostLabel, token, cacheKey);
      this._functionResolveState.inFlight.set(cacheKey, pending);
    }
    try {
      const outcome = await this._awaitFunctionResolution(pending, options.authContext);
      if (outcome.error !== null) {
        return await this._handleFunctionResolutionError(outcome, functionName, options);
      }
      return { functionId: outcome.functionId, invokeUrl: outcome.invokeUrl, token };
    } finally {
      if (ownsPending && this._functionResolveState.inFlight.get(cacheKey) === pending) {
        this._functionResolveState.inFlight.delete(cacheKey);
      }
    }
  }

  private async _awaitFunctionResolution(
    pending: Promise<unknown>,
    authContext: AuthContext,
  ): Promise<ResolutionOutcome> {
    let outcome: unknown;
    try {
      outcome = await pending;
    } catch (error) {
      this._assertCurrentAuthContext(authContext);
      throw error;
    }
    this._assertCurrentAuthContext(authContext);
    if (!isResolutionOutcome(outcome)) {
      throw new Error('Invalid in-flight function resolution');
    }
    return outcome;
  }

  private async _handleFunctionResolutionError(
    outcome: ResolutionOutcome,
    functionName: string,
    options: {
      authContext: AuthContext;
      useAnonKey: boolean;
      allowRefresh?: boolean;
    },
  ): Promise<{ functionId: string | null; invokeUrl: unknown; token: string | null }> {
    if (outcome.error === null) {
      throw new Error('Expected function resolution error');
    }
    if (outcome.status === 401 && !options.useAnonKey && options.allowRefresh !== false) {
      return await this._retryFunctionResolution(functionName, options, outcome.error);
    }
    throw outcome.error;
  }

  private async _retryFunctionResolution(
    functionName: string,
    options: { authContext: AuthContext; useAnonKey: boolean },
    cause: Error,
  ): Promise<{ functionId: string | null; invokeUrl: unknown; token: string | null }> {
    const sessionExpiredError = Object.assign(new Error('Session expired'), cause);
    if (options.authContext.refreshToken === null || options.authContext.refreshToken === '') {
      throw sessionExpiredError;
    }
    const refreshed = await this._refreshSessionForContext(options.authContext);
    if (AuthRefreshDiscardedError.is(refreshed.error)) {
      throw refreshed.error;
    }
    this._assertRefreshSucceeded(refreshed.error, sessionExpiredError);
    if (!this._isAuthContextCurrent(options.authContext)) {
      throw new AuthRefreshDiscardedError();
    }
    const refreshedContext = this._captureAuthContext();
    return await this._resolveFunctionIdByName(functionName, {
      authContext: refreshedContext,
      token: refreshedContext.accessToken,
      useAnonKey: options.useAnonKey,
      allowRefresh: false,
    });
  }

  private _assertRefreshSucceeded(error: unknown, sessionExpiredError: Error): void {
    if (error !== null) {
      throw sessionExpiredError;
    }
  }

  /**
   * Make a public request with anon key
   * @private
   */
  async _anonFetch(path: string, options: RequestInit = {}): ReturnType<typeof anonFetch> {
    return anonFetch(this, path, options);
  }

  // ========================================================================
  // Query Builder Methods
  // ========================================================================

  from(table: string): QueryBuilder {
    return new QueryBuilder(this, table, this._currentDatabaseName);
  }

  database(databaseName: string): this {
    this._currentDatabaseName = databaseName;
    return this;
  }

  insert(table: string, values: Record<string, unknown>): MutationBuilder {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'insert', values);
  }

  update(table: string, values: Record<string, unknown>): MutationBuilder {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'update', values);
  }

  delete(table: string): MutationBuilder {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'delete', null);
  }

  // ========================================================================
  // Authentication Methods
  // ========================================================================

  async signUp(options: Parameters<typeof signUpAccount>[1]): ReturnType<typeof signUpAccount> {
    return signUpAccount(this, options);
  }

  async signIn(options: Parameters<typeof signInAccount>[1]): ReturnType<typeof signInAccount> {
    return signInAccount(this, options);
  }

  getSession(): ReturnType<typeof getAccountSession> {
    return getAccountSession(this);
  }

  setSession(
    session: Parameters<typeof adoptAccountSession>[1],
  ): ReturnType<typeof adoptAccountSession> {
    return adoptAccountSession(this, session);
  }

  async signOut(): ReturnType<typeof signOut> {
    return signOut(this);
  }

  async _signOutCaptured(
    context: Parameters<typeof signOutCaptured>[1],
    refreshing: Parameters<typeof signOutCaptured>[2],
  ): ReturnType<typeof signOutCaptured> {
    return signOutCaptured(this, context, refreshing);
  }

  async _revokeAccessSession(
    context: Parameters<typeof revokeAccessSession>[1],
    sessionId: string,
    preceding: Parameters<typeof revokeAccessSession>[3],
  ): ReturnType<typeof revokeAccessSession> {
    return revokeAccessSession(this, context, sessionId, preceding);
  }

  async getUser(): ReturnType<typeof getAccountUser> {
    return getAccountUser(this);
  }

  async updateUser(
    options: Parameters<typeof updateAccountUser>[1],
  ): ReturnType<typeof updateAccountUser> {
    return updateAccountUser(this, options);
  }

  async refreshSession(): ReturnType<typeof refreshSession> {
    return refreshSession(this);
  }

  async _refreshSessionForContext(
    context: AuthContext,
  ): ReturnType<typeof refreshSessionForContext> {
    return refreshSessionForContext(this, context);
  }

  async _fetchSessionRefresh(context: AuthContext): ReturnType<typeof fetchSessionRefresh> {
    return fetchSessionRefresh(this, context);
  }

  async _performSessionRefresh(context: AuthContext): ReturnType<typeof performSessionRefresh> {
    return performSessionRefresh(this, context);
  }

  /**
   * Register a callback for auth state changes.
   * @param {Function} callback - Called with user object (or null) on auth state change
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChange(
    callback: Parameters<typeof subscribeToAuthState>[1],
  ): ReturnType<typeof subscribeToAuthState> {
    return subscribeToAuthState(this, callback);
  }

  // ========================================================================
  // Anonymous User Methods
  // ========================================================================

  async signInAnonymously(
    metadata: Record<string, unknown> = {},
  ): ReturnType<typeof signInAnonymousAccount> {
    return signInAnonymousAccount(this, metadata);
  }

  async signUpAnonymous(
    metadata: Record<string, unknown> = {},
  ): ReturnType<typeof signUpAnonymousAccount> {
    return signUpAnonymousAccount(this, metadata);
  }

  async convertAnonymous(
    options: Parameters<typeof convertAnonymousAccount>[1],
  ): ReturnType<typeof convertAnonymousAccount> {
    return convertAnonymousAccount(this, options);
  }

  // ========================================================================
  // Email Confirmation Methods
  // ========================================================================

  async confirmEmail(token: string): ReturnType<typeof confirmAccountEmail> {
    return confirmAccountEmail(this, token);
  }

  async resendConfirmation(email: string): ReturnType<typeof resendAccountConfirmation> {
    return resendAccountConfirmation(this, email);
  }

  // ========================================================================
  // Password Recovery Methods
  // ========================================================================

  async forgotPassword(email: string): ReturnType<typeof forgotAccountPassword> {
    return forgotAccountPassword(this, email);
  }

  async resetPasswordForEmail(email: string): ReturnType<typeof resetAccountPasswordForEmail> {
    return resetAccountPasswordForEmail(this, email);
  }

  async resetPassword(
    options: Parameters<typeof resetAccountPassword>[1],
  ): ReturnType<typeof resetAccountPassword> {
    return resetAccountPassword(this, options);
  }

  // ========================================================================
  // Email Change Methods
  // ========================================================================

  async requestEmailChange(newEmail: string): ReturnType<typeof requestAccountEmailChange> {
    return requestAccountEmailChange(this, newEmail);
  }

  async confirmEmailChange(emailChangeToken: string): ReturnType<typeof confirmAccountEmailChange> {
    return confirmAccountEmailChange(this, emailChangeToken);
  }

  async cancelEmailChange(): ReturnType<typeof cancelAccountEmailChange> {
    return cancelAccountEmailChange(this);
  }

  // ========================================================================
  // OAuth / SSO Authentication
  // ========================================================================

  signInWithOAuth(
    provider: Parameters<typeof beginOAuth>[1],
    options: Parameters<typeof beginOAuth>[2] = {},
  ): ReturnType<typeof beginOAuth> {
    return beginOAuth(this, provider, options);
  }

  _resolveOAuthRedirectTarget(
    redirectTo: string | undefined,
  ): ReturnType<typeof resolveOAuthRedirectTarget> {
    return resolveOAuthRedirectTarget(redirectTo);
  }

  getHostedAuthUrl(
    options: Parameters<typeof createHostedAuthUrl>[1] = {},
  ): ReturnType<typeof createHostedAuthUrl> {
    return createHostedAuthUrl(this, options);
  }

  signInWithHostedAuth(
    options: Parameters<typeof beginHostedAuth>[1] = {},
  ): ReturnType<typeof beginHostedAuth> {
    return beginHostedAuth(this, options);
  }

  _resolveProjectIdForHostedAuth(
    explicitProjectId: string | undefined,
  ): ReturnType<typeof resolveProjectIdForHostedAuth> {
    return resolveProjectIdForHostedAuth(this, explicitProjectId);
  }

  signInWithGoogle(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'google');
  }
  signInWithGitHub(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'github');
  }
  signInWithMicrosoft(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'microsoft');
  }
  signInWithApple(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'apple');
  }

  async linkOAuthProvider(provider: string): ReturnType<typeof linkAccountProvider> {
    return linkAccountProvider(this, provider);
  }

  async unlinkOAuthProvider(provider: string): ReturnType<typeof unlinkAccountProvider> {
    return unlinkAccountProvider(this, provider);
  }

  async getLinkedOAuthProviders(): ReturnType<typeof getAccountLinkedProviders> {
    return getAccountLinkedProviders(this);
  }

  async refreshOAuthToken(provider: string): ReturnType<typeof refreshAccountProviderToken> {
    return refreshAccountProviderToken(this, provider);
  }

  async getOAuthProviderToken(provider: string): ReturnType<typeof getAccountProviderToken> {
    return getAccountProviderToken(this, provider);
  }

  async callOAuthAPI(
    provider: string,
    params: Parameters<typeof callProviderAPI>[2],
  ): ReturnType<typeof callProviderAPI> {
    return callProviderAPI(this, provider, params);
  }

  // ========================================================================
  // Session Management (User's sessions)
  // ========================================================================

  async getSessions(
    options: Parameters<typeof getAccountSessions>[1] = {},
  ): ReturnType<typeof getAccountSessions> {
    return getAccountSessions(this, options);
  }

  async deleteSession(sessionId: string): ReturnType<typeof deleteAccountSession> {
    return deleteAccountSession(this, sessionId);
  }

  async deleteAllOtherSessions(): ReturnType<typeof deleteAccountOtherSessions> {
    return deleteAccountOtherSessions(this);
  }

  // ========================================================================
  // Function Invocation
  // ========================================================================

  async invokeFunction(
    functionName: string,
    payload: unknown = {},
  ): ReturnType<typeof invokeFunctionWithClient> {
    return invokeFunctionWithClient(this, functionName, payload);
  }

  // ========================================================================
  // Durable Executions
  // ========================================================================

  startDurableExecution(
    functionName: string,
    input: unknown = {},
    options: { executionName?: string } = {},
  ): ReturnType<DurableFacade['start']> {
    return this._durableFacade.start(functionName, input, options);
  }

  getDurableExecution(
    projectId: string,
    functionName: string,
    executionId: string,
  ): ReturnType<DurableFacade['get']> {
    return this._durableFacade.get(projectId, functionName, executionId);
  }

  listDurableExecutions(
    projectId: string,
    functionName: string,
    options: Parameters<DurableFacade['list']>[2] = {},
  ): ReturnType<DurableFacade['list']> {
    return this._durableFacade.list(projectId, functionName, options);
  }

  stopDurableExecution(
    projectId: string,
    functionName: string,
    executionId: string,
  ): ReturnType<DurableFacade['stop']> {
    return this._durableFacade.stop(projectId, functionName, executionId);
  }

  // ========================================================================
  // Session Management (Internal)
  // ========================================================================

  _captureAuthContext(): ReturnType<typeof captureAuthContext> {
    return captureAuthContext(this);
  }

  _adoptSessionInMemory(session: Parameters<typeof adoptSessionInMemory>[1]): void {
    adoptSessionInMemory(this, session);
  }

  _isAuthContextCurrent(context: AuthContext): ReturnType<typeof isAuthContextCurrent> {
    return isAuthContextCurrent(this, context);
  }

  _setSession(
    data: Parameters<typeof setSession>[1],
    expectedGeneration = this._sessionGeneration,
  ): ReturnType<typeof setSession> {
    return setSession(this, data, expectedGeneration);
  }

  _setRefreshedSession(
    data: Parameters<typeof setRefreshedSession>[1],
    context: AuthContext,
  ): ReturnType<typeof setRefreshedSession> {
    return setRefreshedSession(this, data, context);
  }

  _clearSession(context: AuthContext): ReturnType<typeof clearSession> {
    return clearSession(this, context);
  }

  _clearSessionAtGeneration(generation: number): ReturnType<typeof clearSessionAtGeneration> {
    return clearSessionAtGeneration(this, generation);
  }

  _notifyAuthCallbacks(user: unknown): void {
    notifyAuthCallbacks(this, user);
  }

  // ========================================================================
  // Managed Auth Redirect (hosted login/signup hand-off)
  // ========================================================================

  _hasOAuthCallbackInUrl(): ReturnType<typeof hasOAuthCallbackInUrl> {
    return hasOAuthCallbackInUrl(this._peekAuthRedirectURL(), Boolean(this._peekAuthState()));
  }

  _consumeOAuthCodeFromUrl(): ReturnType<typeof consumeOAuthCodeFromUrl> {
    return consumeOAuthCodeFromUrl(this);
  }

  _completeOAuthExchange(): ReturnType<typeof completeOAuthExchange> {
    return completeOAuthExchange(this);
  }

  _stripOAuthQueryFromUrl(callbackURL: URL): void {
    stripOAuthQueryFromUrl(callbackURL);
  }

  _removeOAuthResponseParams(callbackURL: URL, clearHash = true): void {
    removeOAuthResponseParams(callbackURL, clearHash);
  }

  /**
   * Returns true when the current browser URL fragment carries a managed-auth
   * session hand-off (i.e. an access_token from a hosted login/signup redirect).
   * Cheap peek that does not mutate state.
   */
  _hasSessionInUrl(): ReturnType<typeof hasSessionInUrl> {
    return hasSessionInUrl();
  }

  /**
   * Adopt a session handed off by the managed hosted auth pages. After a
   * successful managed login/signup the user is redirected to the configured
   * URL with the tokens in the URL fragment:
   *   https://app/callback#access_token=...&refresh_token=...&token_type=bearer&expires_in=...
   * When present, the tokens are stored like any other session and removed from
   * the URL. Returns true if a session was adopted. Browser-only and idempotent.
   */
  _consumeSessionFromUrl(): ReturnType<typeof consumeSessionFromUrl> {
    return consumeSessionFromUrl(this);
  }

  _replaceSessionFromUrl(accessToken: string, refreshToken: string | null): void {
    replaceSessionFromUrl(this, accessToken, refreshToken);
  }

  /**
   * Remove the managed-auth tokens from the URL fragment so they do not linger
   * in history, referrers, or bookmarks. Only strips when the fragment is
   * exclusively the hand-off params, to avoid clobbering app hash routing.
   */
  _stripAuthHashFromUrl(params: URLSearchParams): void {
    stripAuthHashFromUrl(params);
  }

  // ========================================================================
  // RP nonce helpers (sessionStorage) — bind redirect sessions to this client
  // ========================================================================

  // Generate a one-time, unguessable nonce for the managed/OAuth redirect flow.
  // This is a CSRF defense, so it must be cryptographically random — we require
  // Web Crypto (browsers and Node >= 20 provide it) rather than fall back to a
  // predictable PRNG.
  _generateAuthStateNonce(): ReturnType<typeof generateAuthStateNonce> {
    return generateAuthStateNonce();
  }

  // Persist the nonce across the redirect. sessionStorage is per-tab+origin and
  // survives the navigation away to the hosted page and back to this origin.
  _storeAuthState(nonce: string, redirectURL = ''): void {
    storeAuthState(nonce, redirectURL);
  }

  // Read and clear the stored nonce (one-time use).
  _takeAuthState(): ReturnType<typeof takeAuthState> {
    return takeAuthState();
  }

  _peekAuthState(): ReturnType<typeof peekAuthState> {
    return peekAuthState();
  }

  _takeAuthRedirectURL(): ReturnType<typeof takeAuthRedirectUrl> {
    return takeAuthRedirectUrl();
  }

  _peekAuthRedirectURL(): ReturnType<typeof peekAuthRedirectUrl> {
    return peekAuthRedirectUrl();
  }

  // ========================================================================
  // Storage Helpers (Browser/Node.js compatible)
  // ========================================================================

  _getStorageItem(key: string): ReturnType<typeof getStorageItem> {
    return getStorageItem(key);
  }

  _setStorageItem(key: string, value: string): void {
    setStorageItem(key, value);
  }

  _removeStorageItem(key: string): void {
    removeStorageItem(key);
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  private _hasInitialSession(): boolean {
    return (
      this._hasStoredSession() ||
      this._hasSessionInUrl() ||
      this._oauthExchangePromise !== null ||
      this._oauthExchangeError !== null
    );
  }

  private _hasStoredSession(): boolean {
    return (
      (this.accessToken !== null && this.accessToken !== '') ||
      (this.refreshToken !== null && this.refreshToken !== '')
    );
  }

  async initialize(): Promise<{ user: unknown; error: Error | null }> {
    if (!this._hasInitialSession()) {
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

  /**
   * @internal Test-only helper to ensure deterministic cache behavior in unit tests.
   */
  static __resetFunctionResolveCacheForTests(): void {
    clearSharedFunctionResolveStateForTests();
  }

  /**
   * @internal Test-only helper for asserting global resolver cache state.
   */
  static __getFunctionResolveCacheMetricsForTests(): {
    cacheSize: number;
    inFlightSize: number;
    maxEntries: number;
  } {
    const state = getSharedFunctionResolveState();
    return {
      cacheSize: state.cache.size,
      inFlightSize: state.inFlight.size,
      maxEntries: state.maxEntries,
    };
  }

  /**
   * @internal Test-only helper for forcing resolver cache limits.
   */
  static __setFunctionResolveCacheMaxEntriesForTests(maxEntries: unknown): void {
    const nextMax = Number(maxEntries);
    if (!Number.isInteger(nextMax) || nextMax < 1) {
      throw new Error('maxEntries must be a positive integer');
    }
    const state = getSharedFunctionResolveState();
    state.maxEntries = nextMax;
    pruneFunctionResolveCache(state, Date.now(), true);
  }
}

// ============================================================================
// StorageFileApi - For storage operations on a specific bucket
// ============================================================================

// ============================================================================
// Realtime Import Note
// ============================================================================

// Realtime is available via separate import: import { VolcanoRealtime } from '@volcano.dev/sdk/realtime'
// This improves tree-shaking - centrifuge (~5.5MB) is only loaded when realtime is used
//
// To use realtime, import directly: import { VolcanoRealtime } from '@volcano.dev/sdk/realtime'

/**
 * Lazy-load the realtime module
 * @returns {Promise<{VolcanoRealtime: any, RealtimeChannel: any}>}
 */
async function loadRealtime(): Promise<{
  VolcanoRealtime: typeof import('./realtime.ts').VolcanoRealtime;
  RealtimeChannel: typeof import('./realtime.ts').RealtimeChannel;
}> {
  const module = await import('./realtime.ts');
  return {
    VolcanoRealtime: module.VolcanoRealtime,
    RealtimeChannel: module.RealtimeChannel,
  };
}

// ============================================================================
// Exports
// ============================================================================

// Exports. Author these as pure ES module declarations only; rollup emits the
// ESM, CJS, and UMD builds (see rollup.config.mjs, all `exports: 'named'`).
// Do NOT hand-write CommonJS, browser-global, or AMD export assignments
// here: rollup passes such statements through verbatim into the ES build too,
// and a stray top-level CommonJS assignment in dist/index.esm.mjs overwrites
// the export object of any CJS bundle that inlines the SDK
// (e.g. esbuild --bundle --format=cjs), producing "handler is not a function"
// at runtime. See VOL-505.
export { loadRealtime, VolcanoAuth, VolcanoAuth as VolcanoClient };
export { QueryBuilder } from './database-query.ts';
export { isBrowser } from './next/request.ts';
export { StorageFileApi } from './storage-file.ts';
export default VolcanoAuth;

export { databaseConnectionString } from './database-connection-string.ts';
export {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from './errors.ts';
