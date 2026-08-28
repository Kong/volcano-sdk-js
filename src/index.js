import {
  acquireProjectLock,
  authCancelEmailChange,
  authConfirmEmail,
  authConfirmEmailChange,
  authConvertAnonymous,
  authDeleteAllMySessions,
  authDeleteMySession,
  authForgotPassword,
  authGetMySessions,
  authGetUser,
  authLinkOAuthProvider,
  authListOAuthProviders,
  authLogout,
  authOAuthExchange,
  authRefresh,
  authRequestEmailChange,
  authResendConfirmation,
  authResetPassword,
  authSignin,
  authSignup,
  authSignupAnonymous,
  authUnlinkOAuthProvider,
  authUpdateUser,
  callOAuthProviderAPI,
  downloadStorageObject,
  getOAuthProviderToken,
  queryDatabaseSelect,
  refreshOAuthProviderToken,
  releaseProjectLock,
  uploadStorageObject,
} from './generated-runtime/client.js';

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
// sessionStorage key holding the one-time RP nonce that binds a managed/OAuth
// redirect session to the flow this client initiated (login-CSRF defense).
const STORAGE_KEY_AUTH_STATE = 'volcano_auth_state';
const STORAGE_KEY_AUTH_REDIRECT = 'volcano_auth_redirect_url';

// Fragment params produced by the managed hosted-auth / OAuth redirect hand-off.
// Used to decide when the URL fragment is safe to strip after adopting a session:
// the fragment is only cleared when every key is one of these, so an app's own
// hash routing is never clobbered. Includes the standard OAuth redirect keys
// (state/error) so tokens are still removed when they ride alongside them.
const AUTH_HASH_KEYS = new Set([
  'access_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'state',
  'error',
  'error_description',
]);
const OAUTH_RESPONSE_QUERY_KEYS = new Set([
  'code',
  'state',
  'error',
  'error_description',
  'error_uri',
  'iss',
  'vh_state',
]);
const FUNCTION_HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const DEFAULT_FUNCTION_NEGATIVE_RESOLVE_TTL_SECONDS = 30;
const GLOBAL_FUNCTION_RESOLVE_STATE_KEY = '__VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__';
const DEFAULT_FUNCTION_RESOLVE_CACHE_MAX_ENTRIES = 1024;
const FUNCTION_RESOLVE_CACHE_PRUNE_INTERVAL_MS = 5000;
const MAX_LOCK_TTL_SECONDS = 90 * 24 * 60 * 60;
const MAX_LOCK_RENEWAL_DELAY_MS = 24 * 60 * 60 * 1000;
// Both codes mean the lock is unavailable right now rather than that the request
// failed: another live holder, or this caller's own lapsed lease still inside
// the takeover grace window.
const LOCK_CONTENTION_CODES = new Set(['lock_held', 'lock_ownership_lost']);
const GENERATED_TRANSPORT = {
  acquireProjectLock,
  authCancelEmailChange,
  authConfirmEmail,
  authConfirmEmailChange,
  authConvertAnonymous,
  authDeleteAllMySessions,
  authDeleteMySession,
  authForgotPassword,
  authGetMySessions,
  authGetUser,
  authLinkOAuthProvider,
  authListOAuthProviders,
  authLogout,
  authOAuthExchange,
  authRefresh,
  authRequestEmailChange,
  authResendConfirmation,
  authResetPassword,
  authSignin,
  authSignup,
  authSignupAnonymous,
  authUnlinkOAuthProvider,
  authUpdateUser,
  callOAuthProviderAPI,
  downloadStorageObject,
  getOAuthProviderToken,
  queryDatabaseSelect,
  releaseProjectLock,
  refreshOAuthProviderToken,
  uploadStorageObject,
};

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

async function parseJsonOnlyResponse(response) {
  if (typeof response.json !== 'function') {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function looksLikeJson(response, bodyText) {
  const contentType = (getHeaderValue(response, 'content-type') || '').toLowerCase();
  return (
    contentType.includes('application/json') || bodyText.startsWith('{') || bodyText.startsWith('[')
  );
}

function parseTextBody(response, bodyText) {
  if (!looksLikeJson(response, bodyText)) {
    return bodyText;
  }
  try {
    return JSON.parse(bodyText);
  } catch {
    return bodyText;
  }
}

async function parseResponseBody(response) {
  if (!response) {
    return null;
  }

  if (typeof response.text !== 'function') {
    return parseJsonOnlyResponse(response);
  }

  const bodyText = await response.text();
  if (!bodyText) {
    return null;
  }

  return parseTextBody(response, bodyText);
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
 * Error raised when a function *invocation* fails at the platform layer rather
 * than inside the function's own code — the call reached (or tried to reach)
 * the invocation gateway but was never served: the deploy is failed/provisioning,
 * the gateway is unavailable (a non-2xx response with no `x-volcano-version`
 * header), or the network call itself failed (timeout/DNS/offline).
 *
 * Detect it with `VolcanoSystemError.is(error)` (or `error?.isSystemError ===
 * true`). Prefer either over `error instanceof VolcanoSystemError`, which can be
 * `false` when an app bundles more than one copy of the SDK (class identities
 * differ). `.status` is the blocked HTTP status, or `null` for transport
 * failures.
 *
 * NOT a system error, and therefore a plain `Error` (or not an error at all):
 * a running function's own non-2xx response (surfaced as `data` with `error`
 * null), and pre-flight / name-resolution failures — invalid function name,
 * no active session, misconfigured `apiUrl`, function-not-found — which stay
 * plain `Error`s since they are caller/config issues, not platform outages.
 */
class VolcanoSystemError extends Error {
  constructor(message, options = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    // Non-enumerable (like native Error's own props) so `JSON.stringify(err)`
    // stays `{}` and consumer log/redaction/snapshot pipelines don't suddenly
    // see new keys. Still read normally: `err.isSystemError`, `err.status`.
    Object.defineProperty(this, 'isSystemError', { value: true });
    Object.defineProperty(this, 'status', { value: options.status ?? null });
  }

  /**
   * Type guard: true when `err` is a platform-layer invocation failure. Prefer
   * this over `instanceof` — it duck-types on the `isSystemError` brand, so it
   * holds across duplicate SDK copies in a bundle.
   * @param {unknown} err
   * @returns {boolean}
   */
  static is(err) {
    return Boolean(err) && err.isSystemError === true;
  }
}
// `name` on the prototype (non-enumerable, inherited) matches native Error and
// keeps it out of JSON.stringify output.
VolcanoSystemError.prototype.name = 'VolcanoSystemError';

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

function isExpiredCacheEntry(value, nowMs) {
  return !value || typeof value.expiresAt !== 'number' || value.expiresAt <= nowMs;
}

function deleteExpiredCacheEntries(cache, nowMs) {
  for (const [key, value] of cache.entries()) {
    if (isExpiredCacheEntry(value, nowMs)) {
      cache.delete(key);
    }
  }
}

function deleteCacheOverflow(state) {
  const sortedByExpiry = Array.from(state.cache.entries()).sort(
    (a, b) => (a[1].expiresAt || 0) - (b[1].expiresAt || 0),
  );
  const overflowCount = state.cache.size - state.maxEntries;
  for (const [key] of sortedByExpiry.slice(0, overflowCount)) {
    state.cache.delete(key);
  }
}

function pruneFunctionResolveCache(state, nowMs = Date.now(), force = false) {
  if (!force && nowMs - state.lastPruneAtMs < FUNCTION_RESOLVE_CACHE_PRUNE_INTERVAL_MS) {
    return;
  }
  state.lastPruneAtMs = nowMs;

  deleteExpiredCacheEntries(state.cache, nowMs);

  if (state.cache.size <= state.maxEntries) {
    return;
  }

  deleteCacheOverflow(state);
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

function extractSessionIdFromToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1]));
    if (typeof payload?.session_id !== 'string') {
      return null;
    }
    return payload.session_id.trim() || null;
  } catch {
    return null;
  }
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

