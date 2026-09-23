import { apiRequestError } from './api-errors.ts';
import {
  generateAuthStateNonce,
  getStorageItem,
  hasOAuthCallbackInUrl,
  hasSessionInUrl,
  OAUTH_RESPONSE_QUERY_KEYS,
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
import { sessionIdsEqual, validateSessionContinuation } from './auth-continuity.ts';
import { fetchWithAuthRetry } from './auth-fetch-retry.ts';
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
import { sanitizeProvider, validateCompleteSession } from './auth-validation.ts';
import { MutationBuilder } from './database-mutations.ts';
import { QueryBuilder } from './database-query.ts';
import { durablePathSegments } from './durable-paths.ts';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from './errors.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';
import {
  clearSharedFunctionResolveStateForTests,
  getSharedFunctionResolveState,
  pruneFunctionResolveCache,
} from './function-resolve-cache.ts';
import { sanitizeFunctionIdentifierForHost, validInvokeUrl } from './function-url.ts';
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
} from './generated-runtime/client.js';
import { cloneJsonValue } from './json-clone.ts';
import { isBrowser } from './next/request.ts';
import { ProjectLocksApi } from './project-locks.ts';
import { parseResponseBody } from './response-body.ts';
import { getHeaderValue, responseHeadersToObject } from './response-headers.ts';
import { safeJsonParse } from './response-json.ts';
import { StorageFileApi } from './storage-file.ts';
import { extractRequiredProjectIdFromToken, extractSessionIdFromToken } from './token-claims.ts';

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
const DEFAULT_SESSIONS_LIMIT = 20;
const STORAGE_KEY_ACCESS_TOKEN = 'volcano_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'volcano_refresh_token';
const DEFAULT_FUNCTION_NEGATIVE_RESOLVE_TTL_SECONDS = 30;
// Present only once the platform has dispatched to the function. Its absence on
// a 404 is what says the id we cached no longer names anything, as opposed to
// the function itself answering 404.
const FUNCTION_INVOKED_HEADER = 'x-volcano-function-invoked';
// The idempotency header's documented limit. Checked here so a name that is too
// long fails before the start is sent, rather than coming back as a 400 the
// caller has to read.
const MAX_EXECUTION_NAME_LENGTH = 255;
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
// Utility Functions
// ============================================================================

function authSessionChangedResult() {
  const error = new AuthSessionChangedError();
  return { data: null, status: error.status, headers: {}, version: null, error };
}

// ============================================================================
// VolcanoAuth Class
// ============================================================================

