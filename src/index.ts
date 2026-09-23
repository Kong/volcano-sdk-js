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
  fetchSessionRefresh,
  performSessionRefresh,
  refreshSession,
  refreshSessionForContext,
  revokeAccessSession,
  signOut,
  signOutCaptured,
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
import { QueryBuilder } from './database-query.ts';
import { DurableFacade } from './durable-facade.ts';
import { AuthRefreshDiscardedError, AuthSessionChangedError } from './errors.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';
import { invokeFunction as invokeFunctionWithClient } from './function-invoke.ts';
import { isResolutionOutcome, resolveFunctionByHttp } from './function-resolution.ts';
import {
  cachedFunctionResolution,
  clearFunctionResolveCache,
  clearSharedFunctionResolveStateForTests,
  functionResolveCacheKey,
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
  queryDatabaseSelect,
  releaseProjectLock,
  startDurableExecutionFromApplication,
  stopDurableExecution,
  uploadStorageObject,
} from './generated/client.ts';
import { isBrowser } from './next/request.ts';
import { ProjectLocksApi } from './project-locks.ts';
import { StorageFileApi } from './storage-file.ts';
import type { AuthContext, RefreshResult, SignOutResult } from './auth-session-lifecycle.ts';
import type { FunctionResolveState } from './function-resolve-cache.ts';
import type {
  Auth,
  Durable,
  Functions,
  Logs,
  ProjectLocks,
  Storage,
  VolcanoAuthConfig,
} from './sdk-public-types.ts';

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
  queryDatabaseSelect,
  releaseProjectLock,
  startDurableExecutionFromApplication,
  stopDurableExecution,
  uploadStorageObject,
};

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

  constructor(config: VolcanoAuthConfig & {
    timeout?: number;
    transportFactory?: (client: VolcanoAuth) => typeof GENERATED_TRANSPORT;
  }) {
    if (!config.anonKey) {
      throw new Error('anonKey is required. Get your anon key from project settings.');
    }

    // SECURITY: Throw hard error if service key is used client-side
    if (config.anonKey.startsWith('sk-') && isBrowser()) {
      throw new Error(
        '[VOLCANO SECURITY ERROR] Service keys (sk-*) cannot be used in client-side code. ' +
          'Service keys bypass Row Level Security and expose your database to unauthorized access. ' +
          'Use an anon key (ak-*) for browser/client-side applications. ' +
          'Service keys should only be used in secure server-side environments. ' +
          'See: https://docs.volcano.hosting/security/keys',
      );
    }

    this.apiUrl = (config.apiUrl || DEFAULT_API_URL).replace(/\/$/, ''); // Remove trailing slash
    this.anonKey = config.anonKey;
    this.timeout = config.timeout || DEFAULT_TIMEOUT_MS;
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
    this._transport = (config.transportFactory || (() => GENERATED_TRANSPORT))(this);
    this._durableFacade = new DurableFacade(this);

    // Server-side use: Allow passing accessToken directly (e.g., in Lambda functions)
    if (config.accessToken) {
      this.accessToken = config.accessToken;
      this.refreshToken = config.refreshToken || null;
    } else {
      // Client-side use: Restore from localStorage if available
      this.accessToken = this._getStorageItem(STORAGE_KEY_ACCESS_TOKEN);
      this.refreshToken = this._getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
      // Adopt a managed hosted-auth redirect session from the URL fragment if
      // present, so the client is authenticated at construction time — exactly
      // like a signIn() result or a localStorage-restored session. A fresh
      // redirect token takes precedence over any stale stored session.
      this._pendingUrlAuthNotify = this._consumeSessionFromUrl();
    }
    if (!config.accessToken && this._hasOAuthCallbackInUrl()) {
      this._oauthExchangePromise = this._consumeOAuthCodeFromUrl();
      // Clear a settled exchange even if no auth method has awaited it yet.
      this._completeOAuthExchange();
    }

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

  // ========================================================================
  // Logs Methods
  // ========================================================================

  async _postProjectLogRequest(projectId: string, endpoint: string, request: unknown) {
    if (typeof projectId !== 'string' || projectId.trim() === '') {
      return { data: null, error: new Error('projectId must be a non-empty string') };
    }

    const result = await this._authFetch(
      `/projects/${encodeURIComponent(projectId)}/logs/${endpoint}`,
      {
        method: 'POST',
        body: JSON.stringify(request || {}),
      },
    );

    if (!result.ok) {
      return { data: null, error: result.error };
    }

    return { data: result.data, error: null };
  }

  searchLogs(projectId: string, request: import("./sdk-public-types.ts").LogSearchRequest) {
    return this._postProjectLogRequest(projectId, 'search', request);
  }

  getLogActivity(projectId: string, request: import("./sdk-public-types.ts").LogActivityRequest) {
    return this._postProjectLogRequest(projectId, 'activity', request);
  }

  // ========================================================================
  // Storage Methods
  // ========================================================================

  /**
   * Select a storage bucket to perform operations on
   * @param {string} bucketName - The name of the bucket
   * @returns {StorageFileApi} - Storage file API for the bucket
   */
  storageBucket(bucketName: string) {
    return new StorageFileApi(this, bucketName);
  }

  // ========================================================================
  // Internal Fetch Helpers
  // ========================================================================

  /**
   * Make an authenticated request with access token
   * @private
   */
  async _authFetch(path: string | (() => string), options: RequestInit | (() => RequestInit) = {}) {
    const { result } = await this._authFetchWithContext(path, options);
    return result;
  }

  async _authFetchWithContext(path: string | (() => string), options: RequestInit | (() => RequestInit) = {}) {
    return authFetchWithContext(this, path, options);
  }

  async _authFetchUrl(url: string, fetchOptions: RequestInit = {}) {
    return authFetchUrl(this, url, fetchOptions);
  }

  _generatedOptions(
    volcanoAuthorization: 'anon' | 'session',
    headers?: Record<string, string>,
    responseType?: 'blob',
  ) {
    return {
      volcanoAuthorization,
      volcanoClient: this,
      ...(headers ? { headers } : {}),
      ...(responseType ? { volcanoResponseType: responseType } : {}),
    };
  }

  async _generatedFetch(path: string, options: RequestInit, authorization: "anon" | "session") {
    const url = `${this.apiUrl}${path}`;
    if (authorization === 'anon') {
      return fetchWithTimeout(
        url,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${this.anonKey}`,
            ...options.headers,
          },
        },
        this.timeout,
      );
    }

    return fetchWithAuthRetry(this, url, options);
  }

  _getFunctionInvokeUrl(functionIdentifier: unknown, resolvedInvokeUrl: unknown) {
    return functionInvokeUrl(this.apiUrl, functionIdentifier, resolvedInvokeUrl);
  }

  _functionResolveCacheKey(functionName: string, token: string, useAnonKey: boolean) {
    return functionResolveCacheKey(this.apiUrl, functionName, token, useAnonKey);
  }

  _clearFunctionResolveCache(functionName: string, token: string, useAnonKey: boolean) {
    const cacheKey = this._functionResolveCacheKey(functionName, token, useAnonKey);
    clearFunctionResolveCache(this._functionResolveState, cacheKey);
  }

  async _resolveFunctionIdByName(
    functionName: string,
    {
      authContext,
      token,
      useAnonKey,
      allowRefresh = true,
    }: { authContext: AuthContext; token: string | null; useAnonKey: boolean; allowRefresh?: boolean },
  ): Promise<{ functionId: string | null; invokeUrl: unknown; token: string | null }> {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionName);
    if (!hostLabel) {
      throw new Error(
        'functionName must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }

    if (!this._isAuthContextCurrent(authContext)) {
      throw new AuthSessionChangedError();
    }

    if (token === null) {
      throw new Error('No credential available to resolve function');
    }
    const cacheKey = this._functionResolveCacheKey(hostLabel, token, useAnonKey);
    const now = Date.now();
    pruneFunctionResolveCache(this._functionResolveState, now);
    const rawCached = this._functionResolveState.cache.get(cacheKey);
    const cached = cachedFunctionResolution(rawCached);
    if (cached && cached.expiresAt > now) {
      if (cached.error) {
        throw Object.assign(new Error(cached.error), { status: 404 }, cached.errorMetadata);
      }
      return { functionId: cached.functionId, invokeUrl: cached.invokeUrl, token };
    }
    if (rawCached !== undefined) {
      this._functionResolveState.cache.delete(cacheKey);
    }

    let pending = this._functionResolveState.inFlight.get(cacheKey);
    const ownsPending = !pending;
    if (!pending) {
      // Share only the credentialed HTTP result. Session validation and 401
      // refresh belong to each caller, not the shared request.
      pending = resolveFunctionByHttp(this, hostLabel, token, cacheKey);

      this._functionResolveState.inFlight.set(cacheKey, pending);
    }

    try {
      let outcome;
      try {
        outcome = await pending;
      } catch (error) {
        if (!this._isAuthContextCurrent(authContext)) {
          throw new AuthSessionChangedError();
        }
        throw error;
      }
      if (!this._isAuthContextCurrent(authContext)) {
        throw new AuthSessionChangedError();
      }

      if (!isResolutionOutcome(outcome)) {
        throw new Error('Invalid in-flight function resolution');
      }

      if (outcome.error) {
        if (outcome.status === 401 && !useAnonKey && allowRefresh) {
          const sessionExpiredError = Object.assign(new Error('Session expired'), outcome.error);
          if (!authContext.refreshToken) {
            throw sessionExpiredError;
          }
          const refreshed = await this._refreshSessionForContext(authContext);
          if (AuthRefreshDiscardedError.is(refreshed.error)) {
            throw refreshed.error;
          }
          if (refreshed.error) {
            throw sessionExpiredError;
          }
          if (!this._isAuthContextCurrent(authContext)) {
            throw new AuthRefreshDiscardedError();
          }
          const refreshedContext = this._captureAuthContext();
          return this._resolveFunctionIdByName(functionName, {
            authContext: refreshedContext,
            token: refreshedContext.accessToken,
            useAnonKey,
            allowRefresh: false,
          });
        }
        throw outcome.error;
      }

      return { functionId: outcome.functionId, invokeUrl: outcome.invokeUrl, token };
    } finally {
      if (ownsPending && this._functionResolveState.inFlight.get(cacheKey) === pending) {
        this._functionResolveState.inFlight.delete(cacheKey);
      }
    }
  }

  /**
   * Make a public request with anon key
   * @private
   */
  async _anonFetch(path: string, options: RequestInit = {}) {
    return anonFetch(this, path, options);
  }

  // ========================================================================
  // Query Builder Methods
  // ========================================================================

  from(table: string) {
    return new QueryBuilder(this, table, this._currentDatabaseName);
  }

  database(databaseName: string) {
    this._currentDatabaseName = databaseName;
    return this;
  }

  insert(table: string, values: Record<string, unknown>) {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'insert', values);
  }

  update(table: string, values: Record<string, unknown>) {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'update', values);
  }

  delete(table: string) {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'delete', null);
  }

  // ========================================================================
  // Authentication Methods
  // ========================================================================

  async signUp(options: Parameters<typeof signUpAccount>[1]) {
    return signUpAccount(this, options);
  }

  async signIn(options: Parameters<typeof signInAccount>[1]) {
    return signInAccount(this, options);
  }

  getSession() {
    return getAccountSession(this);
  }

  setSession(session: Parameters<typeof adoptAccountSession>[1]) {
    return adoptAccountSession(this, session);
  }

  async signOut() {
    return signOut(this);
  }

  async _signOutCaptured(context: Parameters<typeof signOutCaptured>[1], refreshing: Parameters<typeof signOutCaptured>[2]) {
    return signOutCaptured(this, context, refreshing);
  }

  async _revokeAccessSession(context: Parameters<typeof revokeAccessSession>[1], sessionId: string, preceding: Parameters<typeof revokeAccessSession>[3]) {
    return revokeAccessSession(this, context, sessionId, preceding);
  }

  async getUser() {
    return getAccountUser(this);
  }

  async updateUser(options: Parameters<typeof updateAccountUser>[1]) {
    return updateAccountUser(this, options);
  }

  async refreshSession() {
    return refreshSession(this);
  }

  async _refreshSessionForContext(context: AuthContext) {
    return refreshSessionForContext(this, context);
  }

  async _fetchSessionRefresh(context: AuthContext) {
    return fetchSessionRefresh(this, context);
  }

  async _performSessionRefresh(context: AuthContext) {
    return performSessionRefresh(this, context);
  }

  /**
   * Register a callback for auth state changes.
   * @param {Function} callback - Called with user object (or null) on auth state change
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChange(callback: Parameters<typeof subscribeToAuthState>[1]) {
    return subscribeToAuthState(this, callback);
  }

  // ========================================================================
  // Anonymous User Methods
  // ========================================================================

  async signInAnonymously(metadata: Record<string, unknown> = {}) {
    return signInAnonymousAccount(this, metadata);
  }

  async signUpAnonymous(metadata: Record<string, unknown> = {}) {
    return signUpAnonymousAccount(this, metadata);
  }

  async convertAnonymous(options: Parameters<typeof convertAnonymousAccount>[1]) {
    return convertAnonymousAccount(this, options);
  }

  // ========================================================================
  // Email Confirmation Methods
  // ========================================================================

  async confirmEmail(token: string) {
    return confirmAccountEmail(this, token);
  }

  async resendConfirmation(email: string) {
    return resendAccountConfirmation(this, email);
  }

  // ========================================================================
  // Password Recovery Methods
  // ========================================================================

  async forgotPassword(email: string) {
    return forgotAccountPassword(this, email);
  }

  async resetPasswordForEmail(email: string) {
    return resetAccountPasswordForEmail(this, email);
  }

  async resetPassword(options: Parameters<typeof resetAccountPassword>[1]) {
    return resetAccountPassword(this, options);
  }

  // ========================================================================
  // Email Change Methods
  // ========================================================================

  async requestEmailChange(newEmail: string) {
    return requestAccountEmailChange(this, newEmail);
  }

  async confirmEmailChange(emailChangeToken: string) {
    return confirmAccountEmailChange(this, emailChangeToken);
  }

  async cancelEmailChange() {
    return cancelAccountEmailChange(this);
  }

  // ========================================================================
  // OAuth / SSO Authentication
  // ========================================================================

  signInWithOAuth(provider: Parameters<typeof beginOAuth>[1], options: Parameters<typeof beginOAuth>[2] = {}) {
    return beginOAuth(this, provider, options);
  }

  _resolveOAuthRedirectTarget(redirectTo: string | undefined) {
    return resolveOAuthRedirectTarget(redirectTo);
  }

  getHostedAuthUrl(options: Parameters<typeof createHostedAuthUrl>[1] = {}) {
    return createHostedAuthUrl(this, options);
  }

  signInWithHostedAuth(options: Parameters<typeof beginHostedAuth>[1] = {}) {
    return beginHostedAuth(this, options);
  }

  _resolveProjectIdForHostedAuth(explicitProjectId: string | undefined) {
    return resolveProjectIdForHostedAuth(this, explicitProjectId);
  }

  signInWithGoogle() {
    return signInWithProvider(this, 'google');
  }
  signInWithGitHub() {
    return signInWithProvider(this, 'github');
  }
  signInWithMicrosoft() {
    return signInWithProvider(this, 'microsoft');
  }
  signInWithApple() {
    return signInWithProvider(this, 'apple');
  }

  async linkOAuthProvider(provider: string) {
    return linkAccountProvider(this, provider);
  }

  async unlinkOAuthProvider(provider: string) {
    return unlinkAccountProvider(this, provider);
  }

  async getLinkedOAuthProviders() {
    return getAccountLinkedProviders(this);
  }

  async refreshOAuthToken(provider: string) {
    return refreshAccountProviderToken(this, provider);
  }

  async getOAuthProviderToken(provider: string) {
    return getAccountProviderToken(this, provider);
  }

  async callOAuthAPI(provider: string, params: Parameters<typeof callProviderAPI>[2]) {
    return callProviderAPI(this, provider, params);
  }

  // ========================================================================
  // Session Management (User's sessions)
  // ========================================================================

  async getSessions(options: Parameters<typeof getAccountSessions>[1] = {}) {
    return getAccountSessions(this, options);
  }

  async deleteSession(sessionId: string) {
    return deleteAccountSession(this, sessionId);
  }

  async deleteAllOtherSessions() {
    return deleteAccountOtherSessions(this);
  }

  // ========================================================================
  // Function Invocation
  // ========================================================================

  async invokeFunction(functionName: string, payload: unknown = {}) {
    return invokeFunctionWithClient(this, functionName, payload);
  }

  // ========================================================================
  // Durable Executions
  // ========================================================================

  startDurableExecution(functionName: string, input: unknown = {}, options: { executionName?: string } = {}) {
    return this._durableFacade.start(functionName, input, options);
  }

  getDurableExecution(projectId: string, functionName: string, executionId: string) {
    return this._durableFacade.get(projectId, functionName, executionId);
  }

  listDurableExecutions(projectId: string, functionName: string, options: Parameters<DurableFacade["list"]>[2] = {}) {
    return this._durableFacade.list(projectId, functionName, options);
  }

  stopDurableExecution(projectId: string, functionName: string, executionId: string) {
    return this._durableFacade.stop(projectId, functionName, executionId);
  }

  // ========================================================================
  // Session Management (Internal)
  // ========================================================================

  _captureAuthContext() {
    return captureAuthContext(this);
  }

  _adoptSessionInMemory(session: Parameters<typeof adoptSessionInMemory>[1]) {
    adoptSessionInMemory(this, session);
  }

  _isAuthContextCurrent(context: AuthContext) {
    return isAuthContextCurrent(this, context);
  }

  _setSession(data: Parameters<typeof setSession>[1], expectedGeneration = this._sessionGeneration) {
    return setSession(this, data, expectedGeneration);
  }

  _setRefreshedSession(data: Parameters<typeof setRefreshedSession>[1], context: AuthContext) {
    return setRefreshedSession(this, data, context);
  }

  _clearSession(context: AuthContext) {
    return clearSession(this, context);
  }

  _clearSessionAtGeneration(generation: number) {
    return clearSessionAtGeneration(this, generation);
  }

  _notifyAuthCallbacks(user: unknown) {
    notifyAuthCallbacks(this, user);
  }

  // ========================================================================
  // Managed Auth Redirect (hosted login/signup hand-off)
  // ========================================================================

  _hasOAuthCallbackInUrl() {
    return hasOAuthCallbackInUrl(this._peekAuthRedirectURL(), Boolean(this._peekAuthState()));
  }

  _consumeOAuthCodeFromUrl() {
    return consumeOAuthCodeFromUrl(this);
  }

  _completeOAuthExchange() {
    return completeOAuthExchange(this);
  }

  _stripOAuthQueryFromUrl(callbackURL: URL) {
    stripOAuthQueryFromUrl(callbackURL);
  }

  _removeOAuthResponseParams(callbackURL: URL, clearHash = true) {
    removeOAuthResponseParams(callbackURL, clearHash);
  }

  /**
   * Returns true when the current browser URL fragment carries a managed-auth
   * session hand-off (i.e. an access_token from a hosted login/signup redirect).
   * Cheap peek that does not mutate state.
   */
  _hasSessionInUrl() {
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
  _consumeSessionFromUrl() {
    return consumeSessionFromUrl(this);
  }

  _replaceSessionFromUrl(accessToken: string, refreshToken: string | null) {
    replaceSessionFromUrl(this, accessToken, refreshToken);
  }

  /**
   * Remove the managed-auth tokens from the URL fragment so they do not linger
   * in history, referrers, or bookmarks. Only strips when the fragment is
   * exclusively the hand-off params, to avoid clobbering app hash routing.
   */
  _stripAuthHashFromUrl(params: URLSearchParams) {
    stripAuthHashFromUrl(params);
  }

  // ========================================================================
  // RP nonce helpers (sessionStorage) — bind redirect sessions to this client
  // ========================================================================

  // Generate a one-time, unguessable nonce for the managed/OAuth redirect flow.
  // This is a CSRF defense, so it must be cryptographically random — we require
  // Web Crypto (browsers and Node >= 20 provide it) rather than fall back to a
  // predictable PRNG.
  _generateAuthStateNonce() {
    return generateAuthStateNonce();
  }

  // Persist the nonce across the redirect. sessionStorage is per-tab+origin and
  // survives the navigation away to the hosted page and back to this origin.
  _storeAuthState(nonce: string, redirectURL = '') {
    storeAuthState(nonce, redirectURL);
  }

  // Read and clear the stored nonce (one-time use).
  _takeAuthState() {
    return takeAuthState();
  }

  _peekAuthState() {
    return peekAuthState();
  }

  _takeAuthRedirectURL() {
    return takeAuthRedirectUrl();
  }

  _peekAuthRedirectURL() {
    return peekAuthRedirectUrl();
  }

  // ========================================================================
  // Storage Helpers (Browser/Node.js compatible)
  // ========================================================================

  _getStorageItem(key: string) {
    return getStorageItem(key);
  }

  _setStorageItem(key: string, value: string) {
    setStorageItem(key, value);
  }

  _removeStorageItem(key: string) {
    removeStorageItem(key);
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize() {
    // getUser() also adopts a managed-auth session from the URL fragment when
    // present, so trigger it if there is a stored session or a redirect hand-off.
    if (
      this.accessToken ||
      this.refreshToken ||
      this._hasSessionInUrl() ||
      this._oauthExchangePromise ||
      this._oauthExchangeError
    ) {
      await this._completeOAuthExchange();
      if (this._oauthExchangeError) {
        const error = this._oauthExchangeError;
        this._oauthExchangeError = null;
        return { user: null, error };
      }
      const { user, error } = await this.getUser();
      return { user, error };
    }
    return { user: null, error: null };
  }

  /**
   * @internal Test-only helper to ensure deterministic cache behavior in unit tests.
   */
  static __resetFunctionResolveCacheForTests() {
    clearSharedFunctionResolveStateForTests();
  }

  /**
   * @internal Test-only helper for asserting global resolver cache state.
   */
  static __getFunctionResolveCacheMetricsForTests() {
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
  static __setFunctionResolveCacheMaxEntriesForTests(maxEntries: number) {
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
async function loadRealtime() {
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
const VolcanoClient = VolcanoAuth;

export { loadRealtime, VolcanoAuth, VolcanoClient };
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