function sessionExpiredResponse(response) {
  return {
    ok: false,
    status: response.status,
    headers: response.headers,
    json: async () => ({ error: 'Session expired' }),
  };
}

/**
 * Fetch with auth header and refresh retry on 401
 * @param {VolcanoAuth} volcanoAuth
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithAuthRetry(volcanoAuth, url, options = {}, retryUnauthorized = true) {
  await volcanoAuth._completeOAuthExchange();
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
  if (response.status === 401 && retryUnauthorized) {
    const refreshed = await volcanoAuth.refreshSession();
    if (!refreshed.error) {
      response = await doFetch();
    } else {
      return sessionExpiredResponse(response);
    }
  }

  return response;
}

/**
 * Create an error result object
 * @param {string|Error} message - Error message or existing error
 * @param {Object} [extra] - Extra fields to include
 * @returns {Object}
 */
function errorResult(message, extra = {}) {
  const error = message instanceof Error ? message : new Error(message);
  return { data: null, error, ...extra };
}

function apiRequestError(response, data) {
  const error = new Error(data?.error || 'Request failed');
  error.status = response.status;
  if (data?.code) {
    error.code = data.code;
  }
  const retryAfter = Number.parseInt(getHeaderValue(response, 'retry-after') || '', 10);
  if (Number.isFinite(retryAfter)) {
    error.retryAfter = retryAfter;
  }
  return error;
}

const FULL_ACCESS_APP_NAME = 'volcano_full_access';
const USER_ACCESS_APP_NAME = 'volcano_user_access';

/**
 * Build a Postgres connection string for querying a Volcano database from inside
 * a function, selecting the access mode via application_name.
 *
 * Pass the DATABASE_URL Volcano advertises as `baseConnectionString`. The target
 * database is identified by the (globally-unique) username already baked into
 * that URL, so this only sets application_name to choose the access mode — the
 * username, host, database and password are left untouched. With no `userId` the
 * result is a full-access (admin) connection that bypasses RLS the same way the
 * Postgres service_role does; with a `userId` (e.g. `event.__volcano_auth.user_id`)
 * it impersonates that user and RLS is enforced.
 *
 * @param {string} baseConnectionString - DATABASE_URL from the Volcano runtime
 * @param {{ userId?: string|null }|null} [options]
 * @returns {string} a connection string with the requested application_name
 */
function databaseConnectionString(baseConnectionString, options = {}) {
  options = options || {};
  if (typeof baseConnectionString !== 'string' || baseConnectionString === '') {
    throw new Error('databaseConnectionString: baseConnectionString (DATABASE_URL) is required');
  }
  let url;
  try {
    url = new URL(baseConnectionString);
  } catch {
    throw new Error('databaseConnectionString: baseConnectionString is not a valid connection URL');
  }
  const userId = options.userId == null ? '' : String(options.userId);
  const appName = userId === '' ? FULL_ACCESS_APP_NAME : `${USER_ACCESS_APP_NAME}:${userId}`;
  url.searchParams.set('application_name', appName);
  // URLSearchParams encodes spaces as '+', but a Postgres connection URI is
  // RFC3986 where '+' is a literal plus and a space must be '%20'. Some URI
  // parsers (e.g. libpq) don't treat '+' as a space, so normalize to '%20'.
  // Literal '+' in a value is already serialized as '%2B', so this only rewrites
  // space encodings.
  url.search = url.search.replaceAll('+', '%20');
  return url.toString();
}

function normalizeLockError(error) {
  return error instanceof Error ? error : new Error('Lock acquisition failed');
}

function populateLease(lease, response) {
  lease.expiresAt = response.data.expires_at;
  lease.fencingToken = response.data.fencing_token ?? null;
  return { acquired: true, lease, error: null };
}

function isLockContention(error) {
  return error?.status === 409 && LOCK_CONTENTION_CODES.has(error.info?.code);
}

function lockAcquisitionFailed(result) {
  return !result.acquired || Boolean(result.error);
}

async function requestProjectLock(client, key, request) {
  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await client._transport.acquireProjectLock(
        encodeURIComponent(key),
        { ttl_seconds: request.ttl },
        client._generatedOptions('session', {
          'X-Volcano-Lock-Token': request.token,
          'X-Volcano-Request-Id': request.requestId,
        }),
      );
      return { response, error: null };
    } catch (error) {
      lastError = normalizeLockError(error);
      if (lastError.status != null && lastError.status !== 503) {
        break;
      }
    }
  }
  return { response: null, error: lastError };
}

class ProjectLocksApi {
  constructor(client) {
    this.client = client;
  }

  async acquire(key, options = {}) {
    const ttl = validateLockOptions(key, options);
    const token = options.token || crypto.randomUUID();
    const requestId = options.requestId || crypto.randomUUID();
    const lease = { key, token, expiresAt: null, fencingToken: null };
    const request = { ttl, token, requestId };
    const { response, error: requestError } = await requestProjectLock(this.client, key, request);
    if (response) {
      return populateLease(lease, response);
    }
    if (isLockContention(requestError)) {
      return { acquired: false, lease: null, error: null };
    }
    return { acquired: false, lease, error: requestError };
  }

  async renew(key, lease, options = {}) {
    const ttl = validateLockOptions(key, options);
    validateLease(key, lease);
    const result = await this.client._authFetch(`/locks/${encodeURIComponent(key)}/lease`, {
      method: 'PATCH',
      headers: {
        'X-Volcano-Lock-Token': lease.token,
        'X-Volcano-Request-Id': options.requestId || crypto.randomUUID(),
      },
      body: JSON.stringify({ ttl_seconds: ttl }),
    });
    if (!result.ok) {
      return { lease, error: result.error };
    }
    lease.expiresAt = result.data.expires_at;
    lease.fencingToken = result.data.fencing_token ?? lease.fencingToken;
    return { lease, error: null };
  }

  async release(key, lease, options = {}) {
    validateLockKey(key);
    validateLease(key, lease);
    try {
      await this.client._transport.releaseProjectLock(
        encodeURIComponent(key),
        this.client._generatedOptions('session', {
          'X-Volcano-Lock-Token': lease.token,
          'X-Volcano-Request-Id': options.requestId || crypto.randomUUID(),
        }),
      );
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Lock release failed') };
    }
  }