class VolcanoAuth {
  constructor(config) {
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
    this._functionResolveState = getSharedFunctionResolveState();
    this._transport = (config.transportFactory || (() => GENERATED_TRANSPORT))(this);

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

  async _postProjectLogRequest(projectId, endpoint, request) {
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

  searchLogs(projectId, request) {
    return this._postProjectLogRequest(projectId, 'search', request);
  }

  getLogActivity(projectId, request) {
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
  storageBucket(bucketName) {
    return new StorageFileApi(this, bucketName);
  }

  // ========================================================================
  // Internal Fetch Helpers
  // ========================================================================

  /**
   * Make an authenticated request with access token
   * @private
   */
  async _authFetch(path, options = {}) {
    const { result } = await this._authFetchWithContext(path, options);
    return result;
  }

  async _authFetchWithContext(path, options = {}) {
    if (this._oauthExchangePromise) {
      await this._completeOAuthExchange();
    }
    const context = this._captureAuthContext();
    if (!context.accessToken) {
      return {
        result: {
          ok: false,
          status: null,
          error: this._oauthExchangeError || new Error('No active session'),
          data: null,
        },
        context,
      };
    }

    const requestPath = typeof path === 'function' ? path() : path;
    const requestOptions = typeof options === 'function' ? options() : options;
    if (!this._isAuthContextCurrent(context)) {
      return { result: authSessionChangedResult(), context };
    }
    const result = await this._authFetchUrl(`${this.apiUrl}${requestPath}`, requestOptions);
    return { result, context };
  }

  async _authFetchUrl(url, fetchOptions = {}) {
    const context = this._captureAuthContext();
    let retryFailure = null;
    let accessToken = context.accessToken;

    for (;;) {
      try {
        const { response, data } = await fetchWithTimeout(
          url,
          {
            ...fetchOptions,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              ...fetchOptions.headers,
            },
          },
          this.timeout,
          async (response, signal) => ({
            response,
            data: await safeJsonParse(response, signal),
          }),
        );

        if (!response.ok) {
          // Try token refresh once on 401. retryFailure is lexical state, so
          // callers cannot bypass the retry boundary through request options.
          if (response.status === 401 && !retryFailure) {
            retryFailure = {
              ok: false,
              status: response.status,
              error: apiRequestError(response, data, 'Session expired'),
              data,
            };
            if (!context.refreshToken) {
              return retryFailure;
            }
            const refreshed = await this._refreshSessionForContext(context);
            if (refreshed.error) {
              if (AuthRefreshDiscardedError.is(refreshed.error)) {
                return {
                  ok: false,
                  status: refreshed.error.status,
                  error: refreshed.error,
                  data: null,
                };
              }
              return retryFailure;
            }
            if (!this._isAuthContextCurrent(context)) {
              return {
                ok: false,
                status: 409,
                error: new AuthRefreshDiscardedError(),
                data: null,
              };
            }
            accessToken = this.accessToken;
            continue;
          }
          return {
            ok: false,
            status: response.status,
            error: apiRequestError(response, data),
            data,
          };
        }

        return {
          ok: true,
          status: response.status,
          data,
          error: null,
        };
      } catch (error) {
        return {
          ok: false,
          status: null,
          error: error instanceof Error ? error : new Error('Request failed'),
          data: null,
        };
      }
    }
  }

  _generatedOptions(volcanoAuthorization, headers, responseType) {
    return {
      volcanoAuthorization,
      volcanoClient: this,
      ...(headers ? { headers } : {}),
      ...(responseType ? { volcanoResponseType: responseType } : {}),
    };
  }

  async _generatedFetch(path, options, authorization) {
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

  _getFunctionInvokeUrl(functionIdentifier, resolvedInvokeUrl) {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionIdentifier);
    if (!hostLabel) {
      throw new Error(
        'functionId must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }

    // Functions answer on their own domain, unrelated to the API's, so only
    // /functions/resolve can name the endpoint. A deployment serving no public
    // invocation domain, as in local development, omits it; the API invoke
    // path reaches the function there.
    const invokeUrl = validInvokeUrl(resolvedInvokeUrl, this.apiUrl);
    if (!invokeUrl) {
      return `${this.apiUrl}/functions/${encodeURIComponent(hostLabel)}/invoke`;
    }
    return invokeUrl;
  }

  _functionResolveCacheKey(functionName, token, useAnonKey) {
    if (useAnonKey) {
      return `${this.apiUrl}|anon:${token}|${functionName}`;
    }
    const projectScope = extractRequiredProjectIdFromToken(token);
    return `${this.apiUrl}|project:${projectScope}|token:${token}|${functionName}`;
  }

  _clearFunctionResolveCache(functionName, token, useAnonKey) {
    const cacheKey = this._functionResolveCacheKey(functionName, token, useAnonKey);
    this._functionResolveState.cache.delete(cacheKey);
    this._functionResolveState.inFlight.delete(cacheKey);
  }

  async _resolveFunctionIdByName(
    functionName,
    { authContext, token, useAnonKey, allowRefresh = true },
  ) {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionName);
    if (!hostLabel) {
      throw new Error(
        'functionName must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }

    if (!this._isAuthContextCurrent(authContext)) {
      throw new AuthSessionChangedError();
    }

    const cacheKey = this._functionResolveCacheKey(hostLabel, token, useAnonKey);
    const now = Date.now();
    pruneFunctionResolveCache(this._functionResolveState, now);
    const cached = this._functionResolveState.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.error) {
        throw Object.assign(new Error(cached.error), { status: 404 }, cached.errorMetadata);
      }
      return { functionId: cached.functionId, invokeUrl: cached.invokeUrl, token };
    }
    if (cached) {
      this._functionResolveState.cache.delete(cacheKey);
    }

    let pending = this._functionResolveState.inFlight.get(cacheKey);
    const ownsPending = !pending;
    if (!pending) {
      const resolvePath = `/functions/resolve?name=${encodeURIComponent(hostLabel)}`;
      pending = (async () => {
        // Share only the credentialed HTTP result. Session validation and 401
        // refresh belong to each caller so one client's auth lifecycle cannot
        // determine another client's result.
        const result = await this._anonFetch(resolvePath, {
          method: 'GET',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!result.ok) {
          if (result.status === 404) {
            this._functionResolveState.cache.set(cacheKey, {
              functionId: null,
              // Keep the string shape readable by older bundles sharing the V1 cache.
              error: result.error?.message || 'function not found',
              errorMetadata: {
                status: result.status,
                code: result.error?.code,
                retryAfter: result.error?.retryAfter,
              },
              expiresAt: Date.now() + DEFAULT_FUNCTION_NEGATIVE_RESOLVE_TTL_SECONDS * 1000,
            });
            pruneFunctionResolveCache(this._functionResolveState, Date.now(), true);
          }
          return {
            functionId: null,
            error: result.error || new Error('Failed to resolve function'),
            status: result.status,
          };
        }

        const resolvedId = sanitizeFunctionIdentifierForHost(
          result.data && result.data.function_id,
        );
        if (!resolvedId) {
          throw new Error('Resolve response missing valid function_id');
        }

        const ttlRaw = Number(result.data && result.data.cache_ttl_seconds);
        if (!Number.isFinite(ttlRaw) || ttlRaw <= 0) {
          throw new Error('Resolve response missing valid cache_ttl_seconds');
        }
        const ttlSeconds = ttlRaw;

        const resolvedInvokeUrl = result.data && result.data.invoke_url;

        this._functionResolveState.cache.set(cacheKey, {
          functionId: resolvedId,
          invokeUrl: resolvedInvokeUrl,
          error: null,
          expiresAt: Date.now() + ttlSeconds * 1000,
        });
        pruneFunctionResolveCache(this._functionResolveState, Date.now(), true);
        return {
          functionId: resolvedId,
          invokeUrl: resolvedInvokeUrl,
          error: null,
          status: result.status,
        };
      })();

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
  async _anonFetch(path, options = {}) {
    try {
      const response = await fetchWithTimeout(
        `${this.apiUrl}${path}`,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${this.anonKey}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        },
        this.timeout,
      );

      const data = await safeJsonParse(response);

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: apiRequestError(response, data),
          data,
        };
      }

      return { ok: true, status: response.status, data, error: null };
    } catch (error) {
      return {
        ok: false,
        status: null,
        error: error instanceof Error ? error : new Error('Request failed'),
        data: null,
      };
    }
  }

  // ========================================================================
  // Query Builder Methods
  // ========================================================================

  from(table) {
    return new QueryBuilder(this, table, this._currentDatabaseName);
  }

  database(databaseName) {
    this._currentDatabaseName = databaseName;
    return this;
  }

  insert(table, values) {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'insert', values);
  }

  update(table, values) {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'update', values);
  }

  delete(table) {
    return new MutationBuilder(this, table, this._currentDatabaseName, 'delete', null);
  }

  // ========================================================================
  // Authentication Methods
  // ========================================================================

  async signUp({ email, password, metadata = {}, signInWhenAllowed = false }) {
    const result = await this._anonFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, user_metadata: metadata }),
    });

    if (!result.ok) {
      return {
        user: null,
        session: null,
        confirmationRequired: false,
        message: null,
        error: result.error,
      };
    }

    // Session-less signup (VOL-309): the server returns a uniform acknowledgement
    // with no user object and no session tokens — identical for a new account and
    // an already-registered email, so it cannot be used to enumerate addresses.
    const confirmationRequired = Boolean(result.data?.confirmation_required);
    const message = result.data?.message ?? null;

    // Opt-in convenience: when the project does not require email confirmation the
    // account is usable immediately, so establish a session with a follow-up signIn
    // using the same credentials. Off by default so signUp mirrors the server's
    // session-less contract unless the caller asks for auto sign-in. If the follow-up
    // signIn fails, its error is surfaced while the account still exists server-side.
    if (signInWhenAllowed && !confirmationRequired) {
      const signInResult = await this.signIn({ email, password });
      return {
        user: signInResult.user,
        session: signInResult.session,
        confirmationRequired,
        message,
        error: signInResult.error,
      };
    }

    // Default path: caller obtains a session via a separate signIn.
    return {
      user: null,
      session: null,
      confirmationRequired,
      message,
      error: null,
    };
  }

  async signIn({ email, password }) {
    const expectedGeneration = this._sessionGeneration;
    let response;
    try {
      response = await this._transport.authSignin(
        { email, password },
        this._generatedOptions('anon'),
      );
    } catch (error) {
      return {
        user: null,
        session: null,
        error: error instanceof Error ? error : new Error('Sign in failed'),
      };
    }

    if (!this._setSession(response.data, expectedGeneration)) {
      return { user: null, session: null, error: new AuthSessionChangedError() };
    }
    return {
      user: response.data.user,
      session: {
        access_token: response.data.access_token,
        refresh_token: response.data.refresh_token,
        expires_in: response.data.expires_in,
      },
      error: null,
    };
  }

  getSession() {
    if (!this.accessToken) {
      return Promise.resolve({ data: { session: null }, error: null });
    }

    const user = this.currentUser === null ? null : cloneJsonValue(this.currentUser);
    return Promise.resolve({
      data: {
        session: {
          access_token: this.accessToken,
          refresh_token: this.refreshToken,
          user,
        },
      },
      error: null,
    });
  }

  setSession(session) {
    let ownedSession;
    try {
      ownedSession = cloneJsonValue(session);
    } catch {
      return Promise.resolve({
        data: { session: null },
        error: new TypeError('Session must be cloneable'),
      });
    }

    const validationError = validateCompleteSession(ownedSession);
    if (validationError) {
      return Promise.resolve({ data: { session: null }, error: validationError });
    }

    this._adoptSessionInMemory(ownedSession);
    return this.getSession();
  }

  async signOut() {
    return signOut(this);
  }

  async _signOutCaptured(context, refreshing) {
    return signOutCaptured(this, context, refreshing);
  }

  async _revokeAccessSession(context, sessionId, preceding) {
    return revokeAccessSession(this, context, sessionId, preceding);
  }

  async getUser() {
    // Transparently adopt a session handed off by the managed hosted auth pages
    // (tokens in the URL fragment) so callers only ever need getUser().
    const adoptedFromUrl = this._consumeSessionFromUrl();

    const { result, context } = await this._authFetchWithContext('/auth/user');

    if (!result.ok) {
      return { user: null, error: result.error };
    }
    if (
      !this._isAuthContextCurrent(context) ||
      (this.currentUser?.id && result.data.user?.id !== this.currentUser.id)
    ) {
      return { user: null, error: new AuthSessionChangedError() };
    }

    this.currentUser = result.data.user;
    // Announce the redirect adoption — whether it happened just now or earlier
    // at construction — exactly once, so onAuthStateChange listeners see the
    // SIGNED_IN transition on the common hosted-redirect path too.
    if (adoptedFromUrl || this._pendingUrlAuthNotify) {
      this._pendingUrlAuthNotify = false;
      this._notifyAuthCallbacks(this.currentUser);
    }
    return { user: result.data.user, error: null };
  }

  async updateUser(options) {
    const { result, context } = await this._authFetchWithContext('/auth/user', () => {
      const { password, metadata } = options;
      return {
        method: 'PUT',
        body: JSON.stringify({ password, user_metadata: metadata }),
      };
    });

    if (!result.ok) {
      return { user: null, error: result.error };
    }
    if (
      !this._isAuthContextCurrent(context) ||
      (this.currentUser?.id && result.data.user?.id !== this.currentUser.id)
    ) {
      return { user: null, error: new AuthSessionChangedError() };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  async refreshSession() {
    return refreshSession(this);
  }

  async _refreshSessionForContext(context) {
    return refreshSessionForContext(this, context);
  }

  async _fetchSessionRefresh(context) {
    return fetchSessionRefresh(this, context);
  }

  async _performSessionRefresh(context) {
    return performSessionRefresh(this, context);
  }

  /**
   * Register a callback for auth state changes.
   * @param {Function} callback - Called with user object (or null) on auth state change
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChange(callback) {
    if (!this._authCallbacks) {
      this._authCallbacks = [];
    }
    this._authCallbacks.push(callback);

    // Call immediately with current state
    try {
      callback(this.currentUser);
    } catch (err) {
      console.error('[VolcanoAuth] Error in auth state callback:', err);
    }

    return () => {
      this._authCallbacks = this._authCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ========================================================================
  // Anonymous User Methods
  // ========================================================================

  async signInAnonymously(metadata = {}) {
    const expectedGeneration = this._sessionGeneration;
    const result = await this._anonFetch('/auth/signup-anonymous', {
      method: 'POST',
      body: JSON.stringify({ user_metadata: metadata }),
    });

    if (!result.ok) {
      return { user: null, session: null, error: result.error };
    }

    if (!this._setSession(result.data, expectedGeneration)) {
      return { user: null, session: null, error: new AuthSessionChangedError() };
    }
    return {
      user: result.data.user,
      session: {
        access_token: result.data.access_token,
        refresh_token: result.data.refresh_token,
        expires_in: result.data.expires_in,
      },
      error: null,
    };
  }

  async signUpAnonymous(metadata = {}) {
    return this.signInAnonymously(metadata);
  }

  async convertAnonymous(options) {
    const { result, context } = await this._authFetchWithContext(
      '/auth/user/convert-anonymous',
      () => {
        const { email, password, metadata = {} } = options;
        return {
          method: 'POST',
          body: JSON.stringify({ email, password, user_metadata: metadata }),
        };
      },
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }
    if (!this._isAuthContextCurrent(context)) {
      return { user: null, error: new AuthSessionChangedError() };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  // ========================================================================
  // Email Confirmation Methods
  // ========================================================================

  async confirmEmail(token) {
    const result = await this._anonFetch('/auth/confirm', {
      method: 'POST',
      body: JSON.stringify({ token }),
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data?.message ?? null, error: null };
  }

  async resendConfirmation(email) {
    const result = await this._anonFetch('/auth/resend-confirmation', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data?.message ?? null, error: null };
  }

  // ========================================================================
  // Password Recovery Methods
  // ========================================================================

  async forgotPassword(email) {
    const result = await this._anonFetch('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data?.message ?? null, error: null };
  }

  async resetPasswordForEmail(email) {
    return this.forgotPassword(email);
  }

  async resetPassword({ token, newPassword }) {
    const result = await this._anonFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data?.message ?? null, error: null };
  }

  // ========================================================================
  // Email Change Methods
  // ========================================================================

  async requestEmailChange(newEmail) {
    const { result, context } = await this._authFetchWithContext('/auth/user/change-email', () => ({
      method: 'POST',
      body: JSON.stringify({ new_email: newEmail }),
    }));

    if (!result.ok) {
      return { message: null, newEmail: null, error: result.error };
    }
    if (!this._isAuthContextCurrent(context)) {
      return { message: null, newEmail: null, error: new AuthSessionChangedError() };
    }
    return {
      message: result.data?.message ?? null,
      newEmail: result.data?.new_email ?? null,
      emailChangeToken: result.data?.email_change_token,
      error: null,
    };
  }

  async confirmEmailChange(emailChangeToken) {
    const { result, context } = await this._authFetchWithContext(
      '/auth/user/confirm-email-change',
      () => ({
        method: 'POST',
        body: JSON.stringify({ email_change_token: emailChangeToken }),
      }),
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }
    if (!this._isAuthContextCurrent(context)) {
      return { user: null, error: new AuthSessionChangedError() };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  async cancelEmailChange() {
    const { result, context } = await this._authFetchWithContext('/auth/user/cancel-email-change', {
      method: 'DELETE',
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    if (!this._isAuthContextCurrent(context)) {
      return { message: null, error: new AuthSessionChangedError() };
    }
    return { message: result.data?.message ?? null, error: null };
  }

  // ========================================================================
  // OAuth / SSO Authentication
  // ========================================================================

  signInWithOAuth(provider, options = {}) {
    sanitizeProvider(provider);
    if (!isBrowser()) {
      throw new Error(
        'OAuth sign-in is only available in browser environment. Use server-side auth flow for SSR.',
      );
    }
    // Bind the returned authorization code to this flow with a one-time nonce.
    const nonce = this._generateAuthStateNonce();

    const redirectBase = this._resolveOAuthRedirectTarget(options.redirectTo);
    const redirectTarget = new URL(redirectBase);
    for (const key of OAUTH_RESPONSE_QUERY_KEYS) {
      if (redirectTarget.searchParams.has(key)) {
        throw new Error(`OAuth redirectTo must not contain the reserved "${key}" query parameter`);
      }
    }
    const redirectURL = redirectTarget.toString();
    this._storeAuthState(nonce, redirectURL);
    // Keep the nonce in the legacy location during the backend rollout. New
    // servers remove this reserved transport parameter before exact redirect
    // matching; older servers echo it in their token-fragment response.
    const transportRedirectURL = new URL(redirectURL);
    const separator = transportRedirectURL.search ? '&' : '?';
    transportRedirectURL.search = `${transportRedirectURL.search}${separator}vh_state=${encodeURIComponent(nonce)}`;

    const oauthUrl =
      `${this.apiUrl}/auth/oauth/${provider}/authorize` +
      `?anon_key=${encodeURIComponent(this.anonKey)}` +
      `&redirect_url=${encodeURIComponent(transportRedirectURL.toString())}` +
      `&client_state=${encodeURIComponent(nonce)}` +
      `&response_mode=code`;
    try {
      if (window.location && typeof window.location.assign === 'function') {
        window.location.assign(oauthUrl);
      } else {
        window.location.href = oauthUrl;
      }
    } catch (err) {
      const message = String((err && err.message) || err || '');
      if (!message.includes('Not implemented: navigation')) {
        throw err;
      }
    }
    return oauthUrl;
  }

  // Resolve where the OAuth callback should return the browser. Defaults to the
  // current page (without query/hash), which is also the page that will adopt
  // the returned session.
  _resolveOAuthRedirectTarget(redirectTo) {
    if (typeof redirectTo === 'string' && redirectTo.trim() !== '') {
      return redirectTo.trim();
    }
    const loc = window.location;
    return `${loc.origin}${loc.pathname}`;
  }

  // Build the managed hosted-auth URL for this project and store a one-time nonce
  // so the returned session can be bound to this flow. Pass { action: 'signup' |
  // 'login' | 'forgot-password' } to deep-link a step. Browser-only.
  getHostedAuthUrl(options = {}) {
    if (!isBrowser()) {
      throw new Error('getHostedAuthUrl is only available in the browser.');
    }
    const projectId = this._resolveProjectIdForHostedAuth(options.projectId);
    const nonce = this._generateAuthStateNonce();
    this._storeAuthState(nonce);

    const url = new URL(`${this.apiUrl}/projects/${projectId}/auth/hosted`);
    url.searchParams.set('anon_key', this.anonKey);
    if (options.action) {
      url.searchParams.set('action', String(options.action));
    }
    url.searchParams.set('state', nonce);
    return url.toString();
  }

  // Redirect the browser to the managed hosted-auth pages (stores the nonce).
  signInWithHostedAuth(options = {}) {
    const url = this.getHostedAuthUrl(options);
    try {
      if (window.location && typeof window.location.assign === 'function') {
        window.location.assign(url);
      } else {
        window.location.href = url;
      }
    } catch (err) {
      const message = String((err && err.message) || err || '');
      if (!message.includes('Not implemented: navigation')) {
        throw err;
      }
    }
    return url;
  }

  _resolveProjectIdForHostedAuth(explicitProjectId) {
    if (typeof explicitProjectId === 'string' && explicitProjectId.trim() !== '') {
      return explicitProjectId.trim();
    }
    try {
      return extractRequiredProjectIdFromToken(this.anonKey);
    } catch {
      throw new Error(
        'Unable to determine project id for hosted auth. Pass { projectId } to getHostedAuthUrl()/signInWithHostedAuth().',
      );
    }
  }

  signInWithGoogle() {
    return this.signInWithOAuth('google');
  }
  signInWithGitHub() {
    return this.signInWithOAuth('github');
  }
  signInWithMicrosoft() {
    return this.signInWithOAuth('microsoft');
  }
  signInWithApple() {
    return this.signInWithOAuth('apple');
  }

  async linkOAuthProvider(provider) {
    sanitizeProvider(provider);
    const { result, context } = await this._authFetchWithContext(`/auth/oauth/${provider}/link`, {
      method: 'POST',
    });

    if (!this._isAuthContextCurrent(context)) {
      return { data: null, error: new AuthSessionChangedError() };
    }
    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data, error: null };
  }

  async unlinkOAuthProvider(provider) {
    sanitizeProvider(provider);
    const { result, context } = await this._authFetchWithContext(`/auth/oauth/${provider}/unlink`, {
      method: 'DELETE',
    });

    if (!this._isAuthContextCurrent(context)) {
      return { error: new AuthSessionChangedError() };
    }
    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  async getLinkedOAuthProviders() {
    const { result, context } = await this._authFetchWithContext('/auth/oauth/providers');

    if (!this._isAuthContextCurrent(context)) {
      return { providers: null, error: new AuthSessionChangedError() };
    }
    if (!result.ok) {
      return { providers: null, error: result.error };
    }
    return { providers: result.data.providers || [], error: null };
  }

  async refreshOAuthToken(provider) {
    sanitizeProvider(provider);
    const { result, context } = await this._authFetchWithContext(
      `/auth/oauth/${provider}/refresh-token`,
      {
        method: 'POST',
      },
    );

    if (!this._isAuthContextCurrent(context)) {
      return {
        message: null,
        provider: null,
        expiresIn: null,
        error: new AuthSessionChangedError(),
      };
    }

    if (!result.ok) {
      return { message: null, provider: null, expiresIn: null, error: result.error };
    }
    return {
      message: result.data.message,
      provider: result.data.provider,
      expiresIn: result.data.expires_in,
      error: null,
    };
  }

  async getOAuthProviderToken(provider) {
    sanitizeProvider(provider);
    const { result, context } = await this._authFetchWithContext(`/auth/oauth/${provider}/token`);

    if (!this._isAuthContextCurrent(context)) {
      return {
        message: null,
        provider: null,
        expiresIn: null,
        error: new AuthSessionChangedError(),
      };
    }
    if (!result.ok) {
      return { message: null, provider: null, expiresIn: null, error: result.error };
    }
    return {
      message: result.data.message,
      provider: result.data.provider,
      expiresIn: result.data.expires_in,
      error: null,
    };
  }

  async callOAuthAPI(provider, params) {
    sanitizeProvider(provider);
    const { result, context } = await this._authFetchWithContext(
      `/auth/oauth/${provider}/call-api`,
      () => {
        const { endpoint, method = 'GET', body = null } = params;
        return { method: 'POST', body: JSON.stringify({ endpoint, method, body }) };
      },
    );

    if (!this._isAuthContextCurrent(context)) {
      return { data: null, error: new AuthSessionChangedError() };
    }

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data.data, error: null };
  }

  // ========================================================================
  // Session Management (User's sessions)
  // ========================================================================

  async getSessions(options = {}) {
    const { result, context } = await this._authFetchWithContext(() => {
      const { page = 1, limit = DEFAULT_SESSIONS_LIMIT } = options;
      const params = new URLSearchParams();
      if (page > 1) {
        params.set('page', page.toString());
      }
      if (limit !== DEFAULT_SESSIONS_LIMIT) {
        params.set('limit', limit.toString());
      }
      const queryString = params.toString();
      return `/auth/user/sessions${queryString ? `?${queryString}` : ''}`;
    });

    if (!this._isAuthContextCurrent(context)) {
      return {
        sessions: null,
        total: 0,
        page: 1,
        limit: DEFAULT_SESSIONS_LIMIT,
        total_pages: 0,
        error: new AuthSessionChangedError(),
      };
    }
    if (!result.ok) {
      return {
        sessions: null,
        total: 0,
        page: 1,
        limit: DEFAULT_SESSIONS_LIMIT,
        total_pages: 0,
        error: result.error,
      };
    }
    return {
      sessions: result.data.sessions,
      total: result.data.total,
      page: result.data.page,
      limit: result.data.limit,
      total_pages: result.data.total_pages,
      error: null,
    };
  }

  async deleteSession(sessionId) {
    const { result, context } = await this._authFetchWithContext(
      `/auth/user/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: 'DELETE',
      },
    );

    const deletesCurrentSession = sessionIdsEqual(
      extractSessionIdFromToken(context.accessToken),
      sessionId,
    );
    if (deletesCurrentSession && (result.ok || result.status === null)) {
      if (!this._clearSessionAtGeneration(context.generation)) {
        const sessionChangedError = new AuthSessionChangedError();
        if (result.error) {
          Object.defineProperty(sessionChangedError, 'cause', {
            configurable: true,
            value: result.error,
            writable: true,
          });
        }
        return { error: sessionChangedError };
      }
      return { error: result.error };
    }
    if (!result.ok) {
      return { error: result.error };
    }
    if (!this._isAuthContextCurrent(context)) {
      return { error: new AuthSessionChangedError() };
    }
    return { error: null };
  }

  async deleteAllOtherSessions() {
    const { result, context } = await this._authFetchWithContext('/auth/user/sessions', {
      method: 'DELETE',
    });

    if (!result.ok) {
      return { error: result.error };
    }
    if (!this._isAuthContextCurrent(context)) {
      return { error: new AuthSessionChangedError() };
    }
    return { error: null };
  }

  // ========================================================================
  // Function Invocation
  // ========================================================================

  async invokeFunction(functionName, payload = {}) {
    if (!functionName || typeof functionName !== 'string') {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: new Error('functionName must be a non-empty string'),
      };
    }
    let operationContext = this._captureAuthContext();
    let requestBody;
    try {
      // Snapshot before yielding so resolution and auth recovery cannot change the payload.
      requestBody = JSON.stringify({ payload });
    } catch (error) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: new VolcanoSystemError(
          error instanceof Error ? error.message : 'Invalid function payload',
          { cause: error },
        ),
      };
    }
    if (
      !this._isAuthContextCurrent(operationContext) ||
      operationContext.operations.pendingSignOut()
    ) {
      return authSessionChangedResult();
    }
    if (this._oauthExchangePromise) {
      await this._completeOAuthExchange();
      operationContext = this._captureAuthContext();
    }
    const useAnonKey = !operationContext.accessToken;
    let resolutionContext = operationContext;
    let resolutionToken = useAnonKey ? this.anonKey : resolutionContext.accessToken;

    let resolvedFunctionId;
    let resolvedInvokeUrl;
    try {
      const resolution = await this._resolveFunctionIdByName(functionName.trim(), {
        authContext: resolutionContext,
        token: resolutionToken,
        useAnonKey,
      });
      resolvedFunctionId = resolution.functionId;
      resolvedInvokeUrl = resolution.invokeUrl;
      resolutionToken = resolution.token;
    } catch (error) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: error instanceof Error ? error : new Error('Failed to resolve function'),
      };
    }

    let invokeUrl;
    try {
      invokeUrl = this._getFunctionInvokeUrl(resolvedFunctionId, resolvedInvokeUrl);
    } catch (error) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: error instanceof Error ? error : new Error('Invalid function identifier'),
      };
    }

    // Read off the response rather than the returned headers object: a Headers
    // instance that only supports get() cannot be enumerated into one, and the
    // retry below must not turn on whether it could be.
    let functionDispatched = false;
    const invokeOnce = async (url, allowRefresh, context, accessToken) => {
      functionDispatched = false;
      if (!accessToken || context.operations.pendingSignOut()) {
        const error = new AuthSessionChangedError();
        return { data: null, status: error.status, headers: {}, version: null, error };
      }
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            // Wrap in { payload } to match the invoke API contract
            // (FunctionInvocationRequest). Sending the raw payload leaves the
            // server's req.Payload empty, so the function only receives
            // __volcano_auth and never the caller's fields.
            body: requestBody,
          },
          this.timeout,
        );

        const versionHeader = getHeaderValue(response, 'x-volcano-version');
        const dispatched = Boolean(getHeaderValue(response, FUNCTION_INVOKED_HEADER));
        functionDispatched = dispatched;
        // A 401 the platform raised means this token was rejected before the
        // function ran, so refreshing can help. A 401 the function chose is its
        // answer, and refreshing would re-run it.
        if (response.status === 401 && allowRefresh && !dispatched) {
          const refreshed = await this._refreshSessionForContext(context);
          if (AuthRefreshDiscardedError.is(refreshed.error)) {
            return {
              data: null,
              status: refreshed.error.status,
              headers: {},
              version: null,
              error: refreshed.error,
            };
          }
          if (!refreshed.error) {
            if (!this._isAuthContextCurrent(context)) {
              const error = new AuthRefreshDiscardedError();
              return {
                data: null,
                status: error.status,
                headers: {},
                version: null,
                error,
              };
            }
            return invokeOnce(url, false, context, this.accessToken);
          }
          if (
            context.operations.refreshClearedSession &&
            this._sessionOperations === context.operations &&
            this._sessionGeneration === context.generation + 1
          ) {
            // Preserve the original rejection only when this refresh cleared its owner.
            operationContext = this._captureAuthContext();
          }
        }

        const data = await parseResponseBody(response);
        const headers = responseHeadersToObject(response);
        const version = versionHeader || null;

        // A non-2xx response the platform produced never reached a running
        // function — a failed or provisioning deploy, a quota refusal, a
        // gateway that could not route. Surface it as a system error, distinct
        // from a function's own error response, which comes back as `data`.
        //
        // The split keys on x-volcano-function-invoked, which the platform sets
        // only after dispatch. It cannot key on x-volcano-version: the server
        // stamps that on every response, errors included, so the branch would
        // never be taken and every platform failure would be returned as though
        // the function had answered. Both headers are CORS-exposed on the
        // invoke domain, without which a browser cannot read either.
        if (!response.ok && !dispatched) {
          const message =
            data && typeof data === 'object' && data.error
              ? data.error
              : `Invoke request failed with status ${response.status}`;
          return {
            data: null,
            status: response.status,
            headers,
            version,
            error: new VolcanoSystemError(message, apiRequestError(response, data, message)),
          };
        }

        return { data, status: response.status, headers, version, error: null };
      } catch (error) {
        // Transport failures (network down, timeout, DNS) are also platform-level.
        return {
          data: null,
          status: null,
          headers: {},
          version: null,
          error:
            error instanceof VolcanoSystemError
              ? error
              : new VolcanoSystemError(error instanceof Error ? error.message : 'Request failed', {
                  cause: error,
                }),
        };
      }
    };

    let invocationContext = this._captureAuthContext();
    if (!this._isAuthContextCurrent(operationContext)) {
      return authSessionChangedResult();
    }
    let token = useAnonKey ? this.anonKey : invocationContext.accessToken;
    let result = await invokeOnce(invokeUrl, !useAnonKey, invocationContext, token);

    // Function can be deleted/recreated, making cached name->id mapping stale.
    // On a platform 404, invalidate and resolve once more before failing. A
    // function that answers 404 itself must be returned as-is: invoking twice
    // would run the caller's side effects twice.
    //
    // The platform sets x-volcano-function-invoked only after dispatch, so its
    // absence is what separates the two. x-volcano-version cannot: the server
    // stamps it on every response, including errors raised before the function
    // is reached, which would make this branch unreachable.
    if (result.status === 404 && !functionDispatched) {
      if (!this._isAuthContextCurrent(operationContext)) {
        return authSessionChangedResult();
      }
      this._clearFunctionResolveCache(functionName.trim(), resolutionToken, useAnonKey);
      try {
        resolutionContext = this._captureAuthContext();
        resolutionToken = useAnonKey ? this.anonKey : resolutionContext.accessToken;
        const resolution = await this._resolveFunctionIdByName(functionName.trim(), {
          authContext: resolutionContext,
          token: resolutionToken,
          useAnonKey,
        });
        resolvedFunctionId = resolution.functionId;
        resolvedInvokeUrl = resolution.invokeUrl;
        invokeUrl = this._getFunctionInvokeUrl(resolvedFunctionId, resolvedInvokeUrl);
        invocationContext = this._captureAuthContext();
        if (!this._isAuthContextCurrent(operationContext)) {
          return authSessionChangedResult();
        }
        token = useAnonKey ? this.anonKey : invocationContext.accessToken;
        result = await invokeOnce(invokeUrl, !useAnonKey, invocationContext, token);
      } catch (error) {
        return {
          data: null,
          status: null,
          headers: {},
          version: null,
          error: error instanceof Error ? error : new Error('Failed to resolve function'),
        };
      }
    }

    if (
      !this._isAuthContextCurrent(operationContext) &&
      !AuthRefreshDiscardedError.is(result.error)
    ) {
      return authSessionChangedResult();
    }
    return result;
  }

  // ========================================================================
  // Durable Executions
  // ========================================================================

  /**
   * Starts a durable execution of a durable function and returns its handle.
   *
   * The durable counterpart of `functions.invoke`, and the only durable
   * operation an application credential may perform: reading a result or
   * stopping an execution is owner-scoped, because an anon key is shared by
   * everyone who loads the page and an execution is addressed by id alone. A
   * durable function that has to report back writes what it produced somewhere
   * the app can read; a backend holding the project's token follows it with
   * `durable.get`.
   */
  async startDurableExecution(functionName, input = {}, options = {}) {
    // Through the same helper as the owner-scoped reads, so a later tightening
    // of the segment rule reaches the start too.
    const { segments, error: segmentError } = durablePathSegments({ functionName });
    if (segmentError) {
      return { data: null, status: null, error: segmentError };
    }

    const executionName = options.executionName;
    if (
      executionName !== undefined &&
      (typeof executionName !== 'string' || !executionName.trim())
    ) {
      return {
        data: null,
        status: null,
        error: new Error('executionName must be a non-empty string when provided'),
      };
    }
    // The name the platform sees is the trimmed one, so the limit is checked
    // against that rather than against what the caller passed.
    if (executionName !== undefined && executionName.trim().length > MAX_EXECUTION_NAME_LENGTH) {
      return {
        data: null,
        status: null,
        error: new Error(`executionName must be at most ${MAX_EXECUTION_NAME_LENGTH} characters`),
      };
    }

    await this._completeOAuthExchange();
    const context = this._captureAuthContext();
    // Same credential rule as an invoke: a signed-in session speaks for its
    // user, otherwise the key the client was built with (anon in a browser, a
    // service key on a server).
    const useAnonKey = !context.accessToken;

    const headers = executionName
      ? { 'X-Volcano-Execution-Name': executionName.trim() }
      : undefined;

    return this._durableResult('Failed to start durable execution', () =>
      this._transport.startDurableExecutionFromApplication(
        segments.functionName,
        input,
        this._generatedOptions(useAnonKey ? 'anon' : 'session', headers),
      ),
    );
  }

  /**
   * Reads a durable execution, including its `result` once it has succeeded.
   * This is how a caller finds out how a started execution went.
   *
   * Owner-scoped, so it takes the project id and needs the project's token: an
   * execution is addressed by its id alone, and an anon key is held by everyone
   * who loads the page. Poll it from your backend, or use the CLI.
   *
   * @param {string} projectId
   * @param {string} functionName - Durable function name, or its id.
   * @param {string} executionId
   */
  async getDurableExecution(projectId, functionName, executionId) {
    const { segments, error } = durablePathSegments({ projectId, functionName, executionId });
    if (error) {
      return { data: null, status: null, error };
    }
    const sessionError = await this._durableOwnerSession();
    if (sessionError) {
      return { data: null, status: null, error: sessionError };
    }
    return this._durableResult('Failed to read durable execution', () =>
      this._transport.getDurableExecution(
        segments.projectId,
        segments.functionName,
        segments.executionId,
        this._generatedOptions('session'),
      ),
    );
  }

  /**
   * Lists a durable function's executions, most recent first.
   *
   * Each entry carries the status the platform last observed rather than a live
   * one; read a single execution for that. Owner-scoped, like
   * `durable.get`.
   *
   * @param {string} projectId
   * @param {string} functionName - Durable function name, or its id.
   * @param {object} [options]
   * @param {string} [options.status] - Only executions in this status.
   * @param {number} [options.page]
   * @param {number} [options.limit]
   */
  async listDurableExecutions(projectId, functionName, options = {}) {
    const { segments, error } = durablePathSegments({ projectId, functionName });
    if (error) {
      return { data: null, status: null, error };
    }
    const sessionError = await this._durableOwnerSession();
    if (sessionError) {
      return { data: null, status: null, error: sessionError };
    }
    const params = {};
    for (const field of ['status', 'page', 'limit']) {
      if (options[field] !== undefined) {
        params[field] = options[field];
      }
    }
    return this._durableResult('Failed to list durable executions', () =>
      this._transport.listDurableExecutions(
        segments.projectId,
        segments.functionName,
        params,
        this._generatedOptions('session'),
      ),
    );
  }

  /**
   * Asks a running execution to stop. Accepted rather than awaited: what
   * resolves here is the execution read back after asking, and it often still
   * says `running`, so poll `durable.get` to see it reach `stopped`. Completed
   * steps are not undone.
   *
   * Owner-scoped, like `durable.get`. Repeating a stop is safe — an execution
   * that has already finished reports the state it is in.
   *
   * @param {string} projectId
   * @param {string} functionName - Durable function name, or its id.
   * @param {string} executionId
   */
  async stopDurableExecution(projectId, functionName, executionId) {
    const { segments, error } = durablePathSegments({ projectId, functionName, executionId });
    if (error) {
      return { data: null, status: null, error };
    }
    const sessionError = await this._durableOwnerSession();
    if (sessionError) {
      return { data: null, status: null, error: sessionError };
    }
    return this._durableResult('Failed to stop durable execution', () =>
      this._transport.stopDurableExecution(
        segments.projectId,
        segments.functionName,
        segments.executionId,
        this._generatedOptions('session'),
      ),
    );
  }

  /**
   * The owner-scoped durable routes carry the project's own token, so without a
   * session there is nothing to send them. Refused here rather than spending a
   * round trip on the 401 the platform would answer, which is how `logs.search`
   * treats the same credential.
   */
  async _durableOwnerSession() {
    await this._completeOAuthExchange();
    if (!this.accessToken) {
      return this._oauthExchangeError || new Error('No active session');
    }
    return null;
  }

  /**
   * The envelope every durable operation answers with. A refusal carries the
   * platform's status rather than throwing, because the status is what tells a
   * caller a deleted function from a cap it has hit.
   */
  async _durableResult(failureMessage, call) {
    try {
      const response = await call();
      return { data: response.data, status: response.status, error: null };
    } catch (error) {
      return {
        data: null,
        status: typeof error?.status === 'number' ? error.status : null,
        // A transport that rejects with a string or a plain object still has to
        // leave the reason recoverable, so it rides as `cause` rather than
        // being replaced by the generic message.
        error: error instanceof Error ? error : new Error(failureMessage, { cause: error }),
      };
    }
  }

  // ========================================================================
  // Session Management (Internal)
  // ========================================================================

  _captureAuthContext() {
    return Object.freeze({
      generation: this._sessionGeneration,
      operations: this._sessionOperations,
      userId: this.currentUser?.id ?? null,
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
    });
  }

  _adoptSessionInMemory(session) {
    this._sessionGeneration += 1;
    this._sessionOperations = new AuthSessionOperations();
    this._oauthExchangeError = null;
    this._pendingUrlAuthNotify = false;
    this.accessToken = session.access_token;
    this.refreshToken = session.refresh_token;
    this.currentUser = session.user;
  }

  _isAuthContextCurrent(context) {
    return context.generation === this._sessionGeneration;
  }

  _setSession(data, expectedGeneration = this._sessionGeneration) {
    if (expectedGeneration !== this._sessionGeneration) {
      return false;
    }

    this._oauthExchangeError = null;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token ?? null;
    this.currentUser = data.user;
    this._sessionGeneration += 1;
    this._sessionOperations = new AuthSessionOperations(data);
    this._pendingUrlAuthNotify = false;

    this._setStorageItem(STORAGE_KEY_ACCESS_TOKEN, this.accessToken);
    if (this.refreshToken) {
      this._setStorageItem(STORAGE_KEY_REFRESH_TOKEN, this.refreshToken);
    } else {
      this._removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);
    }

    this._notifyAuthCallbacks(this.currentUser);
    return true;
  }

  _setRefreshedSession(data, context) {
    if (!this._isAuthContextCurrent(context) || context.refreshToken !== this.refreshToken) {
      return false;
    }

    validateSessionContinuation(data, context, this.currentUser?.id);

    this._oauthExchangeError = null;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.currentUser = data.user;
    this._pendingUrlAuthNotify = false;

    this._setStorageItem(STORAGE_KEY_ACCESS_TOKEN, this.accessToken);
    this._setStorageItem(STORAGE_KEY_REFRESH_TOKEN, this.refreshToken);

    this._notifyAuthCallbacks(this.currentUser);
    return true;
  }

  _clearSession(context) {
    if (!this._isAuthContextCurrent(context) || context.refreshToken !== this.refreshToken) {
      return false;
    }

    return this._clearSessionAtGeneration(context.generation);
  }

  _clearSessionAtGeneration(generation) {
    if (generation !== this._sessionGeneration) {
      return false;
    }

    this._oauthExchangeError = null;
    this._sessionOperations.clearLocalCredentials();
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
    this._sessionGeneration += 1;
    this._pendingUrlAuthNotify = false;

    this._removeStorageItem(STORAGE_KEY_ACCESS_TOKEN);
    this._removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);

    this._notifyAuthCallbacks(null);
    return true;
  }

  _notifyAuthCallbacks(user) {
    if (this._authCallbacks) {
      this._authCallbacks.forEach((cb) => {
        try {
          cb(user);
        } catch (err) {
          console.error('[VolcanoAuth] Error in auth state callback:', err);
        }
      });
    }
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

  _stripOAuthQueryFromUrl(callbackURL) {
    stripOAuthQueryFromUrl(callbackURL);
  }

  _removeOAuthResponseParams(callbackURL, clearHash = true) {
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

  _replaceSessionFromUrl(accessToken, refreshToken) {
    replaceSessionFromUrl(this, accessToken, refreshToken);
  }

  /**
   * Remove the managed-auth tokens from the URL fragment so they do not linger
   * in history, referrers, or bookmarks. Only strips when the fragment is
   * exclusively the hand-off params, to avoid clobbering app hash routing.
   */
  _stripAuthHashFromUrl(params) {
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
  _storeAuthState(nonce, redirectURL = '') {
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

  _getStorageItem(key) {
    return getStorageItem(key);
  }

  _setStorageItem(key, value) {
    setStorageItem(key, value);
  }

  _removeStorageItem(key) {
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
  static __setFunctionResolveCacheMaxEntriesForTests(maxEntries) {
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
