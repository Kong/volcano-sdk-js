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
const DEFAULT_UPLOAD_PART_SIZE = 25 * 1024 * 1024; // 25MB
const DEFAULT_SESSIONS_LIMIT = 20;
const STORAGE_KEY_ACCESS_TOKEN = 'volcano_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'volcano_refresh_token';

// Fragment params used by the managed hosted-auth / OAuth redirect hand-off.
const AUTH_HASH_KEYS = new Set(['access_token', 'refresh_token', 'token_type', 'expires_in']);
const FUNCTION_HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DEFAULT_FUNCTION_NEGATIVE_RESOLVE_TTL_SECONDS = 30;
const GLOBAL_FUNCTION_RESOLVE_STATE_KEY = '__VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__';
const DEFAULT_FUNCTION_RESOLVE_CACHE_MAX_ENTRIES = 1024;
const FUNCTION_RESOLVE_CACHE_PRUNE_INTERVAL_MS = 5000;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Detect if we're running in a browser/client-side environment.
 */
function isBrowser() {
  return typeof window !== 'undefined' && window.document !== undefined;
}

/**
 * Basic provider name sanitization - only alphanumeric and hyphens allowed
 * This is NOT validation (backend validates), just prevents URL injection
 * @param {string} provider - The provider name
 * @throws {Error} If provider contains invalid characters
 */
function sanitizeProvider(provider) {
  if (!provider || typeof provider !== 'string' || !/^[a-z0-9-]+$/.test(provider)) {
    throw new Error(
      'Provider must be a non-empty string containing only lowercase letters, numbers, and hyphens',
    );
  }
}

/**
 * Fetch with timeout using AbortController
 * @param {string} url - The URL to fetch
 * @param {RequestInit} options - Fetch options
 * @param {number} [timeoutMs] - Timeout in milliseconds (default: 60000)
 * @returns {Promise<Response>}
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request timeout after ${timeoutMs}ms`, { cause: error });
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Safely parse JSON from response, returns empty object on failure
 * @param {Response} response
 * @returns {Promise<Object>}
 */