  async get(key, options = {}) {
    validateLockKey(key);
    const result = await this.client._authFetch(`/locks/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { 'X-Volcano-Request-Id': options.requestId || crypto.randomUUID() },
    });
    if (!result.ok) {
      return { state: null, error: result.error };
    }
    return {
      state: {
        held: result.data.held === true,
        expiresAt: result.data.expires_at ?? null,
        fencingToken: result.data.fencing_token ?? null,
      },
      error: null,
    };
  }

  async forceRelease(key, options = {}) {
    validateLockKey(key);
    const result = await this.client._authFetch(`/locks/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'X-Volcano-Request-Id': options.requestId || crypto.randomUUID() },
    });
    return { error: result.ok ? null : result.error };
  }

  async withLock(key, options, callback) {
    if (typeof callback !== 'function') {
      throw new TypeError('callback must be a function');
    }
    const ttl = validateLockOptions(key, options);
    const acquired = await this.acquire(key, {
      ttl,
      token: options.token,
      requestId: options.requestId,
    });
    if (lockAcquisitionFailed(acquired)) {
      return { acquired: acquired.acquired, data: null, error: acquired.error };
    }

    const controller = new AbortController();
    let stopped = false;
    let renewalError = null;
    let timer;
    let wakeTimer;
    const renewalLoop = (async () => {
      while (!stopped) {
        const baseDelay = lockRenewalDelay(ttl, acquired.lease);
        const jitter = baseDelay * 0.1 * (secureRandomUnit() * 2 - 1);
        await new Promise((resolve) => {
          wakeTimer = resolve;
          timer = setTimeout(resolve, Math.max(1, baseDelay + jitter));
        });
        wakeTimer = null;
        if (stopped) {
          break;
        }
        const renewed = await this.renew(key, acquired.lease, { ttl });
        if (renewed.error) {
          renewalError = renewed.error;
          controller.abort(renewalError);
          break;
        }
      }
    })();

    let data = null;
    let callbackError = null;
    let releaseError;
    try {
      data = await callback({ signal: controller.signal, lease: acquired.lease });
    } catch (error) {
      callbackError = error instanceof Error ? error : new Error(String(error));
    } finally {
      stopped = true;
      clearTimeout(timer);
      wakeTimer?.();
      await renewalLoop;
      const released = await this.release(key, acquired.lease);
      releaseError = released.error;
    }
    return { acquired: true, data, error: renewalError || callbackError || releaseError };
  }
}

function validateLockOptions(key, options) {
  validateLockKey(key);
  const ttl = options?.ttl;
  if (!Number.isInteger(ttl) || ttl < 5 || ttl > MAX_LOCK_TTL_SECONDS) {
    throw new RangeError('ttl must be an integer between 5 seconds and 90 days');
  }
  return ttl;
}

function validateLockKey(key) {
  if (typeof key !== 'string' || !/^[a-z0-9][\w.:-]{0,127}$/i.test(key)) {
    throw new TypeError('lock key must match ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
  }
}

function secureRandomUnit() {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] / 0x1_0000_0000;
}

function lockRenewalDelay(ttl, lease) {
  const ttlDelay = (ttl * 1000) / 3;
  const expiresAt = Date.parse(lease.expiresAt);
  if (!Number.isFinite(expiresAt)) {
    return ttlDelay;
  }
  const remainingDelay = Math.max(1, (expiresAt - Date.now()) / 3);
  return Math.min(ttlDelay, remainingDelay, MAX_LOCK_RENEWAL_DELAY_MS);
}

function validateLease(key, lease) {
  if (!lease || lease.key !== key || typeof lease.token !== 'string' || lease.token === '') {
    throw new TypeError('lease must belong to the requested lock and include its token');
  }
}

function validateVolcanoConfig(config) {
  if (!config.anonKey) {
    throw new Error('anonKey is required. Get your anon key from project settings.');
  }
  if (config.anonKey.startsWith('sk-') && isBrowser()) {
    throw new Error(
      '[VOLCANO SECURITY ERROR] Service keys (sk-*) cannot be used in client-side code. ' +
        'Service keys bypass Row Level Security and expose your database to unauthorized access. ' +
        'Use an anon key (ak-*) for browser/client-side applications. ' +
        'Service keys should only be used in secure server-side environments. ' +
        'See: https://docs.volcano.hosting/security/keys',
    );
  }
}

function initializeClientSession(client, config) {
  if (config.accessToken) {
    client.accessToken = config.accessToken;
    client.refreshToken = config.refreshToken || null;
    return;
  }
  client.accessToken = client._getStorageItem(STORAGE_KEY_ACCESS_TOKEN);
  client.refreshToken = client._getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
  client._pendingUrlAuthNotify = client._consumeSessionFromUrl();
  if (client._hasOAuthCallbackInUrl()) {
    client._oauthExchangePromise = client._consumeOAuthCodeFromUrl();
  }
}

function createAuthFacade(client) {
  return {
    signUp: client.signUp.bind(client),
    signIn: client.signIn.bind(client),
    signOut: client.signOut.bind(client),
    getUser: client.getUser.bind(client),
    updateUser: client.updateUser.bind(client),
    refreshSession: client.refreshSession.bind(client),
    onAuthStateChange: client.onAuthStateChange.bind(client),
    user: () => client.currentUser,
    signUpAnonymous: client.signUpAnonymous.bind(client),
    convertAnonymous: client.convertAnonymous.bind(client),
    confirmEmail: client.confirmEmail.bind(client),
    resendConfirmation: client.resendConfirmation.bind(client),
    forgotPassword: client.forgotPassword.bind(client),
    resetPassword: client.resetPassword.bind(client),
    requestEmailChange: client.requestEmailChange.bind(client),
    confirmEmailChange: client.confirmEmailChange.bind(client),
    cancelEmailChange: client.cancelEmailChange.bind(client),
    getHostedAuthUrl: client.getHostedAuthUrl.bind(client),
    signInWithHostedAuth: client.signInWithHostedAuth.bind(client),
    signInWithOAuth: client.signInWithOAuth.bind(client),
    signInWithGoogle: client.signInWithGoogle.bind(client),
    signInWithGitHub: client.signInWithGitHub.bind(client),
    signInWithMicrosoft: client.signInWithMicrosoft.bind(client),
    signInWithApple: client.signInWithApple.bind(client),
    linkOAuthProvider: client.linkOAuthProvider.bind(client),
    unlinkOAuthProvider: client.unlinkOAuthProvider.bind(client),
    getLinkedOAuthProviders: client.getLinkedOAuthProviders.bind(client),
    refreshOAuthToken: client.refreshOAuthToken.bind(client),
    getOAuthProviderToken: client.getOAuthProviderToken.bind(client),
    callOAuthAPI: client.callOAuthAPI.bind(client),
    getSessions: client.getSessions.bind(client),
    deleteSession: client.deleteSession.bind(client),
    deleteAllOtherSessions: client.deleteAllOtherSessions.bind(client),
  };
}

function initializeClientFacades(client) {
  client.auth = createAuthFacade(client);
  client.functions = { invoke: client.invokeFunction.bind(client) };
  client.logs = {
    search: client.searchLogs.bind(client),
    activity: client.getLogActivity.bind(client),
  };
  client.storage = { from: client.storageBucket.bind(client) };
  client.locks = new ProjectLocksApi(client);
}

function failedRequest(error, status = null, data = null) {
  return { ok: false, status, error, data };
}

function successfulRequest(response, data) {
  return { ok: true, status: response.status, data, error: null };
}

function shouldRefreshSession(response, retryFailure) {
  return response.status === 401 && retryFailure === null;
}

function missingSessionFailure(retryFailure) {
  return retryFailure || failedRequest(new Error('No active session'));
}

async function sendAuthenticatedRequest(client, url, fetchOptions) {
  try {
    const response = await fetchWithTimeout(
      url,
      {
        ...fetchOptions,
        headers: {
          Authorization: `Bearer ${client.accessToken}`,
          'Content-Type': 'application/json',
          ...fetchOptions.headers,
        },
      },
      client.timeout,
    );
    return { response, data: await safeJsonParse(response), error: null };
  } catch (error) {
    const requestError = error instanceof Error ? error : new Error('Request failed');
    return { response: null, data: null, error: requestError };
  }
}

async function authenticatedRequestAttempt(client, url, fetchOptions, retryFailure) {
  const { response, data, error } = await sendAuthenticatedRequest(client, url, fetchOptions);
  if (error) {
    return { result: failedRequest(error), retryFailure };
  }
  if (response.ok) {
    return { result: successfulRequest(response, data), retryFailure };
  }
  if (!shouldRefreshSession(response, retryFailure)) {
    const result = failedRequest(apiRequestError(response, data), response.status, data);
    return { result, retryFailure };
  }
  const failure = failedRequest(new Error('Session expired'), response.status, data);
  if (!client.refreshToken) {
    return { result: failure, retryFailure: failure };
  }
  await client.refreshSession();
  return { result: null, retryFailure: failure };
}