async function safeJsonParse(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function parseResponseBody(response) {
  if (!response) {
    return null;
  }

  if (typeof response.text !== 'function') {
    if (typeof response.json === 'function') {
      try {
        return await response.json();
      } catch {
        return null;
      }
    }
    return null;
  }

  const bodyText = await response.text();
  if (!bodyText) {
    return null;
  }

  const contentType = (getHeaderValue(response, 'content-type') || '').toLowerCase();
  const shouldParseJson =
    contentType.includes('application/json') ||
    bodyText.startsWith('{') ||
    bodyText.startsWith('[');
  if (!shouldParseJson) {
    return bodyText;
  }

  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

function responseHeadersToObject(response) {
  const headers = {};
  if (!response || !response.headers) {
    return headers;
  }
  if (typeof response.headers.forEach === 'function') {
    response.headers.forEach((value, key) => {
      headers[key] = value;
    });
    return headers;
  }
  if (typeof response.headers.entries === 'function') {
    for (const [key, value] of response.headers.entries()) {
      headers[key] = value;
    }
  }
  return headers;
}

function getHeaderValue(response, headerName) {
  if (!response || !response.headers) {
    return null;
  }
  if (typeof response.headers.get === 'function') {
    return response.headers.get(headerName);
  }
  const lowerName = String(headerName).toLowerCase();
  for (const key of Object.keys(response.headers)) {
    if (String(key).toLowerCase() === lowerName) {
      return response.headers[key];
    }
  }
  return null;
}

/**
 * Decode a base64url string to UTF-8 (JWT-safe, Node/browser compatible)
 * @param {string} value
 * @returns {string}
 */
function decodeBase64Url(value) {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = normalized + padding;

  if (typeof atob === 'function') {
    return atob(base64);
  }

  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }

  throw new Error('No base64 decoder available');
}

function getSharedRuntimeObject() {
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
  return {};
}

function getSharedFunctionResolveState() {
  const runtime = getSharedRuntimeObject();
  if (!runtime[GLOBAL_FUNCTION_RESOLVE_STATE_KEY]) {
    runtime[GLOBAL_FUNCTION_RESOLVE_STATE_KEY] = {
      cache: new Map(),
      inFlight: new Map(),
      maxEntries: DEFAULT_FUNCTION_RESOLVE_CACHE_MAX_ENTRIES,
      lastPruneAtMs: 0,
    };
  }
  return runtime[GLOBAL_FUNCTION_RESOLVE_STATE_KEY];
}

function pruneFunctionResolveCache(state, nowMs = Date.now(), force = false) {
  if (!force && nowMs - state.lastPruneAtMs < FUNCTION_RESOLVE_CACHE_PRUNE_INTERVAL_MS) {
    return;
  }
  state.lastPruneAtMs = nowMs;

  for (const [key, value] of state.cache.entries()) {
    if (!value || typeof value.expiresAt !== 'number' || value.expiresAt <= nowMs) {
      state.cache.delete(key);
    }
  }

  if (state.cache.size <= state.maxEntries) {
    return;
  }

  const sortedByExpiry = Array.from(state.cache.entries()).sort(
    (a, b) => (a[1].expiresAt || 0) - (b[1].expiresAt || 0),
  );
  const overflowCount = state.cache.size - state.maxEntries;
  for (let i = 0; i < overflowCount; i += 1) {
    state.cache.delete(sortedByExpiry[i][0]);
  }
}

function clearSharedFunctionResolveStateForTests() {
  const state = getSharedFunctionResolveState();
  state.cache.clear();
  state.inFlight.clear();
  state.maxEntries = DEFAULT_FUNCTION_RESOLVE_CACHE_MAX_ENTRIES;
  state.lastPruneAtMs = 0;
}

function extractRequiredProjectIdFromToken(token) {
  if (!token || typeof token !== 'string') {
    throw new Error('No active session');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('accessToken must be a JWT with project_id claim');
  }
  let payload;
  try {
    payload = JSON.parse(decodeBase64Url(parts[1]));
  } catch {
    throw new Error('accessToken must be a valid JWT with project_id claim');
  }
  if (!payload || typeof payload.project_id !== 'string' || payload.project_id.trim() === '') {
    throw new Error('accessToken missing project_id claim');
  }
  return payload.project_id.trim();
}

function isIPv4Address(hostname) {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

function isIPv6Address(hostname) {
  return hostname.includes(':');
}

function isIPAddress(hostname) {
  return isIPv4Address(hostname) || isIPv6Address(hostname);
}

function sanitizeFunctionIdentifierForHost(identifier) {
  if (!identifier || typeof identifier !== 'string') {
    return null;
  }

  const trimmed = identifier.trim();
  if (!trimmed) {
    return null;
  }

  // DNS host labels are case-insensitive; preserve exact behavior by requiring lowercase.
  if (trimmed !== trimmed.toLowerCase()) {
    return null;
  }

  if (!FUNCTION_HOST_LABEL_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
}

function resolveFunctionInvocationBase(apiUrl) {
  try {
    const parsed = new URL(apiUrl);
    const hostname = parsed.hostname.toLowerCase();

    // Default mapping:
    // api.volcano.dev -> functions.volcano.dev
    // api.staging.volcano.dev -> functions.staging.volcano.dev
    if (hostname === 'localhost' || isIPAddress(hostname)) {
      return {
        protocol: parsed.protocol,
        port: parsed.port,
        domain: 'functions.local.volcano.dev',
      };
    }

    if (!hostname.startsWith('api.')) {
      return null;
    }

    const suffix = hostname.slice(4);
    if (!suffix || isIPAddress(suffix)) {
      return null;
    }

    return {
      protocol: parsed.protocol,
      port: parsed.port,
      domain: `functions.${suffix}`,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch with auth header and refresh retry on 401
 * @param {VolcanoAuth} volcanoAuth
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithAuthRetry(volcanoAuth, url, options = {}) {
  const doFetch = () =>
    fetchWithTimeout(
      url,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${volcanoAuth.accessToken}`,
          ...options.headers,
        },
      },
      volcanoAuth.timeout,
    );

  let response = await doFetch();
  if (response.status === 401) {
    const refreshed = await volcanoAuth.refreshSession();
    if (!refreshed.error) {
      response = await doFetch();
    }
  }

  return response;
}

/**
 * Create an error result object
 * @param {string} message - Error message
 * @param {Object} [extra] - Extra fields to include
 * @returns {Object}
 */
function errorResult(message, extra = {}) {
  return { data: null, error: new Error(message), ...extra };
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
    this.functionInvocationBase = resolveFunctionInvocationBase(this.apiUrl);
    this.anonKey = config.anonKey;
    this.timeout = config.timeout || DEFAULT_TIMEOUT_MS;
    this._currentDatabaseName = null;
    this.currentUser = null;
    this._functionResolveState = getSharedFunctionResolveState();

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
      this._consumeSessionFromUrl();
    }

    // Sub-objects for organization
    this.auth = {
      signUp: this.signUp.bind(this),
      signIn: this.signIn.bind(this),
      signOut: this.signOut.bind(this),
      getUser: this.getUser.bind(this),
      updateUser: this.updateUser.bind(this),
      refreshSession: this.refreshSession.bind(this),
      onAuthStateChange: this.onAuthStateChange.bind(this),
      user: () => this.currentUser,
      // Anonymous user methods
      signUpAnonymous: this.signUpAnonymous.bind(this),
      convertAnonymous: this.convertAnonymous.bind(this),
      // Email confirmation methods
      confirmEmail: this.confirmEmail.bind(this),
      resendConfirmation: this.resendConfirmation.bind(this),
      // Password recovery methods
      forgotPassword: this.forgotPassword.bind(this),
      resetPassword: this.resetPassword.bind(this),
      // Email change methods
      requestEmailChange: this.requestEmailChange.bind(this),
      confirmEmailChange: this.confirmEmailChange.bind(this),
      cancelEmailChange: this.cancelEmailChange.bind(this),
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

    this.storage = {
      from: this.storageBucket.bind(this),
    };
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
    if (!this.accessToken) {
      return { ok: false, status: null, error: new Error('No active session'), data: null };
    }

    return this._authFetchUrl(`${this.apiUrl}${path}`, options);
  }

  async _authFetchUrl(url, options = {}) {
    if (!this.accessToken) {
      return { ok: false, status: null, error: new Error('No active session'), data: null };
    }

    try {
      const response = await fetchWithTimeout(
        url,
        {
          ...options,
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            ...options.headers,
          },
        },
        this.timeout,
      );

      const data = await safeJsonParse(response);

      if (!response.ok) {
        // Try token refresh on 401
        if (response.status === 401 && !options._retried) {
          const refreshed = await this.refreshSession();
          if (!refreshed.error) {
            return this._authFetchUrl(url, { ...options, _retried: true });
          }
          return { ok: false, status: response.status, error: new Error('Session expired'), data };
        }
        return {
          ok: false,
          status: response.status,
          error: new Error(data.error || 'Request failed'),
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

  _getFunctionInvokeUrl(functionIdentifier) {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionIdentifier);
    if (!hostLabel) {
      throw new Error(
        'functionId must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }

    if (!this.functionInvocationBase) {
      throw new Error(
        'apiUrl must be api.<domain> (or localhost/IP for local mode) to use DNS function invocation',
      );
    }

    // Local mode fallback (Option A):
    // resolve function by name, then invoke directly via API path to avoid
    // browser preflight redirects on local wildcard DNS hosts.
    if (this.functionInvocationBase.domain === 'functions.local.volcano.dev') {
      return `${this.apiUrl}/functions/${encodeURIComponent(hostLabel)}/invoke`;
    }

    const portSegment = this.functionInvocationBase.port
      ? `:${this.functionInvocationBase.port}`
      : '';
    return `${this.functionInvocationBase.protocol}//${hostLabel}.${this.functionInvocationBase.domain}${portSegment}/`;
  }

  _functionResolveCacheKey(functionName) {
    const projectScope = extractRequiredProjectIdFromToken(this.accessToken);
    const tokenScope = this.accessToken;
    return `${this.apiUrl}|project:${projectScope}|token:${tokenScope}|${functionName}`;
  }

  _clearFunctionResolveCache(functionName) {
    const cacheKey = this._functionResolveCacheKey(functionName);
    this._functionResolveState.cache.delete(cacheKey);
    this._functionResolveState.inFlight.delete(cacheKey);
  }

  async _resolveFunctionIdByName(functionName) {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionName);
    if (!hostLabel) {
      throw new Error(
        'functionName must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }

    const cacheKey = this._functionResolveCacheKey(hostLabel);
    const now = Date.now();
    pruneFunctionResolveCache(this._functionResolveState, now);
    const cached = this._functionResolveState.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      if (cached.error) {
        throw new Error(cached.error);
      }
      return cached.functionId;
    }
    if (cached) {
      this._functionResolveState.cache.delete(cacheKey);
    }

    const inFlight = this._functionResolveState.inFlight.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }

    const pending = (async () => {
      const resolvePath = `/functions/resolve?name=${encodeURIComponent(hostLabel)}`;
      const result = await this._authFetch(resolvePath, { method: 'GET' });
      if (!result.ok) {
        if (result.status === 404) {
          this._functionResolveState.cache.set(cacheKey, {
            functionId: null,
            error: 'function not found',
            expiresAt: Date.now() + DEFAULT_FUNCTION_NEGATIVE_RESOLVE_TTL_SECONDS * 1000,
          });
          pruneFunctionResolveCache(this._functionResolveState, Date.now(), true);
        }
        throw result.error || new Error('Failed to resolve function');
      }

      const resolvedId = sanitizeFunctionIdentifierForHost(result.data && result.data.function_id);
      if (!resolvedId) {
        throw new Error('Resolve response missing valid function_id');
      }

      const ttlRaw = Number(result.data && result.data.cache_ttl_seconds);
      if (!Number.isFinite(ttlRaw) || ttlRaw <= 0) {
        throw new Error('Resolve response missing valid cache_ttl_seconds');
      }
      const ttlSeconds = ttlRaw;

      this._functionResolveState.cache.set(cacheKey, {
        functionId: resolvedId,
        error: null,
        expiresAt: Date.now() + ttlSeconds * 1000,
      });
      pruneFunctionResolveCache(this._functionResolveState, Date.now(), true);
      return resolvedId;
    })();

    this._functionResolveState.inFlight.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      this._functionResolveState.inFlight.delete(cacheKey);
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
        return { ok: false, error: new Error(data.error || 'Request failed'), data };
      }

      return { ok: true, data, error: null };
    } catch (error) {
      return {
        ok: false,
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

  async signUp({ email, password, metadata = {} }) {
    const result = await this._anonFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, user_metadata: metadata }),
    });

    if (!result.ok) {
      return { user: null, session: null, error: result.error };
    }

    this._setSession(result.data);
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

  async signIn({ email, password }) {
    const result = await this._anonFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (!result.ok) {
      return { user: null, session: null, error: result.error };
    }

    this._setSession(result.data);
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

  async signOut() {
    if (this.refreshToken) {
      try {
        await this._anonFetch('/auth/logout', {
          method: 'POST',
          body: JSON.stringify({ refresh_token: this.refreshToken }),
        });
      } catch (err) {
        console.warn('[VolcanoAuth] Logout request failed:', err.message);
      }
    }
    this._clearSession();
    return { error: null };
  }

  async getUser() {
    // Transparently adopt a session handed off by the managed hosted auth pages
    // (tokens in the URL fragment) so callers only ever need getUser().
    const adoptedFromUrl = this._consumeSessionFromUrl();

    const result = await this._authFetch('/auth/user');

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user;
    if (adoptedFromUrl) {
      this._notifyAuthCallbacks(this.currentUser);
    }
    return { user: result.data.user, error: null };
  }

  async updateUser({ password, metadata }) {
    const result = await this._authFetch('/auth/user', {
      method: 'PUT',
      body: JSON.stringify({ password, user_metadata: metadata }),
    });

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  async refreshSession() {
    if (!this.refreshToken) {
      return { session: null, error: new Error('No refresh token') };
    }

    try {
      const result = await this._anonFetch('/auth/refresh', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: this.refreshToken }),
      });

      if (!result.ok) {
        this._clearSession();
        return { session: null, error: result.error };
      }

      this._setSession(result.data);
      return {
        session: {
          access_token: result.data.access_token,
          refresh_token: result.data.refresh_token,
          expires_in: result.data.expires_in,
        },
        error: null,
      };
    } catch (error) {
      this._clearSession();
      return { session: null, error: error instanceof Error ? error : new Error('Refresh failed') };
    }
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

  async signUpAnonymous(metadata = {}) {
    const result = await this._anonFetch('/auth/signup-anonymous', {
      method: 'POST',
      body: JSON.stringify({ user_metadata: metadata }),
    });

    if (!result.ok) {
      return { user: null, session: null, error: result.error };
    }

    this._setSession(result.data);
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

  async convertAnonymous({ email, password, metadata = {} }) {
    const result = await this._authFetch('/auth/user/convert-anonymous', {
      method: 'POST',
      body: JSON.stringify({ email, password, user_metadata: metadata }),
    });

    if (!result.ok) {
      return { user: null, error: result.error };
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
    return { message: result.data.message, error: null };
  }

  async resendConfirmation(email) {
    const result = await this._anonFetch('/auth/resend-confirmation', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message, error: null };
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
    return { message: result.data.message, error: null };
  }

  async resetPassword({ token, newPassword }) {
    const result = await this._anonFetch('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, new_password: newPassword }),
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message, error: null };
  }

  // ========================================================================
  // Email Change Methods
  // ========================================================================

  async requestEmailChange(newEmail) {
    const result = await this._authFetch('/auth/user/change-email', {
      method: 'POST',
      body: JSON.stringify({ new_email: newEmail }),
    });

    if (!result.ok) {
      return { message: null, newEmail: null, error: result.error };
    }
    return {
      message: result.data.message,
      newEmail: result.data.new_email,
      emailChangeToken: result.data.email_change_token,
      error: null,
    };
  }

  async confirmEmailChange(emailChangeToken) {
    const result = await this._authFetch('/auth/user/confirm-email-change', {
      method: 'POST',
      body: JSON.stringify({ email_change_token: emailChangeToken }),
    });

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  async cancelEmailChange() {
    const result = await this._authFetch('/auth/user/cancel-email-change', {
      method: 'DELETE',
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message, error: null };
  }

  // ========================================================================
  // OAuth / SSO Authentication
  // ========================================================================

  signInWithOAuth(provider) {
    sanitizeProvider(provider);
    if (!isBrowser()) {
      throw new Error(
        'OAuth sign-in is only available in browser environment. Use server-side auth flow for SSR.',
      );
    }
    const oauthUrl = `${this.apiUrl}/auth/oauth/${provider}/authorize?anon_key=${encodeURIComponent(this.anonKey)}`;
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
    const result = await this._authFetch(`/auth/oauth/${provider}/link`, {
      method: 'POST',
    });

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data, error: null };
  }

  async unlinkOAuthProvider(provider) {
    sanitizeProvider(provider);
    const result = await this._authFetch(`/auth/oauth/${provider}/unlink`, {
      method: 'DELETE',
    });

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  async getLinkedOAuthProviders() {
    const result = await this._authFetch('/auth/oauth/providers');

    if (!result.ok) {
      return { providers: null, error: result.error };
    }
    return { providers: result.data.providers || [], error: null };
  }

  async refreshOAuthToken(provider) {
    sanitizeProvider(provider);
    const result = await this._authFetch(`/auth/oauth/${provider}/refresh-token`, {
      method: 'POST',
    });

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
    const result = await this._authFetch(`/auth/oauth/${provider}/token`);

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

  async callOAuthAPI(provider, { endpoint, method = 'GET', body = null }) {
    sanitizeProvider(provider);
    const result = await this._authFetch(`/auth/oauth/${provider}/call-api`, {
      method: 'POST',
      body: JSON.stringify({ endpoint, method, body }),
    });

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data.data, error: null };
  }

  // ========================================================================
  // Session Management (User's sessions)
  // ========================================================================

  async getSessions(options = {}) {
    const { page = 1, limit = DEFAULT_SESSIONS_LIMIT } = options;
    const params = new URLSearchParams();
    if (page > 1) {
      params.set('page', page.toString());
    }
    if (limit !== DEFAULT_SESSIONS_LIMIT) {
      params.set('limit', limit.toString());
    }

    const queryString = params.toString();
    const url = `/auth/user/sessions${queryString ? `?${queryString}` : ''}`;
    const result = await this._authFetch(url);

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
    const result = await this._authFetch(`/auth/user/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  async deleteAllOtherSessions() {
    const result = await this._authFetch('/auth/user/sessions', {
      method: 'DELETE',
    });

    if (!result.ok) {
      return { error: result.error };
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
    if (!this.accessToken) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: new Error('No active session'),
      };
    }
    if (!this.functionInvocationBase) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: new Error(
          'apiUrl must be api.<domain> (or localhost/IP for local mode) to use DNS function invocation',
        ),
      };
    }

    let resolvedFunctionId;
    try {
      resolvedFunctionId = await this._resolveFunctionIdByName(functionName.trim());
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
      invokeUrl = this._getFunctionInvokeUrl(resolvedFunctionId);
    } catch (error) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: error instanceof Error ? error : new Error('Invalid function identifier'),
      };
    }

    const invokeOnce = async (url, allowRefresh) => {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
          },
          this.timeout,
        );

        const versionHeader = getHeaderValue(response, 'x-volcano-version');
        if (response.status === 401 && allowRefresh && !versionHeader) {
          const refreshed = await this.refreshSession();
          if (!refreshed.error) {
            return invokeOnce(url, false);
          }
        }

        const data = await parseResponseBody(response);
        const headers = responseHeadersToObject(response);
        const version = versionHeader || null;

        if (!response.ok && !versionHeader) {
          const message =
            data && typeof data === 'object' && data.error
              ? data.error
              : `Invoke request failed with status ${response.status}`;
          return {
            data: null,
            status: response.status,
            headers,
            version,
            error: new Error(message),
          };
        }

        return { data, status: response.status, headers, version, error: null };
      } catch (error) {
        return {
          data: null,
          status: null,
          headers: {},
          version: null,
          error: error instanceof Error ? error : new Error('Request failed'),
        };
      }
    };

    let result = await invokeOnce(invokeUrl, true);

    // Function can be deleted/recreated, making cached name->id mapping stale.
    // On 404, invalidate and resolve once more before failing.
    if (!result.ok && result.status === 404) {
      this._clearFunctionResolveCache(functionName.trim());
      try {
        resolvedFunctionId = await this._resolveFunctionIdByName(functionName.trim());
        invokeUrl = this._getFunctionInvokeUrl(resolvedFunctionId);
        result = await invokeOnce(invokeUrl, true);
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

    return result;
  }

  // ========================================================================
  // Session Management (Internal)
  // ========================================================================

  _setSession(data) {
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.currentUser = data.user;

    this._setStorageItem(STORAGE_KEY_ACCESS_TOKEN, this.accessToken);
    this._setStorageItem(STORAGE_KEY_REFRESH_TOKEN, this.refreshToken);

    this._notifyAuthCallbacks(this.currentUser);
  }

  _clearSession() {
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;

    this._removeStorageItem(STORAGE_KEY_ACCESS_TOKEN);
    this._removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);

    this._notifyAuthCallbacks(null);
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

  /**
   * Returns true when the current browser URL fragment carries a managed-auth
   * session hand-off (i.e. an access_token from a hosted login/signup redirect).
   * Cheap peek that does not mutate state.
   */
  _hasSessionInUrl() {
    if (!isBrowser()) {
      return false;
    }
    try {
      const hash = (window.location && window.location.hash) || '';
      return hash.includes('access_token');
    } catch {
      return false;
    }
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
    if (!this._hasSessionInUrl()) {
      return false;
    }

    let params;
    try {
      params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    } catch {
      return false;
    }

    const accessToken = params.get('access_token');
    if (!accessToken) {
      return false;
    }
    const refreshToken = params.get('refresh_token');

    this.accessToken = accessToken;
    if (refreshToken) {
      this.refreshToken = refreshToken;
    }
    this._setStorageItem(STORAGE_KEY_ACCESS_TOKEN, this.accessToken);
    if (this.refreshToken) {
      this._setStorageItem(STORAGE_KEY_REFRESH_TOKEN, this.refreshToken);
    }

    this._stripAuthHashFromUrl(params);
    return true;
  }

  /**
   * Remove the managed-auth tokens from the URL fragment so they do not linger
   * in history, referrers, or bookmarks. Only strips when the fragment is
   * exclusively the hand-off params, to avoid clobbering app hash routing.
   */
  _stripAuthHashFromUrl(params) {
    try {
      const onlyAuthParams = Array.from(params.keys()).every((key) => AUTH_HASH_KEYS.has(key));
      if (!onlyAuthParams) {
        return;
      }
      if (!window.history || typeof window.history.replaceState !== 'function') {
        return;
      }
      const loc = window.location;
      const cleanUrl = (loc.pathname || '/') + (loc.search || '');
      window.history.replaceState(window.history.state, '', cleanUrl);
    } catch {
      // best-effort; leaving the fragment in place is non-fatal
    }
  }

  // ========================================================================
  // Storage Helpers (Browser/Node.js compatible)
  // ========================================================================

  _getStorageItem(key) {
    if (isBrowser()) {
      return window.localStorage.getItem(key);
    }
    return null;
  }

  _setStorageItem(key, value) {
    if (isBrowser()) {
      window.localStorage.setItem(key, value);
    }
  }

  _removeStorageItem(key) {
    if (isBrowser()) {
      window.localStorage.removeItem(key);
    }
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize() {
    // getUser() also adopts a managed-auth session from the URL fragment when
    // present, so trigger it if there is a stored session or a redirect hand-off.
    if (this.accessToken || this.refreshToken || this._hasSessionInUrl()) {
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
// Shared Filter Mixin - Used by QueryBuilder and MutationBuilder
// ============================================================================

const FilterMixin = {
  eq(column, value) {
    this.filters.push({ column, operator: 'eq', value });
    return this;
  },
  neq(column, value) {
    this.filters.push({ column, operator: 'neq', value });
    return this;
  },
  gt(column, value) {
    this.filters.push({ column, operator: 'gt', value });
    return this;
  },
  gte(column, value) {
    this.filters.push({ column, operator: 'gte', value });
    return this;
  },
  lt(column, value) {
    this.filters.push({ column, operator: 'lt', value });
    return this;
  },
  lte(column, value) {
    this.filters.push({ column, operator: 'lte', value });
    return this;
  },
  like(column, pattern) {
    this.filters.push({ column, operator: 'like', value: pattern });
    return this;
  },
  ilike(column, pattern) {
    this.filters.push({ column, operator: 'ilike', value: pattern });
    return this;
  },
  is(column, value) {
    this.filters.push({ column, operator: 'is', value });
    return this;
  },
  in(column, values) {
    this.filters.push({ column, operator: 'in', value: values });
    return this;
  },
};

// ============================================================================
// QueryBuilder - For SELECT operations
// ============================================================================

class QueryBuilder {
  constructor(volcanoAuth, table, databaseName) {
    this.volcanoAuth = volcanoAuth;
    this.table = table;
    this.databaseName = databaseName;
    this.selectColumns = [];
    this.filters = [];
    this.orderClauses = [];
    this.limitValue = null;
    this.offsetValue = null;
  }

  select(columns) {
    if (columns === '*') {
      this.selectColumns = [];
    } else if (Array.isArray(columns)) {
      this.selectColumns = columns;
    } else {
      this.selectColumns = columns.split(',').map((c) => c.trim());
    }
    return this;
  }

  order(column, options = {}) {
    this.orderClauses.push({
      column,
      ascending: options.ascending !== false,
    });
    return this;
  }

  limit(count) {
    this.limitValue = count;
    return this;
  }

  offset(count) {
    this.offsetValue = count;
    return this;
  }

  async execute() {
    if (!this.volcanoAuth.accessToken) {
      return errorResult('No active session. Please sign in first.', { count: 0 });
    }

    if (!this.databaseName) {
      return errorResult('Database name not set. Use .database(databaseName) first.', { count: 0 });
    }

    const requestBody = { table: this.table };
    if (this.selectColumns.length > 0) {
      requestBody.select = this.selectColumns;
    }
    if (this.filters.length > 0) {
      requestBody.filters = this.filters;
    }
    if (this.orderClauses.length > 0) {
      requestBody.order = this.orderClauses;
    }
    if (this.limitValue !== null) {
      requestBody.limit = this.limitValue;
    }
    if (this.offsetValue !== null) {
      requestBody.offset = this.offsetValue;
    }

    try {
      const response = await fetchWithAuthRetry(
        this.volcanoAuth,
        `${this.volcanoAuth.apiUrl}/databases/${encodeURIComponent(this.databaseName)}/query/select`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      const result = await safeJsonParse(response);

      if (!response.ok) {
        return errorResult(result.error || 'Query failed', { count: 0 });
      }

      return { data: result.data, error: null, count: result.count || result.data.length };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Query failed'),
        count: 0,
      };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

Object.assign(QueryBuilder.prototype, FilterMixin);

// ============================================================================
// MutationBuilder - Unified builder for INSERT, UPDATE, DELETE
// ============================================================================

class MutationBuilder {
  constructor(volcanoAuth, table, databaseName, operation, values) {
    this.volcanoAuth = volcanoAuth;
    this.table = table;
    this.databaseName = databaseName;
    this.operation = operation;
    this.values = values;
    this.filters = [];
  }

  async execute() {
    if (!this.volcanoAuth.accessToken) {
      return errorResult('No active session. Please sign in first.');
    }

    if (!this.databaseName) {
      return errorResult('Database name not set. Use .database(databaseName) first.');
    }

    const requestBody = { table: this.table };
    if (this.values) {
      requestBody.values = this.values;
    }
    if (this.filters.length > 0) {
      requestBody.filters = this.filters;
    }

    try {
      const response = await fetchWithAuthRetry(
        this.volcanoAuth,
        `${this.volcanoAuth.apiUrl}/databases/${encodeURIComponent(this.databaseName)}/query/${encodeURIComponent(this.operation)}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        },
      );

      const result = await safeJsonParse(response);

      if (!response.ok) {
        return errorResult(result.error || `${this.operation} failed`);
      }

      return { data: result.data, error: null };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(`${this.operation} failed`),
      };
    }
  }

  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
}

Object.assign(MutationBuilder.prototype, FilterMixin);

// ============================================================================
// StorageFileApi - For storage operations on a specific bucket
// ============================================================================

class StorageFileApi {
  constructor(volcanoAuth, bucketName) {
    this.volcanoAuth = volcanoAuth;
    this.bucketName = bucketName;
  }

  /**
   * Check if user is authenticated
   * @private
   */
  _checkAuth() {
    if (!this.volcanoAuth.accessToken) {
      return errorResult('No active session. Please sign in first.');
    }
    return null;
  }

  /**
   * Build a storage URL for the given path
   * @private
   */
  _buildUrl(path) {
    return `${this.volcanoAuth.apiUrl}/storage/${encodeURIComponent(this.bucketName)}/${this._encodePath(path)}`;
  }

  /**
   * Encode a storage path for use in URLs
   * @private
   */
  _encodePath(path) {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  /**
   * Make an authenticated storage request
   * @private
   */
  async _storageRequest(url, options = {}) {
    try {
      const response = await fetchWithAuthRetry(this.volcanoAuth, url, options);

      // For blob responses (downloads), handle separately
      if (options.responseType === 'blob') {
        if (!response.ok) {
          const errorData = await safeJsonParse(response);
          return { data: null, error: new Error(errorData.error || 'Request failed') };
        }
        const blob = await response.blob();
        return { data: blob, error: null };
      }

      const data = await safeJsonParse(response);

      if (!response.ok) {
        return { data: null, error: new Error(data.error || 'Request failed') };
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Request failed') };
    }
  }

  /**
   * Upload a file to the bucket
   */
  async upload(path, fileBody, options = {}) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    try {
      const formData = new FormData();
      let file;

      if (fileBody instanceof File) {
        file = fileBody;
      } else if (fileBody instanceof Blob || fileBody instanceof ArrayBuffer) {
        const contentType = options.contentType || 'application/octet-stream';
        file = new File([fileBody], path.split('/').pop() || 'file', { type: contentType });
      } else {
        return errorResult('Invalid file body type. Expected File, Blob, or ArrayBuffer.');
      }

      formData.append('file', file);

      const response = await fetchWithAuthRetry(this.volcanoAuth, this._buildUrl(path), {
        method: 'POST',
        body: formData,
      });

      const data = await safeJsonParse(response);

      if (!response.ok) {
        return errorResult(data.error || 'Upload failed');
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Upload failed') };
    }
  }

  /**
   * Download a file from the bucket
   */
  async download(path, options = {}) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    const headers = {};
    if (options.range) {
      headers.Range = options.range;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'GET',
      headers,
      responseType: 'blob',
    });
  }

  /**
   * List files in the bucket
   */
  async list(prefix = '', options = {}) {
    const authError = this._checkAuth();
    if (authError) {
      return { ...authError, nextCursor: null };
    }

    const params = new URLSearchParams();
    if (prefix) {
      params.set('prefix', prefix);
    }
    if (options.limit) {
      params.set('limit', String(options.limit));
    }
    if (options.cursor) {
      params.set('cursor', options.cursor);
    }

    const queryString = params.toString();
    const url = `${this.volcanoAuth.apiUrl}/storage/${encodeURIComponent(this.bucketName)}${queryString ? `?${queryString}` : ''}`;

    const result = await this._storageRequest(url, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (result.error) {
      return { data: null, error: result.error, nextCursor: null };
    }

    return {
      data: result.data.objects || [],
      error: null,
      nextCursor: result.data.next_cursor || null,
    };
  }

  /**
   * Delete one or more files from the bucket
   */
  async remove(paths) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    const pathList = Array.isArray(paths) ? paths : [paths];
    const errors = [];
    const deleted = [];

    for (const path of pathList) {
      const result = await this._storageRequest(this._buildUrl(path), {
        method: 'DELETE',
      });

      if (result.error) {
        errors.push({ path, error: result.error.message });
      } else {
        deleted.push(path);
      }
    }

    if (errors.length > 0) {
      return {
        data: { deleted },
        error: new Error(
          `Failed to delete ${errors.length} file(s): ${errors.map((e) => e.path).join(', ')}`,
        ),
      };
    }

    return { data: { deleted }, error: null };
  }

  /**
   * Move/rename a file within the bucket
   */
  async move(fromPath, toPath) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(
      `${this.volcanoAuth.apiUrl}/storage/${encodeURIComponent(this.bucketName)}/move`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      },
    );
  }

  /**
   * Copy a file within the bucket
   */
  async copy(fromPath, toPath) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(
      `${this.volcanoAuth.apiUrl}/storage/${encodeURIComponent(this.bucketName)}/copy`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: fromPath, to: toPath }),
      },
    );
  }

  /**
   * Get the public URL for a file (only works for files with is_public=true)
   */
  getPublicUrl(path) {
    try {
      const parts = this.volcanoAuth.anonKey.split('.');
      if (parts.length !== 3) {
        return errorResult('Invalid anon key format');
      }

      const payload = JSON.parse(decodeBase64Url(parts[1]));
      const projectId = payload.project_id;

      if (!projectId) {
        return errorResult('Project ID not found in anon key');
      }

      const encodedPath = this._encodePath(path);
      const publicUrl = `${this.volcanoAuth.apiUrl}/public/${projectId}/${encodeURIComponent(this.bucketName)}/${encodedPath}`;
      return { data: { publicUrl }, error: null };
    } catch (error) {
      return errorResult(
        `Failed to parse anon key: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Update the visibility (public/private) of a file
   */
  async updateVisibility(path, isPublic) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(`${this._buildUrl(path)}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
    });
  }

  // ========================================================================
  // Resumable Upload Methods
  // ========================================================================

  async createUploadSession(path, options) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    if (!options || !options.totalSize) {
      return errorResult('totalSize is required');
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: path.split('/').pop() || path,
        content_type: options.contentType || 'application/octet-stream',
        total_size: options.totalSize,
        part_size: options.partSize,
      }),
    });
  }

  async uploadPart(path, sessionId, partNumber, partData) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Session': sessionId,
        'X-Part-Number': String(partNumber),
      },
      body: partData,
    });
  }

  async completeUploadSession(path, sessionId) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Session': sessionId,
        'X-Upload-Complete': 'true',
      },
      body: JSON.stringify({}),
    });
  }

  async getUploadSession(path, sessionId) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'GET',
      headers: { 'X-Upload-Session': sessionId },
    });
  }

  async abortUploadSession(path, sessionId) {
    const authError = this._checkAuth();
    if (authError) {
      return { error: authError.error };
    }

    const result = await this._storageRequest(this._buildUrl(path), {
      method: 'DELETE',
      headers: { 'X-Upload-Session': sessionId },
    });

    return { error: result.error };
  }

  /**
   * Upload a large file using resumable upload with automatic chunking
   */
  async uploadResumable(path, fileBody, options = {}) {
    const authError = this._checkAuth();
    if (authError) {
      return authError;
    }

    const totalSize = fileBody.size;
    const contentType =
      options.contentType ||
      (fileBody instanceof File ? fileBody.type : 'application/octet-stream') ||
      'application/octet-stream';
    const partSize = options.partSize || DEFAULT_UPLOAD_PART_SIZE;
    const onProgress = options.onProgress;

    try {
      const { data: session, error: sessionError } = await this.createUploadSession(path, {
        totalSize,
        contentType,
        partSize,
      });

      if (sessionError) {
        return { data: null, error: sessionError };
      }

      const sessionId = session.session_id;
      const totalParts = session.total_parts;
      const actualPartSize = session.part_size;

      let uploaded = 0;
      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * actualPartSize;
        const end = Math.min(start + actualPartSize, totalSize);
        const partData = fileBody.slice(start, end);

        const { error: partError } = await this.uploadPart(path, sessionId, partNumber, partData);

        if (partError) {
          const { error: abortError } = await this.abortUploadSession(path, sessionId);
          if (abortError) {
            console.warn(
              `[Storage] Failed to abort upload session ${sessionId}:`,
              abortError.message,
            );
          }
          return { data: null, error: partError };
        }

        uploaded = end;
        if (onProgress) {
          onProgress(uploaded, totalSize);
        }
      }

      return this.completeUploadSession(path, sessionId);
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error('Resumable upload failed'),
      };
    }
  }
}

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
  const module = await import('./realtime.js');
  return {
    VolcanoRealtime: module.VolcanoRealtime,
    RealtimeChannel: module.RealtimeChannel,
  };
}

// ============================================================================
// Exports
// ============================================================================

// Browser global exports
if (typeof window !== 'undefined') {
  window.VolcanoAuth = VolcanoAuth;
  window.QueryBuilder = QueryBuilder;
  window.StorageFileApi = StorageFileApi;
  window.isBrowser = isBrowser;
  window.loadRealtime = loadRealtime;
}

// CommonJS exports
if (typeof module !== 'undefined' && module.exports !== undefined) {
  module.exports = VolcanoAuth;
  module.exports.VolcanoAuth = VolcanoAuth;
  module.exports.default = VolcanoAuth;
  module.exports.QueryBuilder = QueryBuilder;
  module.exports.StorageFileApi = StorageFileApi;
  module.exports.isBrowser = isBrowser;
  module.exports.loadRealtime = loadRealtime;
}

// AMD exports
if (typeof define === 'function' && define.amd) {
  define([], () => {
    return VolcanoAuth;
  });
}

// ES Module exports (handled by rollup, but define for clarity)
export { isBrowser, loadRealtime, QueryBuilder, StorageFileApi, VolcanoAuth };
export default VolcanoAuth;