function validateOAuthRedirect(url) {
  for (const key of OAUTH_RESPONSE_QUERY_KEYS) {
    if (url.searchParams.has(key)) {
      throw new Error(`OAuth redirectTo must not contain the reserved "${key}" query parameter`);
    }
  }
}

function appendOAuthState(redirectURL, nonce) {
  const transportURL = new URL(redirectURL);
  const separator = transportURL.search ? '&' : '?';
  transportURL.search = `${transportURL.search}${separator}vh_state=${encodeURIComponent(nonce)}`;
  return transportURL.toString();
}

function navigateBrowser(url) {
  try {
    if (window.location && typeof window.location.assign === 'function') {
      window.location.assign(url);
    } else {
      window.location.href = url;
    }
  } catch (error) {
    const message = String((error && error.message) || error || '');
    if (!message.includes('Not implemented: navigation')) {
      throw error;
    }
  }
}

function validateFunctionResolution(data) {
  const functionId = sanitizeFunctionIdentifierForHost(data?.function_id);
  if (!functionId) {
    throw new Error('Resolve response missing valid function_id');
  }
  const ttlSeconds = Number(data?.cache_ttl_seconds);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Resolve response missing valid cache_ttl_seconds');
  }
  return { functionId, ttlSeconds };
}

function invocationFailure(error) {
  return { data: null, status: null, headers: {}, version: null, error };
}

function invocationSystemFailure(response, data, headers) {
  const fallback = `Invoke request failed with status ${response.status}`;
  const message = data && typeof data === 'object' && data.error ? data.error : fallback;
  return {
    data: null,
    status: response.status,
    headers,
    version: null,
    error: new VolcanoSystemError(message, { status: response.status }),
  };
}

function transportSystemFailure(error) {
  if (error instanceof VolcanoSystemError) {
    return invocationFailure(error);
  }
  const message = error instanceof Error ? error.message : 'Request failed';
  return invocationFailure(new VolcanoSystemError(message, { cause: error }));
}

function shouldRefreshInvocation(response, allowRefresh, versionHeader) {
  return response.status === 401 && allowRefresh && !versionHeader;
}

function isInvocationPlatformFailure(response, versionHeader) {
  return !response.ok && !versionHeader;
}

function isInvalidFunctionName(functionName) {
  return typeof functionName !== 'string' || functionName === '';
}

function noSessionInvocationError(oauthExchangeError) {
  return oauthExchangeError || new Error('No active session');
}

function isProviderSessionFailure(result) {
  return !result.ok && result.status === 401 && !/not linked/i.test(result.error?.message || '');
}

function providerSessionExpiredResult() {
  const error = new Error('Session expired');
  error.status = 401;
  return { ok: false, status: 401, data: null, error };
}

function readOAuthCallback() {
  try {
    const url = new URL(window.location.href);
    const code = url.searchParams.get('code') || '';
    const providerError = url.searchParams.get('error') || '';
    const state = url.searchParams.get('state') || '';
    if (!hasOAuthCallbackValues(code, providerError, state)) {
      return null;
    }
    return {
      url,
      code,
      state,
      providerError,
      providerErrorDescription: url.searchParams.get('error_description') || '',
    };
  } catch {
    return null;
  }
}

function hasOAuthCallbackValues(code, providerError, state) {
  return Boolean(state) && Boolean(code || providerError);
}

function signupAcknowledgement(data) {
  return {
    confirmationRequired: Boolean(data?.confirmation_required),
    message: data?.message ?? null,
  };
}

function rememberCurrentSessionIds(target, sessions) {
  for (const session of sessions) {
    if (session.is_current) {
      target.add(session.id);
    }
  }
}

function shouldSignInAfterSignup(signInWhenAllowed, confirmationRequired) {
  return signInWhenAllowed && !confirmationRequired;
}

function oauthCallbackError(callback, expectedState) {
  if (!expectedState || callback.state !== expectedState) {
    return new Error('OAuth callback state did not match');
  }
  if (!callback.providerError) {
    return null;
  }
  const message =
    callback.providerErrorDescription ||
    `OAuth provider rejected sign-in: ${callback.providerError}`;
  return new Error(message);
}

// ============================================================================
// VolcanoAuth Class
// ============================================================================

class VolcanoAuth {
  constructor(config) {
    validateVolcanoConfig(config);

    this.apiUrl = (config.apiUrl || DEFAULT_API_URL).replace(/\/$/, ''); // Remove trailing slash
    this.functionInvocationBase = resolveFunctionInvocationBase(this.apiUrl);
    this.anonKey = config.anonKey;
    this.timeout = config.timeout || DEFAULT_TIMEOUT_MS;
    this._currentDatabaseName = null;
    this.currentUser = null;
    this._currentDeviceSessionIds = new Set();
    this._authNotificationGeneration = 0;
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
    // Keep a terminal callback error until initialize()/refreshSession() consumes
    // it or a new session is set or cleared.
    this._oauthExchangeError = null;
    this._functionResolveState = getSharedFunctionResolveState();
    this._transport = (config.transportFactory || (() => GENERATED_TRANSPORT))(this);

    initializeClientSession(this, config);
    initializeClientFacades(this);
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
    await this._completeOAuthExchange();
    if (!this.accessToken) {
      return {
        ok: false,
        status: null,
        error: this._oauthExchangeError || new Error('No active session'),
        data: null,
      };
    }

    return this._authFetchUrl(`${this.apiUrl}${path}`, options);
  }

  async _authFetchUrl(url, fetchOptions = {}) {
    let retryFailure = null;

    for (;;) {
      if (!this.accessToken) {
        return missingSessionFailure(retryFailure);
      }

      const attempt = await authenticatedRequestAttempt(this, url, fetchOptions, retryFailure);
      if (attempt.result) {
        return attempt.result;
      }
      retryFailure = attempt.retryFailure;
    }
  }

  _generatedOptions(volcanoAuthorization, headers, responseType, retryUnauthorized = true) {
    return {
      volcanoAuthorization,
      volcanoClient: this,
      ...(headers ? { headers } : {}),
      ...(responseType ? { volcanoResponseType: responseType } : {}),
      ...(!retryUnauthorized ? { volcanoRetryUnauthorized: false } : {}),
    };
  }

  async _generatedFetch(path, options, authorization, retryUnauthorized = true) {
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

    return fetchWithAuthRetry(this, url, options, retryUnauthorized);
  }

  async _generatedRequest(request) {
    try {
      const response = await request();
      return { ok: true, status: response.status, data: response.data, error: null };
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error('Request failed');
      return {
        ok: false,
        status: normalized.status ?? null,
        data: normalized.info ?? null,
        error: normalized,
      };
    }
  }

  async _generatedSessionRequest(request) {
    await this._completeOAuthExchange();
    if (!this.accessToken) {
      return {
        ok: false,
        status: null,
        data: null,
        error: this._oauthExchangeError || new Error('No active session'),
      };
    }
    return this._generatedRequest(request);
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

  async _fetchFunctionResolution(hostLabel, cacheKey) {
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

    const resolution = validateFunctionResolution(result.data);
    this._functionResolveState.cache.set(cacheKey, {
      functionId: resolution.functionId,
      error: null,
      expiresAt: Date.now() + resolution.ttlSeconds * 1000,
    });
    pruneFunctionResolveCache(this._functionResolveState, Date.now(), true);
    return resolution.functionId;
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

    const pending = this._fetchFunctionResolution(hostLabel, cacheKey);

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
    return new MutationBuilder(this, {
      table,
      databaseName: this._currentDatabaseName,
      operation: 'insert',
      values,
    });
  }

  update(table, values) {
    return new MutationBuilder(this, {
      table,
      databaseName: this._currentDatabaseName,
      operation: 'update',
      values,
    });
  }

  delete(table) {
    return new MutationBuilder(this, {
      table,
      databaseName: this._currentDatabaseName,
      operation: 'delete',
      values: null,
    });
  }

  // ========================================================================
  // Authentication Methods
  // ========================================================================

  async signUp({ email, password, metadata = {}, signInWhenAllowed = false }) {
    const result = await this._generatedRequest(() =>
      this._transport.authSignup(
        { email, password, user_metadata: metadata },
        this._generatedOptions('anon'),
      ),
    );

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
    const { confirmationRequired, message } = signupAcknowledgement(result.data);

    // Opt-in convenience: when the project does not require email confirmation the
    // account is usable immediately, so establish a session with a follow-up signIn
    // using the same credentials. Off by default so signUp mirrors the server's
    // session-less contract unless the caller asks for auto sign-in. If the follow-up
    // signIn fails, its error is surfaced while the account still exists server-side.
    if (shouldSignInAfterSignup(signInWhenAllowed, confirmationRequired)) {
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

    this._setSession(response.data);
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

  async signOut() {
    await this._completeOAuthExchange();
    if (this.refreshToken) {
      await this._generatedRequest(() =>
        this._transport.authLogout(
          { refresh_token: this.refreshToken },
          this._generatedOptions('anon'),
        ),
      );
    }
    this._clearSession();
    return { error: null };
  }

  async getUser() {
    // Transparently adopt a session handed off by the managed hosted auth pages
    // (tokens in the URL fragment) so callers only ever need getUser().
    const adoptedFromUrl = this._consumeSessionFromUrl();
    const hydratesRestoredSession = this.currentUser === null;
    const notificationGeneration = this._authNotificationGeneration;

    const result = await this._generatedSessionRequest(() =>
      this._transport.authGetUser(this._generatedOptions('session')),
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user;
    // Announce the redirect adoption — whether it happened just now or earlier
    // at construction — exactly once, so onAuthStateChange listeners see the
    // SIGNED_IN transition on the common hosted-redirect path too.
    const shouldAnnounceHydration =
      adoptedFromUrl || this._pendingUrlAuthNotify || hydratesRestoredSession;
    if (shouldAnnounceHydration) {
      this._pendingUrlAuthNotify = false;
      if (notificationGeneration === this._authNotificationGeneration) {
        this._notifyAuthCallbacks(this.currentUser);
      }
    }
    return { user: result.data.user, error: null };
  }

  async updateUser({ password, metadata }) {
    const result = await this._generatedSessionRequest(() =>
      this._transport.authUpdateUser(
        { password, user_metadata: metadata },
        this._generatedOptions('session'),
      ),
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  async refreshSession() {
    await this._completeOAuthExchange();
    if (this._oauthExchangeError && !this.refreshToken) {
      const error = this._oauthExchangeError;
      this._oauthExchangeError = null;
      return { session: null, error };
    }
    this._oauthExchangeError = null;
    if (!this.refreshToken) {
      this._clearSessionIfPresent();
      return { session: null, error: new Error('No refresh token') };
    }

    try {
      const result = await this._generatedRequest(() =>
        this._transport.authRefresh(
          { refresh_token: this.refreshToken },
          this._generatedOptions('anon'),
        ),
      );

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

    if (!this.accessToken || this.currentUser) {
      try {
        callback(this.currentUser);
      } catch (err) {
        console.error('[VolcanoAuth] Error in auth state callback:', err);
      }
    }

    return () => {
      this._authCallbacks = this._authCallbacks.filter((cb) => cb !== callback);
    };
  }

  // ========================================================================
  // Anonymous User Methods
  // ========================================================================

  async signUpAnonymous(metadata = {}) {
    const result = await this._generatedRequest(() =>
      this._transport.authSignupAnonymous(
        { user_metadata: metadata },
        this._generatedOptions('anon'),
      ),
    );

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
    const result = await this._generatedSessionRequest(() =>
      this._transport.authConvertAnonymous(
        { email, password, user_metadata: metadata },
        this._generatedOptions('session'),
      ),
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    const refreshed = await this.refreshSession();
    if (refreshed.error) {
      return { user: result.data.user, error: null };
    }
    return { user: this.currentUser || result.data.user, error: null };
  }

  // ========================================================================
  // Email Confirmation Methods
  // ========================================================================

  async confirmEmail(token) {
    const result = await this._generatedRequest(() =>
      this._transport.authConfirmEmail({ token }, this._generatedOptions('anon')),
    );

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    if (this.accessToken) {
      const needsExplicitNotification = this.currentUser !== null;
      const notificationGeneration = this._authNotificationGeneration;
      const profile = await this.getUser();
      if (
        !profile.error &&
        needsExplicitNotification &&
        notificationGeneration === this._authNotificationGeneration
      ) {
        this._notifyAuthCallbacks(this.currentUser);
      }
    }
    return { message: result.data.message, error: null };
  }

  async resendConfirmation(email) {
    const result = await this._generatedRequest(() =>
      this._transport.authResendConfirmation({ email }, this._generatedOptions('anon')),
    );

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message, error: null };
  }

  // ========================================================================
  // Password Recovery Methods
  // ========================================================================

  async forgotPassword(email) {
    const result = await this._generatedRequest(() =>
      this._transport.authForgotPassword({ email }, this._generatedOptions('anon')),
    );

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message, error: null };
  }

  async resetPassword({ token, newPassword }) {
    const result = await this._generatedRequest(() =>
      this._transport.authResetPassword(
        { token, new_password: newPassword },
        this._generatedOptions('anon'),
      ),
    );

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    await this._validateSessionAfterPasswordReset();
    return { message: result.data.message, error: null };
  }

  async _validateSessionAfterPasswordReset() {
    if (!this.accessToken) {
      return;
    }
    const profile = await this.getUser();
    if (profile.error?.status === 401 && this.accessToken) {
      this._clearSession();
    }
  }

  // ========================================================================
  // Email Change Methods
  // ========================================================================

  async requestEmailChange(newEmail) {
    const result = await this._generatedSessionRequest(() =>
      this._transport.authRequestEmailChange(
        { new_email: newEmail },
        this._generatedOptions('session'),
      ),
    );

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
    const result = await this._generatedSessionRequest(() =>
      this._transport.authConfirmEmailChange(
        { email_change_token: emailChangeToken },
        this._generatedOptions('session'),
      ),
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user;
    return { user: result.data.user, error: null };
  }

  async cancelEmailChange() {
    const result = await this._generatedSessionRequest(() =>
      this._transport.authCancelEmailChange(this._generatedOptions('session')),
    );

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message, error: null };
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
    validateOAuthRedirect(redirectTarget);
    const redirectURL = redirectTarget.toString();
    this._storeAuthState(nonce, redirectURL);
    // Keep the nonce in the legacy location during the backend rollout. New
    // servers remove this reserved transport parameter before exact redirect
    // matching; older servers echo it in their token-fragment response.
    const transportRedirectURL = appendOAuthState(redirectURL, nonce);

    const oauthUrl =
      `${this.apiUrl}/auth/oauth/${provider}/authorize` +
      `?anon_key=${encodeURIComponent(this.anonKey)}` +
      `&redirect_url=${encodeURIComponent(transportRedirectURL)}` +
      `&client_state=${encodeURIComponent(nonce)}` +
      `&response_mode=code`;
    navigateBrowser(oauthUrl);
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
    navigateBrowser(url);
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
    const result = await this._generatedSessionRequest(() =>
      this._transport.authLinkOAuthProvider(provider, undefined, this._generatedOptions('session')),
    );

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data, error: null };
  }

  async unlinkOAuthProvider(provider) {
    sanitizeProvider(provider);
    const result = await this._generatedSessionRequest(() =>
      this._transport.authUnlinkOAuthProvider(provider, this._generatedOptions('session')),
    );

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  async getLinkedOAuthProviders() {
    const result = await this._generatedSessionRequest(() =>
      this._transport.authListOAuthProviders(this._generatedOptions('session')),
    );

    if (!result.ok) {
      return { providers: null, error: result.error };
    }
    return { providers: result.data.providers || [], error: null };
  }

  async refreshOAuthToken(provider) {
    sanitizeProvider(provider);
    const result = await this._generatedSessionRequest(() =>
      this._transport.refreshOAuthProviderToken(provider, this._generatedOptions('session')),
    );

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
    const result = await this._generatedSessionRequest(() =>
      this._transport.getOAuthProviderToken(provider, this._generatedOptions('session')),
    );

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
    const request = () =>
      this._transport.callOAuthProviderAPI(
        provider,
        { endpoint, method, body },
        this._generatedOptions('session', undefined, undefined, false),
      );
    let result = await this._generatedSessionRequest(request);
    if (isProviderSessionFailure(result)) {
      result = await this._retryProviderCall(request);
    }

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data.data, error: null };
  }

  async _retryProviderCall(request) {
    if (!this.refreshToken) {
      this._clearSessionIfPresent();
      return providerSessionExpiredResult();
    }
    const refreshed = await this.refreshSession();
    if (refreshed.error) {
      return providerSessionExpiredResult();
    }
    const retried = await this._generatedSessionRequest(request);
    if (!isProviderSessionFailure(retried)) {
      return retried;
    }
    this._clearSession();
    return providerSessionExpiredResult();
  }

  // ========================================================================
  // Session Management (User's sessions)
  // ========================================================================

  async getSessions(options = {}) {
    const { page = 1, limit = DEFAULT_SESSIONS_LIMIT } = options;
    const params = {};
    if (page > 1) {
      params.page = page;
    }
    if (limit !== DEFAULT_SESSIONS_LIMIT) {
      params.limit = limit;
    }
    const result = await this._generatedSessionRequest(() =>
      this._transport.authGetMySessions(params, this._generatedOptions('session')),
    );

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
    rememberCurrentSessionIds(this._currentDeviceSessionIds, result.data.sessions);
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
    const currentSessionId = extractSessionIdFromToken(this.accessToken);
    const deletesCurrentSession =
      currentSessionId === sessionId || this._currentDeviceSessionIds.has(sessionId);
    const result = await this._generatedSessionRequest(() =>
      this._transport.authDeleteMySession(
        encodeURIComponent(sessionId),
        this._generatedOptions('session'),
      ),
    );

    if (!result.ok) {
      return { error: result.error };
    }
    if (deletesCurrentSession) {
      this._clearSession();
    }
    return { error: null };
  }

  async deleteAllOtherSessions() {
    const result = await this._generatedSessionRequest(() =>
      this._transport.authDeleteAllMySessions(this._generatedOptions('session')),
    );

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  // ========================================================================
  // Function Invocation
  // ========================================================================

  async _invokeOnce(url, payload, allowRefresh) {
    try {
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ payload }),
        },
        this.timeout,
      );
      const versionHeader = getHeaderValue(response, 'x-volcano-version');
      if (shouldRefreshInvocation(response, allowRefresh, versionHeader)) {
        const refreshed = await this.refreshSession();
        if (!refreshed.error) {
          return this._invokeOnce(url, payload, false);
        }
      }

      const data = await parseResponseBody(response);
      const headers = responseHeadersToObject(response);
      if (isInvocationPlatformFailure(response, versionHeader)) {
        return invocationSystemFailure(response, data, headers);
      }
      return {
        data,
        status: response.status,
        headers,
        version: versionHeader || null,
        error: null,
      };
    } catch (error) {
      return transportSystemFailure(error);
    }
  }

  async _resolveInvokeUrl(functionName) {
    const functionId = await this._resolveFunctionIdByName(functionName);
    return this._getFunctionInvokeUrl(functionId);
  }

  async _retryStaleFunction(functionName, payload) {
    this._clearFunctionResolveCache(functionName);
    try {
      const url = await this._resolveInvokeUrl(functionName);
      return this._invokeOnce(url, payload, true);
    } catch (error) {
      const resolutionError =
        error instanceof Error ? error : new Error('Failed to resolve function');
      return invocationFailure(resolutionError);
    }
  }

  async invokeFunction(functionName, payload = {}) {
    if (isInvalidFunctionName(functionName)) {
      return invocationFailure(new Error('functionName must be a non-empty string'));
    }
    await this._completeOAuthExchange();
    if (!this.accessToken) {
      return invocationFailure(noSessionInvocationError(this._oauthExchangeError));
    }
    if (!this.functionInvocationBase) {
      return invocationFailure(
        new Error(
          'apiUrl must be api.<domain> (or localhost/IP for local mode) to use DNS function invocation',
        ),
      );
    }

    const normalizedName = functionName.trim();
    let invokeUrl;
    try {
      invokeUrl = await this._resolveInvokeUrl(normalizedName);
    } catch (error) {
      const resolutionError =
        error instanceof Error ? error : new Error('Failed to resolve function');
      return invocationFailure(resolutionError);
    }

    const result = await this._invokeOnce(invokeUrl, payload, true);
    if (result.status === 404) {
      return this._retryStaleFunction(normalizedName, payload);
    }
    return result;
  }

  // ========================================================================
  // Session Management (Internal)
  // ========================================================================

  _setSession(data) {
    this._oauthExchangeError = null;
    this.accessToken = data.access_token;
    this.refreshToken = data.refresh_token;
    this.currentUser = data.user;
    this._currentDeviceSessionIds.clear();

    this._setStorageItem(STORAGE_KEY_ACCESS_TOKEN, this.accessToken);
    this._setStorageItem(STORAGE_KEY_REFRESH_TOKEN, this.refreshToken);

    this._notifyAuthCallbacks(this.currentUser);
  }

  _clearSession() {
    this._oauthExchangeError = null;
    this.accessToken = null;
    this.refreshToken = null;
    this.currentUser = null;
    this._currentDeviceSessionIds.clear();

    this._removeStorageItem(STORAGE_KEY_ACCESS_TOKEN);
    this._removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);

    this._notifyAuthCallbacks(null);
  }

  _clearSessionIfPresent() {
    if (this.accessToken || this.currentUser) {
      this._clearSession();
    }
  }

  _notifyAuthCallbacks(user) {
    this._authNotificationGeneration += 1;
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
    const storedRedirectURL = this._peekAuthRedirectURL();
    if (!isBrowser() || !this._peekAuthState() || !storedRedirectURL) {
      return false;
    }
    try {
      const callbackURL = new URL(window.location.href);
      const params = callbackURL.searchParams;
      if (!params.get('state') || (!params.get('code') && !params.get('error'))) {
        return false;
      }
      const expectedURL = new URL(storedRedirectURL);
      // Mutating both URLSearchParams instances normalizes equivalent browser
      // query serialization, such as `%20` and `+`, before exact comparison.
      this._removeOAuthResponseParams(callbackURL);
      this._removeOAuthResponseParams(expectedURL);
      return callbackURL.toString() === expectedURL.toString();
    } catch {
      return false;
    }
  }

  async _consumeOAuthCodeFromUrl() {
    const callback = readOAuthCallback();
    if (!callback) {
      return false;
    }

    const expectedState = this._takeAuthState();
    const storedRedirectURL = this._takeAuthRedirectURL();
    this._stripOAuthQueryFromUrl(callback.url);
    const callbackError = oauthCallbackError(callback, expectedState);
    if (callbackError) {
      this._oauthExchangeError = callbackError;
      return false;
    }
    const redirectURL =
      storedRedirectURL || `${callback.url.origin}${callback.url.pathname}${callback.url.search}`;
    const result = await this._generatedRequest(() =>
      this._transport.authOAuthExchange(
        { code: callback.code, redirect_url: redirectURL },
        this._generatedOptions('anon'),
      ),
    );
    if (!result.ok) {
      this._oauthExchangeError = result.error || new Error('OAuth code exchange failed');
      return false;
    }
    this._setSession(result.data);
    return true;
  }

  async _completeOAuthExchange() {
    if (!this._oauthExchangePromise) {
      return;
    }
    const promise = this._oauthExchangePromise;
    try {
      await promise;
    } catch (error) {
      this._oauthExchangeError =
        error instanceof Error ? error : new Error('OAuth code exchange failed');
    } finally {
      if (this._oauthExchangePromise === promise) {
        this._oauthExchangePromise = null;
      }
    }
  }

  _stripOAuthQueryFromUrl(callbackURL) {
    try {
      this._removeOAuthResponseParams(callbackURL, false);
      const cleanURL =
        (callbackURL.pathname || '/') + callbackURL.search + (callbackURL.hash || '');
      window.history.replaceState(window.history.state, '', cleanURL);
    } catch {
      // best-effort; leaving a one-time code in place is non-fatal
    }
  }

  _removeOAuthResponseParams(callbackURL, clearHash = true) {
    for (const key of OAUTH_RESPONSE_QUERY_KEYS) {
      callbackURL.searchParams.delete(key);
    }
    if (clearHash) {
      callbackURL.hash = '';
    }
  }

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

  _readSessionParams() {
    try {
      return new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    } catch {
      return null;
    }
  }

  _sessionStateMatches(params) {
    const expectedNonce = this._takeAuthState();
    this._takeAuthRedirectURL();
    const urlState = params.get('state') || '';
    return Boolean(expectedNonce) && urlState !== '' && urlState === expectedNonce;
  }

  _storeRedirectSession(params, accessToken) {
    this.accessToken = accessToken;
    this.refreshToken = params.get('refresh_token') || null;
    this._currentDeviceSessionIds.clear();
    this._setStorageItem(STORAGE_KEY_ACCESS_TOKEN, this.accessToken);
    if (this.refreshToken) {
      this._setStorageItem(STORAGE_KEY_REFRESH_TOKEN, this.refreshToken);
    } else {
      this._removeStorageItem(STORAGE_KEY_REFRESH_TOKEN);
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
    // Adopt at most once per client. When the fragment mixes tokens with app
    // params we deliberately leave the hash in place, so without this guard
    // every later getUser() would re-adopt and re-fire auth callbacks.
    if (this._urlSessionConsumed) {
      return false;
    }
    if (!this._hasSessionInUrl()) {
      return false;
    }

    const params = this._readSessionParams();
    if (!params) {
      return false;
    }

    const accessToken = params.get('access_token');
    if (!accessToken) {
      return false;
    }

    // Login-CSRF / session-fixation defense: only adopt a redirect session that
    // this client initiated. signInWithHostedAuth()/signInWithOAuth() store a
    // one-time nonce before redirecting; the hosted page and OAuth callback echo
    // it back as `state`. Reject (and scrub) any fragment whose `state` does not
    // match the stored nonce — e.g. an attacker-crafted #access_token link.
    if (!this._sessionStateMatches(params)) {
      // Unsolicited or mismatched session: do not authenticate. Scrub the tokens
      // from the URL so they don't linger, and mark as handled so we don't loop.
      this._urlSessionConsumed = true;
      this._stripAuthHashFromUrl(params);
      return false;
    }

    // The redirect hand-off is a complete session and fully replaces any
    // previously stored one. Adopt its refresh token verbatim — or clear a
    // stale stored token when the hand-off carries none — so we never pair this
    // access token with a different session's refresh token (which could
    // otherwise refresh into the wrong account).
    this._storeRedirectSession(params, accessToken);

    this._urlSessionConsumed = true;
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
  // RP nonce helpers (sessionStorage) — bind redirect sessions to this client
  // ========================================================================

  // Generate a one-time, unguessable nonce for the managed/OAuth redirect flow.
  // This is a CSRF defense, so it must be cryptographically random — we require
  // Web Crypto (browsers and Node >= 20 provide it) rather than fall back to a
  // predictable PRNG.
  _generateAuthStateNonce() {
    const cryptoObj =
      (isBrowser() && window.crypto) ||
      (typeof globalThis !== 'undefined' ? globalThis.crypto : null);
    if (!cryptoObj || typeof cryptoObj.getRandomValues !== 'function') {
      throw new Error(
        'A Web Crypto implementation (crypto.getRandomValues) is required to start a hosted-auth/OAuth flow.',
      );
    }
    const bytes = new Uint8Array(16);
    cryptoObj.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }

  // Persist the nonce across the redirect. sessionStorage is per-tab+origin and
  // survives the navigation away to the hosted page and back to this origin.
  _storeAuthState(nonce, redirectURL = '') {
    if (!isBrowser()) {
      return;
    }
    try {
      window.sessionStorage.setItem(STORAGE_KEY_AUTH_STATE, nonce);
      if (redirectURL) {
        window.sessionStorage.setItem(STORAGE_KEY_AUTH_REDIRECT, redirectURL);
      } else {
        window.sessionStorage.removeItem(STORAGE_KEY_AUTH_REDIRECT);
      }
    } catch {
      // sessionStorage may be unavailable (privacy mode); the redirect will then
      // be rejected on return, which fails safe.
    }
  }

  // Read and clear the stored nonce (one-time use).
  _takeAuthState() {
    if (!isBrowser()) {
      return null;
    }
    try {
      const nonce = window.sessionStorage.getItem(STORAGE_KEY_AUTH_STATE);
      window.sessionStorage.removeItem(STORAGE_KEY_AUTH_STATE);
      return nonce;
    } catch {
      return null;
    }
  }

  _peekAuthState() {
    if (!isBrowser()) {
      return null;
    }
    try {
      return window.sessionStorage.getItem(STORAGE_KEY_AUTH_STATE);
    } catch {
      return null;
    }
  }

  _takeAuthRedirectURL() {
    if (!isBrowser()) {
      return null;
    }
    try {
      const redirectURL = window.sessionStorage.getItem(STORAGE_KEY_AUTH_REDIRECT);
      window.sessionStorage.removeItem(STORAGE_KEY_AUTH_REDIRECT);
      return redirectURL;
    } catch {
      return null;
    }
  }

  _peekAuthRedirectURL() {
    if (!isBrowser()) {
      return null;
    }
    try {
      return window.sessionStorage.getItem(STORAGE_KEY_AUTH_REDIRECT);
    } catch {
      return null;
    }
  }

  // ========================================================================
  // Storage Helpers (Browser/Node.js compatible)
  // ========================================================================

  _getStorageItem(key) {
    if (isBrowser()) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    }
    return null;
  }

  _setStorageItem(key, value) {
    if (isBrowser()) {
      try {
        window.localStorage.setItem(key, value);
      } catch {
        // Keep the in-memory session when browser storage is unavailable.
      }
    }
  }

  _removeStorageItem(key) {
    if (isBrowser()) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // The in-memory session is already cleared.
      }
    }
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

function buildSelectRequest(query) {
  return {
    table: query.table,
    ...(query.selectColumns.length > 0 ? { select: query.selectColumns } : {}),
    ...(query.filters.length > 0 ? { filters: query.filters } : {}),
    ...(query.orderClauses.length > 0 ? { order: query.orderClauses } : {}),
    ...(query.limitValue !== null ? { limit: query.limitValue } : {}),
    ...(query.offsetValue !== null ? { offset: query.offsetValue } : {}),
  };
}

function buildMutationRequest(mutation) {
  return {
    table: mutation.table,
    ...(mutation.values ? { values: mutation.values } : {}),
    ...(mutation.filters.length > 0 ? { filters: mutation.filters } : {}),
  };
}

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
    await this.volcanoAuth._completeOAuthExchange();
    if (!this.volcanoAuth.accessToken) {
      return errorResult(
        this.volcanoAuth._oauthExchangeError || 'No active session. Please sign in first.',
        { count: 0 },
      );
    }

    if (!this.databaseName) {
      return errorResult('Database name not set. Use .database(databaseName) first.', { count: 0 });
    }

    const requestBody = buildSelectRequest(this);

    try {
      const response = await this.volcanoAuth._transport.queryDatabaseSelect(
        encodeURIComponent(this.databaseName),
        requestBody,
        this.volcanoAuth._generatedOptions('session'),
      );
      const result = response.data;
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
  constructor(volcanoAuth, mutation) {
    this.volcanoAuth = volcanoAuth;
    this.table = mutation.table;
    this.databaseName = mutation.databaseName;
    this.operation = mutation.operation;
    this.values = mutation.values;
    this.filters = [];
  }

  async execute() {
    await this.volcanoAuth._completeOAuthExchange();
    if (!this.volcanoAuth.accessToken) {
      return errorResult(
        this.volcanoAuth._oauthExchangeError || 'No active session. Please sign in first.',
      );
    }

    if (!this.databaseName) {
      return errorResult('Database name not set. Use .database(databaseName) first.');
    }

    const requestBody = buildMutationRequest(this);

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

async function parseBlobStorageResponse(response) {
  if (!response.ok) {
    const errorData = await safeJsonParse(response);
    return { data: null, error: new Error(errorData.error || 'Request failed') };
  }
  return { data: await response.blob(), error: null };
}

async function parseStorageResponse(response, responseType) {
  if (responseType === 'blob') {
    return parseBlobStorageResponse(response);
  }
  const data = await safeJsonParse(response);
  return response.ok
    ? { data, error: null }
    : { data: null, error: new Error(data.error || 'Request failed') };
}

function createUploadFile(fileBody, path, contentType) {
  if (fileBody instanceof File) {
    return fileBody;
  }
  if (fileBody instanceof Blob || fileBody instanceof ArrayBuffer) {
    const fileName = path.split('/').pop() || 'file';
    return new File([fileBody], fileName, { type: contentType || 'application/octet-stream' });
  }
  return null;
}

function buildStorageListParams(prefix, options) {
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
  const query = params.toString();
  return query ? `?${query}` : '';
}

function resumableContentType(fileBody, configuredType) {
  if (configuredType) {
    return configuredType;
  }
  if (fileBody instanceof File && fileBody.type) {
    return fileBody.type;
  }
  return 'application/octet-stream';
}

async function abortFailedUpload(storage, path, sessionId, partError) {
  const { error: abortError } = await storage.abortUploadSession(path, sessionId);
  if (abortError) {
    console.warn(`[Storage] Failed to abort upload session ${sessionId}:`, abortError.message);
  }
  return { data: null, error: partError };
}

async function uploadSessionParts(storage, path, upload) {
  const { fileBody, session, onProgress } = upload;
  const sessionId = session.session_id;
  for (let partNumber = 1; partNumber <= session.total_parts; partNumber += 1) {
    const start = (partNumber - 1) * session.part_size;
    const end = Math.min(start + session.part_size, fileBody.size);
    const partData = fileBody.slice(start, end);
    const { error } = await storage.uploadPart(path, sessionId, partNumber, partData);
    if (error) {
      return abortFailedUpload(storage, path, sessionId, error);
    }
    if (onProgress) {
      onProgress(end, fileBody.size);
    }
  }
  return storage.completeUploadSession(path, sessionId);
}

class StorageFileApi {
  constructor(volcanoAuth, bucketName) {
    this.volcanoAuth = volcanoAuth;
    this.bucketName = bucketName;
  }

  /**
   * Check if user is authenticated
   * @private
   */
  async _checkAuth() {
    await this.volcanoAuth._completeOAuthExchange();
    if (!this.volcanoAuth.accessToken) {
      return errorResult(
        this.volcanoAuth._oauthExchangeError || 'No active session. Please sign in first.',
      );
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
      return parseStorageResponse(response, options.responseType);
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Request failed') };
    }
  }

  /**
   * Upload a file to the bucket
   */
  async upload(path, fileBody, options = {}) {
    const authError = await this._checkAuth();
    if (authError) {
      return authError;
    }

    try {
      const file = createUploadFile(fileBody, path, options.contentType);
      if (!file) {
        return errorResult('Invalid file body type. Expected File, Blob, or ArrayBuffer.');
      }

      const response = await this.volcanoAuth._transport.uploadStorageObject(
        encodeURIComponent(this.bucketName),
        this._encodePath(path),
        { file },
        this.volcanoAuth._generatedOptions('session'),
      );

      return { data: response.data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Upload failed') };
    }
  }

  /**
   * Download a file from the bucket
   */
  async download(path, options = {}) {
    const authError = await this._checkAuth();
    if (authError) {
      return authError;
    }

    try {
      const response = await this.volcanoAuth._transport.downloadStorageObject(
        encodeURIComponent(this.bucketName),
        this._encodePath(path),
        this.volcanoAuth._generatedOptions(
          'session',
          options.range ? { Range: options.range } : undefined,
          'blob',
        ),
      );
      return { data: response.data, error: null };
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error('Download failed') };
    }
  }

  /**
   * List files in the bucket
   */
  async list(prefix = '', options = {}) {
    const authError = await this._checkAuth();
    if (authError) {
      return { ...authError, nextCursor: null };
    }

    const query = buildStorageListParams(prefix, options);
    const bucket = encodeURIComponent(this.bucketName);
    const url = `${this.volcanoAuth.apiUrl}/storage/${bucket}${query}`;

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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
    if (authError) {
      return authError;
    }

    return this._storageRequest(this._buildUrl(path), {
      method: 'GET',
      headers: { 'X-Upload-Session': sessionId },
    });
  }

  async abortUploadSession(path, sessionId) {
    const authError = await this._checkAuth();
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
    const authError = await this._checkAuth();
    if (authError) {
      return authError;
    }

    const totalSize = fileBody.size;
    const contentType = resumableContentType(fileBody, options.contentType);
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

      return uploadSessionParts(this, path, { fileBody, session, onProgress });
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

// Exports. Author these as pure ES module declarations only; rollup emits the
// ESM, CJS, and UMD builds (see rollup.config.mjs, all `exports: 'named'`).
// Do NOT hand-write CommonJS, browser-global, or AMD export assignments
// here: rollup passes such statements through verbatim into the ES build too,
// and a stray top-level CommonJS assignment in dist/index.esm.mjs overwrites
// the export object of any CJS bundle that inlines the SDK
// (e.g. esbuild --bundle --format=cjs), producing "handler is not a function"
// at runtime. See VOL-505.
const VolcanoClient = VolcanoAuth;

export {
  databaseConnectionString,
  isBrowser,
  loadRealtime,
  QueryBuilder,
  StorageFileApi,
  VolcanoAuth,
  VolcanoClient,
  VolcanoSystemError,
};
export default VolcanoAuth;
