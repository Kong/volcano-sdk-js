/**
 * Official JavaScript client for Volcano
 *
 * @example
 * ```javascript
 * import { createVolcanoClient } from '@volcano.dev/sdk';
 *
 * // Basic usage (uses https://api.volcano.dev by default)
 * const volcano = createVolcanoClient({
 *   anonKey: 'your-anon-key'
 * });
 *
 * // Or with custom API URL
 * const volcano = createVolcanoClient({
 *   baseUrl: 'https://api.yourapp.com',
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

import {
  type ApiClient,
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
  authRefresh,
  authRequestEmailChange,
  authResendConfirmation,
  authResetPassword,
  authSignin,
  authSignup,
  authSignupAnonymous,
  type AuthTokenResponse,
  authUnlinkOAuthProvider,
  authUpdateUser,
  callOAuthProviderApi,
  type CompleteUploadSessionResponse,
  copyStorageObject,
  createApiClient,
  type CreateUploadSessionResponse,
  getOAuthProviderToken,
  listStorageObjects,
  moveStorageObject,
  queryDatabaseDelete,
  queryDatabaseInsert,
  queryDatabaseSelect,
  queryDatabaseUpdate,
  refreshOAuthProviderToken,
  resolveFunctionForInvocation,
  type StorageObject,
  type UploadPartResponse,
  type UploadSessionStatusResponse,
  uploadStorageObject,
} from './api/index';
import { assertBrowserSafeCredentials, isClientServiceKey } from './credential-safety';
import { VolcanoApiError } from './errors';
import type { ResolvedRequestOptions } from './generated/api/client/index.js';
import type { Auth } from './generated/api/core/auth.gen.js';
import { discardResponse, trackResponseLifecycle } from './response-lifecycle';
import type {
  AuthChangeEvent,
  AuthClient,
  AuthResponse,
  AuthStorage,
  DatabaseClient as DatabaseClientType,
  ErrorResponse,
  FilterValue,
  FunctionInvokeOptions,
  FunctionInvokeResult,
  FunctionsClient,
  GenericDatabase,
  GenericDatabases,
  GenericTable,
  MessageResponse,
  MutationBuilder as MutationBuilderType,
  MutationResult,
  OAuthProviderName,
  QueryBuilder as QueryBuilderType,
  QueryFilter,
  QueryResult,
  RequestControlOptions,
  Session,
  SessionResponse,
  SessionsResponse,
  SignInOptions,
  SignUpOptions,
  SignUpResponse,
  StorageClient,
  StorageFileClient,
  UpdateUserOptions,
  User,
  UserMetadata,
  UserResponse,
  VolcanoClient,
  VolcanoClientConfig,
} from './types.js';
import { normalizeBaseUrl } from './url';
import { CLIENT_INFO } from './version';

export type * from './types.js';

type UnknownRecord = Record<string, unknown>;
type ApiOperation = (...args: never[]) => Promise<unknown>;
type OperationOptions<T extends ApiOperation> = Omit<NonNullable<Parameters<T>[0]>, 'client'>;
type OperationResult<T extends ApiOperation> = Awaited<ReturnType<T>>;
type ExtractOperationData<Result> = Result extends { data: infer Data } ? NonNullable<Data> : never;
type OperationData<T extends ApiOperation> = ExtractOperationData<OperationResult<T>>;

interface ApiResultLike {
  data?: unknown;
  error?: unknown;
  request?: Request;
  response?: Response;
}

type NormalizedApiResult<Data> =
  | { data: Data; error: null; ok: true; status: number | null }
  | { data: Data | null; error: VolcanoApiError; ok: false; status: number | null };

interface FunctionInvocationBase {
  domain: string;
  port: string;
  protocol: string;
}

interface FunctionResolveCacheEntry {
  error: string | null;
  expiresAt: number;
  functionId: string | null;
}

interface FunctionResolveState {
  cache: Map<string, FunctionResolveCacheEntry>;
  inFlight: Map<string, Promise<string>>;
  lastPruneAtMs: number;
  maxEntries: number;
}

interface StorageRequestOptions extends RequestInit {
  responseType?: 'blob';
  timeoutMs?: number;
}

type AuthCallback = (event: AuthChangeEvent, session: Session | null) => void;
type HostedAuthOptions = NonNullable<Parameters<AuthClient['getHostedAuthUrl']>[0]>;

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_API_URL = 'https://api.volcano.dev';
const DEFAULT_TIMEOUT_MS = 60000; // 60 seconds
const DEFAULT_UPLOAD_PART_SIZE = 25 * 1024 * 1024; // 25MB
const DEFAULT_SESSIONS_LIMIT = 20;
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
function isBrowser(): boolean {
  return typeof window !== 'undefined' && window.document !== undefined;
}

/**
 * Basic provider name sanitization - only alphanumeric and hyphens allowed
 * This is NOT validation (backend validates), just prevents URL injection
 * @param {string} provider - The provider name
 * @throws {Error} If provider contains invalid characters
 */
function sanitizeProvider(provider: string): void {
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
async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetchImplementation: typeof fetch = globalThis.fetch,
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive finite number');
  }
  const controller = new AbortController();
  const abortFromRequest = () => controller.abort(options.signal?.reason);
  if (options.signal?.aborted) {
    abortFromRequest();
  } else {
    options.signal?.addEventListener('abort', abortFromRequest, { once: true });
  }
  const timeoutId = setTimeout(
    () =>
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError')),
    timeoutMs,
  );

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }
    cleanedUp = true;
    clearTimeout(timeoutId);
    options.signal?.removeEventListener('abort', abortFromRequest);
  };

  try {
    const response = await fetchImplementation(url, {
      ...options,
      signal: controller.signal,
    });
    return trackResponseLifecycle(response, cleanup);
  } catch (error) {
    cleanup();
    if (controller.signal.aborted && !options.signal?.aborted) {
      throw VolcanoApiError.from(error, `Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

function controlledRequest(
  signal?: AbortSignal,
  timeoutMs?: number,
): { cleanup: () => void; signal?: AbortSignal } {
  if (timeoutMs === undefined) {
    return {
      signal,
      cleanup() {
        // No composed timeout or event listener to release.
      },
    };
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive finite number');
  }

  const controller = new AbortController();
  const abortFromRequest = () => controller.abort(signal?.reason);
  if (signal?.aborted) {
    abortFromRequest();
  } else {
    signal?.addEventListener('abort', abortFromRequest, { once: true });
  }
  const timeout = setTimeout(
    () =>
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError')),
    timeoutMs,
  );

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', abortFromRequest);
    },
  };
}

async function waitForRequest<T>(promise: Promise<T>, controls: RequestControlOptions): Promise<T> {
  const request = controlledRequest(controls.signal, controls.timeoutMs);
  if (!request.signal) {
    return promise;
  }

  const signal = request.signal;
  let abort: (() => void) | undefined;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
  });

  try {
    return await Promise.race([promise, aborted]);
  } finally {
    if (abort) {
      signal.removeEventListener('abort', abort);
    }
    request.cleanup();
  }
}

function apiError(
  error: unknown,
  fallback = 'Request failed',
  request?: Request,
  response?: Response,
): VolcanoApiError {
  return VolcanoApiError.from(error, fallback, request, response);
}

/**
 * Safely parse JSON from response, returns empty object on failure
 * @param {Response} response
 * @returns {Promise<Object>}
 */
async function safeJsonParse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function parseResponseBody(response?: Response): Promise<unknown> {
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

function responseHeadersToObject(response?: Response): Record<string, string> {
  const headers: Record<string, string> = {};
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

function getHeaderValue(response: Response | undefined, headerName: string): string | null {
  if (!response || !response.headers) {
    return null;
  }
  if (typeof response.headers.get === 'function') {
    return response.headers.get(headerName);
  }
  return null;
}

/**
 * Decode a base64url string to UTF-8 (JWT-safe, Node/browser compatible)
 * @param {string} value
 * @returns {string}
 */
function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = normalized + padding;

  if (typeof atob === 'function') {
    return atob(base64);
  }

  const buffer = (
    globalThis as typeof globalThis & {
      Buffer?: { from(value: string, encoding: string): { toString(encoding: string): string } };
    }
  ).Buffer;
  if (buffer) {
    return buffer.from(base64, 'base64').toString('utf-8');
  }

  throw new Error('No base64 decoder available');
}

function getSharedRuntimeObject(): typeof globalThis & Record<string, unknown> {
  return globalThis as typeof globalThis & Record<string, unknown>;
}

function getSharedFunctionResolveState(): FunctionResolveState {
  const runtime = getSharedRuntimeObject();
  if (!runtime[GLOBAL_FUNCTION_RESOLVE_STATE_KEY]) {
    runtime[GLOBAL_FUNCTION_RESOLVE_STATE_KEY] = {
      cache: new Map(),
      inFlight: new Map(),
      maxEntries: DEFAULT_FUNCTION_RESOLVE_CACHE_MAX_ENTRIES,
      lastPruneAtMs: 0,
    };
  }
  return runtime[GLOBAL_FUNCTION_RESOLVE_STATE_KEY] as FunctionResolveState;
}

function pruneFunctionResolveCache(
  state: FunctionResolveState,
  nowMs = Date.now(),
  force = false,
): void {
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

function projectIdFromToken(token?: string | null): string | undefined {
  if (!token || typeof token !== 'string') {
    return undefined;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return undefined;
  }
  try {
    const payload = JSON.parse(decodeBase64Url(parts[1])) as UnknownRecord;
    return typeof payload.project_id === 'string' && payload.project_id.trim()
      ? payload.project_id.trim()
      : undefined;
  } catch {
    return undefined;
  }
}

function extractRequiredProjectIdFromToken(token?: string | null): string {
  if (!token || typeof token !== 'string') {
    throw new Error('No active session');
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('accessToken must be a JWT with project_id claim');
  }
  let payload: UnknownRecord;
  try {
    payload = JSON.parse(decodeBase64Url(parts[1])) as UnknownRecord;
  } catch {
    throw new Error('accessToken must be a valid JWT with project_id claim');
  }
  if (!payload || typeof payload.project_id !== 'string' || payload.project_id.trim() === '') {
    throw new Error('accessToken missing project_id claim');
  }
  return payload.project_id.trim();
}

function isIPv4Address(hostname: string): boolean {
  return /^(?:\d{1,3}\.){3}\d{1,3}$/.test(hostname);
}

function isIPv6Address(hostname: string): boolean {
  return hostname.includes(':');
}

function isIPAddress(hostname: string): boolean {
  return isIPv4Address(hostname) || isIPv6Address(hostname);
}

function sanitizeFunctionIdentifierForHost(identifier: unknown): string | null {
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

function resolveFunctionInvocationBase(apiUrl: string): FunctionInvocationBase | null {
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
 * @param {VolcanoClientCore} volcanoClient
 * @param {string} url
 * @param {RequestInit} options
 * @returns {Promise<Response>}
 */
async function fetchWithAuthRetry(
  volcanoClient: VolcanoClientCore,
  url: string,
  options: StorageRequestOptions = {},
): Promise<Response> {
  await volcanoClient._ensureFreshSession();
  const credential = () =>
    volcanoClient.accessToken || volcanoClient.serviceRoleKey || volcanoClient.anonKey;
  const doFetch = () =>
    fetchWithTimeout(
      url,
      {
        ...options,
        headers: mergeRequestHeaders(
          volcanoClient.headers,
          options.headers,
          credential() ? { Authorization: `Bearer ${credential()}` } : undefined,
        ),
      },
      options.timeoutMs ?? volcanoClient.timeout,
      volcanoClient.fetch,
    );

  let response = await doFetch();
  if (response.status === 401 && volcanoClient.accessToken && volcanoClient.autoRefreshToken) {
    const refreshed = await volcanoClient._refreshSessionForRequest(response, {
      signal: options.signal ?? undefined,
      timeoutMs: options.timeoutMs,
    });
    if (!refreshed.error) {
      await discardResponse(response);
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
function mergeRequestHeaders(...sources: (HeadersInit | undefined)[]): Headers {
  const headers = new Headers();
  for (const source of sources) {
    new Headers(source).forEach((value, key) => {
      headers.set(key, value);
    });
  }
  return headers;
}

function errorResult<Extra extends UnknownRecord = UnknownRecord>(
  message: string,
  extra?: Extra,
): { data: null; error: VolcanoApiError } & Extra {
  return {
    data: null,
    error: VolcanoApiError.from({ error: message }),
    ...(extra ?? ({} as Extra)),
  };
}

const FULL_ACCESS_APP_NAME = 'volcano_full_access';
const USER_ACCESS_APP_NAME = 'volcano_user_access';
const SESSION_EXPIRY_MARGIN_SECONDS = 60;

const createMemoryStorage = (): AuthStorage => {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem(key) {
      values.delete(key);
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
};

const defaultStorageKey = (config: VolcanoClientConfig, baseUrl: string): string => {
  const projectId = projectIdFromToken(config.anonKey) ?? projectIdFromToken(config.accessToken);
  const namespace = projectId ?? new URL(baseUrl).host.replaceAll(/[^a-z0-9.-]/gi, '-');
  return `volcano-${namespace}-auth-token`;
};

const resolveAuthStorage = (options: VolcanoClientConfig['auth']): AuthStorage => {
  if (options?.storage) {
    return options.storage;
  }
  if (isBrowser() && options?.persistSession !== false) {
    return globalThis.localStorage;
  }
  return createMemoryStorage();
};

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
function databaseConnectionString(
  baseConnectionString: string,
  options: { userId?: string | null } | null = {},
): string {
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

// ============================================================================
// Stateful client core
// ============================================================================

class VolcanoClientCore {
  readonly anonKey: string | null;
  readonly api: ApiClient;
  readonly apiUrl: string;
  readonly auth: AuthClient;
  readonly autoRefreshToken: boolean;
  readonly fetch: typeof fetch;
  readonly functionInvocationBase: FunctionInvocationBase | null;
  readonly functions: FunctionsClient;
  readonly headers: Headers;
  readonly persistSession: boolean;
  readonly serviceRoleKey: string | null;
  readonly storage: StorageClient;
  readonly storageAdapter: AuthStorage;
  readonly storageKey: string;
  readonly timeout: number;
  readonly userToken: string | null;
  accessToken: string | null;
  currentSession: Session | null = null;
  currentUser: User | null = null;
  refreshToken: string | null;
  private _authGeneration = 0;
  private readonly _authCallbacks = new Set<AuthCallback>();
  private readonly _functionResolveState: FunctionResolveState;
  private readonly _initializationPromise: Promise<void>;
  private _pendingRedirectSessionGeneration: number | null = null;
  private readonly _retryRequests = new WeakMap<Request, Request>();
  private _refreshState: {
    clearOnFailure: boolean;
    generation: number;
    promise: Promise<SessionResponse>;
  } | null = null;
  private _storageMutationPromise: Promise<unknown> = Promise.resolve();
  private _urlSessionConsumed = false;

  constructor(config: VolcanoClientConfig = {}) {
    assertBrowserSafeCredentials(
      config.accessToken,
      config.anonKey,
      config.serviceRoleKey,
      config.userToken,
    );

    this.apiUrl = normalizeBaseUrl(config.baseUrl ?? DEFAULT_API_URL);
    this.functionInvocationBase = resolveFunctionInvocationBase(this.apiUrl);
    this.anonKey = config.anonKey || null;
    this.serviceRoleKey = config.serviceRoleKey || null;
    this.userToken = config.userToken || null;
    this.timeout = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(this.timeout) || this.timeout <= 0) {
      throw new TypeError('timeoutMs must be a positive finite number');
    }
    this.fetch = config.fetch ?? globalThis.fetch;
    if (typeof this.fetch !== 'function') {
      throw new TypeError('fetch must be provided when globalThis.fetch is unavailable');
    }
    this.headers = new Headers(config.headers);
    if (!this.headers.has('X-Client-Info')) {
      this.headers.set('X-Client-Info', CLIENT_INFO);
    }
    this.autoRefreshToken = config.auth?.autoRefreshToken !== false;
    this.persistSession = config.auth?.persistSession !== false;
    this.storageAdapter = resolveAuthStorage(config.auth);
    this.storageKey = config.auth?.storageKey ?? defaultStorageKey(config, this.apiUrl);
    this._functionResolveState = getSharedFunctionResolveState();

    this.accessToken = config.accessToken ?? null;
    this.refreshToken = config.refreshToken ?? null;

    this.api = createApiClient({
      accessToken: this.accessToken || undefined,
      anonKey: this.anonKey || undefined,
      baseUrl: this.apiUrl,
      fetch: this.fetch,
      headers: this.headers,
      serviceRoleKey: this.serviceRoleKey || undefined,
      timeoutMs: this.timeout,
      userToken: this.userToken || undefined,
    });
    this._initializationPromise = this._initializeSession(config.accessToken !== undefined);
    this.api.interceptors.request.use((request, options) =>
      this._handleApiRequest(request, options),
    );
    this.api.interceptors.response.use((response, request, options) =>
      this._handleApiResponse(response, request, options),
    );

    // Sub-objects for organization
    this.auth = {
      signUp: this.signUp.bind(this),
      signIn: this.signIn.bind(this),
      signOut: this.signOut.bind(this),
      getUser: this.getUser.bind(this),
      getSession: this.getSession.bind(this),
      updateUser: this.updateUser.bind(this),
      refreshSession: this.refreshSession.bind(this),
      initialize: this.initialize.bind(this),
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

    this.storage = {
      from: this.storageBucket.bind(this),
    };
  }

  async _callApi<T extends ApiOperation>(
    operation: T,
    options: OperationOptions<T> = {} as OperationOptions<T>,
    fallback = 'Request failed',
    controls: RequestControlOptions = {},
  ): Promise<NormalizedApiResult<OperationData<T>>> {
    await this._initializationPromise;
    this.api.setCredentials({
      accessToken: this.accessToken || undefined,
      anonKey: this.anonKey || undefined,
      serviceRoleKey: this.serviceRoleKey || undefined,
      userToken: this.userToken || undefined,
    });
    const optionSignal = (options as OperationOptions<T> & { signal?: AbortSignal }).signal;
    const request = controlledRequest(controls.signal ?? optionSignal, controls.timeoutMs);
    let result: ApiResultLike | undefined;
    try {
      result = (await operation({
        ...options,
        client: this.api,
        signal: request.signal,
      } as Parameters<T>[0])) as ApiResultLike | undefined;
    } finally {
      request.cleanup();
    }
    if (!result) {
      return {
        data: null,
        error: VolcanoApiError.from(undefined, fallback),
        ok: false,
        status: null,
      };
    }
    if (result.error !== undefined) {
      return {
        data: (result.data ?? null) as OperationData<T> | null,
        error: apiError(result.error, fallback, result.request, result.response),
        ok: false,
        status: result.response ? result.response.status : null,
      };
    }
    return {
      data: result.data as OperationData<T>,
      error: null,
      ok: true,
      status: result.response ? result.response.status : null,
    };
  }

  async _handleApiRequest(request: Request, options: ResolvedRequestOptions): Promise<Request> {
    await this._initializationPromise;
    const usesAuthUserAccessToken = this._usesAuthUserAccessToken(options.security);
    if (usesAuthUserAccessToken) {
      await this._ensureFreshSession();
    }

    let prepared = request;
    if (usesAuthUserAccessToken && this.accessToken) {
      const headers = new Headers(request.headers);
      headers.set('Authorization', `Bearer ${this.accessToken}`);
      prepared = new Request(request, { headers });
    }
    if (usesAuthUserAccessToken && this.accessToken && this.autoRefreshToken && prepared.body) {
      this._retryRequests.set(prepared, prepared.clone());
    }
    return prepared;
  }

  async _handleApiResponse(
    response: Response,
    request: Request,
    options: ResolvedRequestOptions,
  ): Promise<Response> {
    const retryRequest = this._retryRequests.get(request);
    this._retryRequests.delete(request);
    const usesAuthUserAccessToken = (options.security || []).some(
      (security) => security.key === 'AuthUserAccessToken',
    );
    if (response.status !== 401 || !usesAuthUserAccessToken || !this.accessToken) {
      return response;
    }

    if (!this.autoRefreshToken) {
      return response;
    }

    const refreshed = await this._refreshSessionForRequest(response, { signal: request.signal });
    if (refreshed.error || !this.accessToken) {
      return response;
    }

    const headers = new Headers(retryRequest?.headers ?? request.headers);
    headers.set('Authorization', `Bearer ${this.accessToken}`);
    const retryFetch = this.api.getConfig().fetch || this.fetch;
    await discardResponse(response);
    return retryFetch(new Request(retryRequest ?? request, { headers }));
  }

  _usesAuthUserAccessToken(security?: readonly Auth[]): boolean {
    return (security ?? []).some((scheme) => scheme.key === 'AuthUserAccessToken');
  }

  async _ensureFreshSession(): Promise<void> {
    await this._initializationPromise;
    if (
      !this.autoRefreshToken ||
      !this.currentSession ||
      !this.refreshToken ||
      this.currentSession.expires_at - Math.floor(Date.now() / 1000) > SESSION_EXPIRY_MARGIN_SECONDS
    ) {
      return;
    }
    await this._refreshSessionSingleFlight(false);
  }

  _refreshSessionSingleFlight(clearOnFailure = false): Promise<SessionResponse> {
    const generation = this._authGeneration;
    let state = this._refreshState;
    if (!state || state.generation !== generation) {
      state = {
        clearOnFailure,
        generation,
        promise: Promise.resolve({ session: null, error: null }),
      };
      state.promise = this._refreshSession(() => state?.clearOnFailure === true).finally(() => {
        if (this._refreshState === state) {
          this._refreshState = null;
        }
      });
      this._refreshState = state;
    } else if (clearOnFailure) {
      state.clearOnFailure = true;
    }
    return state.promise;
  }

  async _refreshSessionForRequest(
    response: Response,
    controls: RequestControlOptions,
  ): Promise<SessionResponse> {
    try {
      return await waitForRequest(this._refreshSessionSingleFlight(true), controls);
    } catch (error) {
      await discardResponse(response);
      throw error;
    }
  }

  // ========================================================================
  // Storage Methods
  // ========================================================================

  /**
   * Select a storage bucket to perform operations on
   * @param {string} bucketName - The name of the bucket
   * @returns {StorageFileApi} - Storage file API for the bucket
   */
  storageBucket(bucketName: string): StorageFileClient {
    return new StorageFileApi(this, bucketName);
  }

  async _credentialError(
    message = 'No active session or API credential.',
  ): Promise<VolcanoApiError | null> {
    await this._initializationPromise;
    return this.accessToken || this.serviceRoleKey || this.anonKey
      ? null
      : VolcanoApiError.from({ code: 'missing_credentials', error: message });
  }

  _getFunctionInvokeUrl(functionIdentifier: string): string {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionIdentifier);
    if (!hostLabel) {
      throw new Error(
        'functionId must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars',
      );
    }

    if (!this.functionInvocationBase) {
      throw new Error(
        'baseUrl must be api.<domain> (or localhost/IP for local mode) to use DNS function invocation',
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

  _functionResolveCacheKey(functionName: string): string {
    const tokenScope = this.accessToken || this.serviceRoleKey || this.anonKey;
    const projectScope = extractRequiredProjectIdFromToken(tokenScope);
    return `${this.apiUrl}|project:${projectScope}|token:${tokenScope}|${functionName}`;
  }

  _clearFunctionResolveCache(functionName: string): void {
    const cacheKey = this._functionResolveCacheKey(functionName);
    this._functionResolveState.cache.delete(cacheKey);
    this._functionResolveState.inFlight.delete(cacheKey);
  }

  async _resolveFunctionIdByName(
    functionName: string,
    controls: RequestControlOptions = {},
  ): Promise<string> {
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
      if (cached.functionId) {
        return cached.functionId;
      }
    }
    if (cached) {
      this._functionResolveState.cache.delete(cacheKey);
    }

    const inFlight = this._functionResolveState.inFlight.get(cacheKey);
    if (inFlight) {
      return waitForRequest(inFlight, controls);
    }

    const pending = (async () => {
      const result = await this._callApi(
        resolveFunctionForInvocation,
        { query: { name: hostLabel } },
        'Failed to resolve function',
        controls,
      );
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

    if (controls.signal || controls.timeoutMs !== undefined) {
      return pending;
    }

    this._functionResolveState.inFlight.set(cacheKey, pending);
    try {
      return await pending;
    } finally {
      this._functionResolveState.inFlight.delete(cacheKey);
    }
  }

  // ========================================================================
  // Query Builder Methods
  // ========================================================================

  database<Database extends GenericDatabase>(databaseName: string): DatabaseClientType<Database> {
    return new DatabaseClient<Database>(this, databaseName);
  }

  // ========================================================================
  // Authentication Methods
  // ========================================================================

  async signUp({
    email,
    password,
    metadata = {},
    signInWhenAllowed = false,
  }: SignUpOptions): Promise<SignUpResponse> {
    const result = await this._callApi(
      authSignup,
      { body: { email, password, user_metadata: metadata } },
      'Sign up failed',
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

  async signIn({ email, password }: SignInOptions): Promise<AuthResponse> {
    const result = await this._callApi(authSignin, { body: { email, password } }, 'Sign in failed');

    if (!result.ok) {
      return { user: null, session: null, error: result.error };
    }

    const { session } = await this._setSession(result.data, 'SIGNED_IN');
    return {
      user: result.data.user,
      session,
      error: null,
    };
  }

  async signOut(): Promise<{ error: VolcanoApiError | null }> {
    await this._initializationPromise;
    if (this.refreshToken) {
      try {
        await this._callApi(authLogout, { body: { refresh_token: this.refreshToken } });
      } catch (error) {
        console.warn(
          '[Volcano] Logout request failed:',
          error instanceof Error ? error.message : error,
        );
      }
    }
    await this._clearSession('SIGNED_OUT');
    return { error: null };
  }

  async getUser(): Promise<UserResponse> {
    await this._initializationPromise;
    await this._adoptSessionFromUrl();
    const result = await this._callApi(authGetUser, {}, 'Failed to get user');

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user ?? null;
    if (this.currentSession) {
      const generation = this._authGeneration;
      this.currentSession = { ...this.currentSession, user: this.currentUser };
      const session = this.currentSession;
      await this._persistSession(session);
      if (
        generation === this._authGeneration &&
        this._pendingRedirectSessionGeneration === generation
      ) {
        this._pendingRedirectSessionGeneration = null;
        this._notifyAuthCallbacks('SIGNED_IN', session);
      }
    }
    return { user: this.currentUser, error: null };
  }

  async updateUser({ password, metadata }: UpdateUserOptions): Promise<UserResponse> {
    const result = await this._callApi(
      authUpdateUser,
      { body: { password, user_metadata: metadata } },
      'Failed to update user',
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user ?? null;
    if (this.currentSession) {
      this.currentSession = { ...this.currentSession, user: this.currentUser };
      await this._persistSession();
      this._notifyAuthCallbacks('USER_UPDATED', this.currentSession);
    }
    return { user: this.currentUser, error: null };
  }

  async getSession(): Promise<SessionResponse> {
    await this._initializationPromise;
    await this._ensureFreshSession();
    return { session: this.currentSession, error: null };
  }

  async refreshSession(): Promise<SessionResponse> {
    await this._initializationPromise;
    return this._refreshSessionSingleFlight(true);
  }

  private async _refreshSession(clearOnFailure: () => boolean): Promise<SessionResponse> {
    const authGeneration = this._authGeneration;
    const refreshToken = this.refreshToken;
    if (!refreshToken) {
      if (clearOnFailure()) {
        await this._clearSession('SIGNED_OUT');
      }
      return {
        session: null,
        error: VolcanoApiError.from({ code: 'missing_refresh_token', error: 'No refresh token' }),
      };
    }

    try {
      const result = await this._callApi(
        authRefresh,
        { body: { refresh_token: refreshToken } },
        'Session refresh failed',
      );

      if (authGeneration !== this._authGeneration || refreshToken !== this.refreshToken) {
        return { session: this.currentSession, error: null };
      }

      if (!result.ok) {
        if (clearOnFailure() || this._isSessionExpired()) {
          await this._clearSession('SIGNED_OUT');
        }
        return { session: null, error: result.error };
      }

      const refreshed = await this._setSession(result.data, 'TOKEN_REFRESHED');
      return {
        session:
          refreshed.generation === this._authGeneration ? refreshed.session : this.currentSession,
        error: null,
      };
    } catch (error) {
      if (authGeneration !== this._authGeneration || refreshToken !== this.refreshToken) {
        return { session: this.currentSession, error: null };
      }
      if (clearOnFailure() || this._isSessionExpired()) {
        await this._clearSession('SIGNED_OUT');
      }
      return {
        session: null,
        error: VolcanoApiError.from(error, 'Refresh failed'),
      };
    }
  }

  /**
   * Register a callback for auth state changes.
   * @param {Function} callback - Called with the auth event and current session
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChange(callback: AuthCallback): () => void {
    this._authCallbacks.add(callback);
    this._initializationPromise
      .then(() => {
        if (!this._authCallbacks.has(callback)) {
          return;
        }
        try {
          callback('INITIAL_SESSION', this.currentSession);
        } catch (error) {
          console.error('[Volcano] Error in auth state callback:', error);
        }
      })
      .catch((error: unknown) => {
        console.error('[Volcano] Failed to initialize auth state callback:', error);
      });

    return () => {
      this._authCallbacks.delete(callback);
    };
  }

  // ========================================================================
  // Anonymous User Methods
  // ========================================================================

  async signUpAnonymous(metadata: UserMetadata = {}): Promise<AuthResponse> {
    const result = await this._callApi(
      authSignupAnonymous,
      { body: { user_metadata: metadata } },
      'Anonymous sign up failed',
    );

    if (!result.ok) {
      return { user: null, session: null, error: result.error };
    }

    const { session } = await this._setSession(result.data, 'SIGNED_IN');
    return {
      user: result.data.user,
      session,
      error: null,
    };
  }

  async convertAnonymous({
    email,
    password,
    metadata = {},
  }: {
    email: string;
    metadata?: UserMetadata;
    password: string;
  }): Promise<UserResponse> {
    const result = await this._callApi(
      authConvertAnonymous,
      { body: { email, password, user_metadata: metadata } },
      'Anonymous account conversion failed',
    );

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user ?? null;
    if (this.currentSession) {
      this.currentSession = { ...this.currentSession, user: this.currentUser };
      await this._persistSession();
      this._notifyAuthCallbacks('USER_UPDATED', this.currentSession);
    }
    return { user: this.currentUser, error: null };
  }

  // ========================================================================
  // Email Confirmation Methods
  // ========================================================================

  async confirmEmail(token: string): Promise<MessageResponse> {
    const result = await this._callApi(authConfirmEmail, { body: { token } });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message ?? null, error: null };
  }

  async resendConfirmation(email: string): Promise<MessageResponse> {
    const result = await this._callApi(authResendConfirmation, { body: { email } });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message ?? null, error: null };
  }

  // ========================================================================
  // Password Recovery Methods
  // ========================================================================

  async forgotPassword(email: string): Promise<MessageResponse> {
    const result = await this._callApi(authForgotPassword, { body: { email } });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message ?? null, error: null };
  }

  async resetPassword({
    token,
    newPassword,
  }: {
    newPassword: string;
    token: string;
  }): Promise<MessageResponse> {
    const result = await this._callApi(authResetPassword, {
      body: { token, new_password: newPassword },
    });

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message ?? null, error: null };
  }

  // ========================================================================
  // Email Change Methods
  // ========================================================================

  async requestEmailChange(newEmail: string): Promise<{
    error: VolcanoApiError | null;
    message: string | null;
    newEmail: string | null;
  }> {
    const result = await this._callApi(authRequestEmailChange, {
      body: { new_email: newEmail },
    });

    if (!result.ok) {
      return { message: null, newEmail: null, error: result.error };
    }
    return {
      message: result.data.message ?? null,
      newEmail: result.data.new_email ?? null,
      error: null,
    };
  }

  async confirmEmailChange(emailChangeToken: string): Promise<UserResponse> {
    const result = await this._callApi(authConfirmEmailChange, {
      body: { email_change_token: emailChangeToken },
    });

    if (!result.ok) {
      return { user: null, error: result.error };
    }

    this.currentUser = result.data.user ?? null;
    if (this.currentSession) {
      this.currentSession = { ...this.currentSession, user: this.currentUser };
      await this._persistSession();
      this._notifyAuthCallbacks('USER_UPDATED', this.currentSession);
    }
    return { user: this.currentUser, error: null };
  }

  async cancelEmailChange(): Promise<MessageResponse> {
    const result = await this._callApi(authCancelEmailChange);

    if (!result.ok) {
      return { message: null, error: result.error };
    }
    return { message: result.data.message ?? null, error: null };
  }

  // ========================================================================
  // OAuth / SSO Authentication
  // ========================================================================

  signInWithOAuth(provider: OAuthProviderName, options: { redirectTo?: string } = {}): string {
    sanitizeProvider(provider);
    if (!isBrowser()) {
      throw new Error(
        'OAuth sign-in is only available in browser environment. Use server-side auth flow for SSR.',
      );
    }
    // Bind the returned session to this flow: generate a one-time nonce, store it,
    // and carry it in the redirect_url query as vh_state. The OAuth callback echoes
    // it into the post-auth fragment as `state`, which _consumeSessionFromUrl
    // validates against the stored nonce (login-CSRF / session-fixation defense).
    const nonce = this._generateAuthStateNonce();
    this._storeAuthState(nonce);

    const redirectBase = this._resolveOAuthRedirectTarget(options.redirectTo);
    const redirectURL = new URL(redirectBase);
    redirectURL.searchParams.set('vh_state', nonce);

    if (!this.anonKey) {
      throw new Error('anonKey is required for OAuth sign-in');
    }
    const oauthUrl =
      `${this.apiUrl}/auth/oauth/${provider}/authorize` +
      `?anon_key=${encodeURIComponent(this.anonKey)}` +
      `&redirect_url=${encodeURIComponent(redirectURL.toString())}`;
    try {
      if (window.location && typeof window.location.assign === 'function') {
        window.location.assign(oauthUrl);
      } else {
        window.location.href = oauthUrl;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? '');
      if (!message.includes('Not implemented: navigation')) {
        throw err;
      }
    }
    return oauthUrl;
  }

  // Resolve where the OAuth callback should return the browser. Defaults to the
  // current page (without query/hash), which is also the page that will adopt
  // the returned session.
  private _resolveOAuthRedirectTarget(redirectTo?: string): string {
    if (typeof redirectTo === 'string' && redirectTo.trim() !== '') {
      return redirectTo.trim();
    }
    const loc = window.location;
    return `${loc.origin}${loc.pathname}`;
  }

  // Build the managed hosted-auth URL for this project and store a one-time nonce
  // so the returned session can be bound to this flow. Pass { action: 'signup' |
  // 'login' | 'forgot-password' } to deep-link a step. Browser-only.
  getHostedAuthUrl(options: HostedAuthOptions = {}): string {
    if (!isBrowser()) {
      throw new Error('getHostedAuthUrl is only available in the browser.');
    }
    const projectId = this._resolveProjectIdForHostedAuth(options.projectId);
    const nonce = this._generateAuthStateNonce();
    this._storeAuthState(nonce);

    const url = new URL(`${this.apiUrl}/projects/${projectId}/auth/hosted`);
    if (!this.anonKey) {
      throw new Error('anonKey is required for hosted authentication');
    }
    url.searchParams.set('anon_key', this.anonKey);
    if (options.action) {
      url.searchParams.set('action', String(options.action));
    }
    url.searchParams.set('state', nonce);
    return url.toString();
  }

  // Redirect the browser to the managed hosted-auth pages (stores the nonce).
  signInWithHostedAuth(options: HostedAuthOptions = {}): string {
    const url = this.getHostedAuthUrl(options);
    try {
      if (window.location && typeof window.location.assign === 'function') {
        window.location.assign(url);
      } else {
        window.location.href = url;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? '');
      if (!message.includes('Not implemented: navigation')) {
        throw err;
      }
    }
    return url;
  }

  private _resolveProjectIdForHostedAuth(explicitProjectId?: string): string {
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

  signInWithGoogle(): string {
    return this.signInWithOAuth('google');
  }
  signInWithGitHub(): string {
    return this.signInWithOAuth('github');
  }
  signInWithMicrosoft(): string {
    return this.signInWithOAuth('microsoft');
  }
  signInWithApple(): string {
    return this.signInWithOAuth('apple');
  }

  async linkOAuthProvider(provider: OAuthProviderName): Promise<ErrorResponse<unknown>> {
    sanitizeProvider(provider);
    const result = await this._callApi(authLinkOAuthProvider, { path: { provider } });

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data, error: null };
  }

  async unlinkOAuthProvider(
    provider: OAuthProviderName,
  ): Promise<{ error: VolcanoApiError | null }> {
    sanitizeProvider(provider);
    const result = await this._callApi(authUnlinkOAuthProvider, { path: { provider } });

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  async getLinkedOAuthProviders(): Promise<{
    error: VolcanoApiError | null;
    providers: unknown[] | null;
  }> {
    const result = await this._callApi(authListOAuthProviders);

    if (!result.ok) {
      return { providers: null, error: result.error };
    }
    return { providers: result.data.providers || [], error: null };
  }

  async refreshOAuthToken(provider: OAuthProviderName): Promise<{
    error: VolcanoApiError | null;
    expiresIn: number | null;
    message: string | null;
    provider: string | null;
  }> {
    sanitizeProvider(provider);
    const result = await this._callApi(refreshOAuthProviderToken, { path: { provider } });

    if (!result.ok) {
      return { message: null, provider: null, expiresIn: null, error: result.error };
    }
    return {
      message: result.data.message ?? null,
      provider: result.data.provider ?? null,
      expiresIn: result.data.expires_in ?? null,
      error: null,
    };
  }

  async getOAuthProviderToken(provider: OAuthProviderName): Promise<{
    error: VolcanoApiError | null;
    expiresIn: number | null;
    message: string | null;
    provider: string | null;
  }> {
    sanitizeProvider(provider);
    const result = await this._callApi(getOAuthProviderToken, { path: { provider } });

    if (!result.ok) {
      return { message: null, provider: null, expiresIn: null, error: result.error };
    }
    return {
      message: result.data.message ?? null,
      provider: result.data.provider ?? null,
      expiresIn: result.data.expires_in ?? null,
      error: null,
    };
  }

  async callOAuthAPI<T = unknown>(
    provider: OAuthProviderName,
    {
      endpoint,
      method = 'GET',
      body,
    }: { body?: Record<string, unknown>; endpoint: string; method?: 'GET' | 'POST' },
  ): Promise<ErrorResponse<T>> {
    sanitizeProvider(provider);
    const result = await this._callApi(callOAuthProviderApi, {
      body: { endpoint, method, body },
      path: { provider },
    });

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: result.data as T, error: null };
  }

  // ========================================================================
  // Session Management (User's sessions)
  // ========================================================================

  async getSessions(
    options: NonNullable<Parameters<AuthClient['getSessions']>[0]> = {},
  ): Promise<SessionsResponse> {
    const { page = 1, limit = DEFAULT_SESSIONS_LIMIT } = options;
    const result = await this._callApi(authGetMySessions, { query: { limit, page } });

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
      sessions: result.data.sessions ?? [],
      total: result.data.total ?? 0,
      page: result.data.page ?? page,
      limit: result.data.limit ?? limit,
      total_pages: result.data.total_pages ?? 0,
      error: null,
    };
  }

  async deleteSession(sessionId: string): Promise<{ error: VolcanoApiError | null }> {
    const result = await this._callApi(authDeleteMySession, { path: { sessionId } });

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  async deleteAllOtherSessions(): Promise<{ error: VolcanoApiError | null }> {
    const result = await this._callApi(authDeleteAllMySessions);

    if (!result.ok) {
      return { error: result.error };
    }
    return { error: null };
  }

  // ========================================================================
  // Function Invocation
  // ========================================================================

  async invokeFunction<T = unknown>(
    functionName: string,
    options: FunctionInvokeOptions = {},
  ): Promise<FunctionInvokeResult<T>> {
    if (!functionName || typeof functionName !== 'string') {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: VolcanoApiError.from({
          code: 'invalid_function_name',
          error: 'functionName must be a non-empty string',
        }),
      };
    }
    const credential = () => this.accessToken || this.serviceRoleKey || this.anonKey;
    const credentialError = await this._credentialError('No active session');
    if (credentialError) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: credentialError,
      };
    }
    if (!this.functionInvocationBase) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: VolcanoApiError.from({
          code: 'invalid_function_base_url',
          error:
            'baseUrl must be api.<domain> (or localhost/IP for local mode) to use DNS function invocation',
        }),
      };
    }

    await this._ensureFreshSession();

    let resolvedFunctionId: string;
    try {
      resolvedFunctionId = await this._resolveFunctionIdByName(functionName.trim(), options);
    } catch (error) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: VolcanoApiError.from(error, 'Failed to resolve function'),
      };
    }

    let invokeUrl: string;
    try {
      invokeUrl = this._getFunctionInvokeUrl(resolvedFunctionId);
    } catch (error) {
      return {
        data: null,
        status: null,
        headers: {},
        version: null,
        error: VolcanoApiError.from(error, 'Invalid function identifier'),
      };
    }

    const invokeOnce = async (
      url: string,
      allowRefresh: boolean,
    ): Promise<FunctionInvokeResult<T>> => {
      const body = options.body ?? {};
      const requestHeaders = mergeRequestHeaders(
        this.headers,
        options.headers,
        { 'Content-Type': 'application/json' },
        credential() ? { Authorization: `Bearer ${credential()}` } : undefined,
      );
      try {
        const response = await fetchWithTimeout(
          url,
          {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify({ payload: body }),
            signal: options.signal,
          },
          options.timeoutMs ?? this.timeout,
          this.fetch,
        );

        const versionHeader = getHeaderValue(response, 'x-volcano-version');
        if (
          response.status === 401 &&
          allowRefresh &&
          this.autoRefreshToken &&
          this.accessToken &&
          !versionHeader
        ) {
          const refreshed = await this._refreshSessionForRequest(response, options);
          if (!refreshed.error) {
            await discardResponse(response);
            return invokeOnce(url, false);
          }
        }

        const data = await parseResponseBody(response);
        const headers = responseHeadersToObject(response);
        const version = versionHeader || null;

        if (!response.ok && !versionHeader) {
          return {
            data: null,
            status: response.status,
            headers,
            version,
            error: apiError(
              data,
              `Invoke request failed with status ${response.status}`,
              new Request(url, { method: 'POST', headers: requestHeaders }),
              response,
            ),
          };
        }

        return {
          data: data as T | string | null,
          status: response.status,
          headers,
          version,
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          status: null,
          headers: {},
          version: null,
          error: VolcanoApiError.from(error, 'Request failed'),
        };
      }
    };

    let result = await invokeOnce(invokeUrl, true);

    // Function can be deleted/recreated, making cached name->id mapping stale.
    // On an unversioned router 404, invalidate and resolve once more before failing.
    if (result.status === 404 && result.error && !result.version) {
      this._clearFunctionResolveCache(functionName.trim());
      try {
        resolvedFunctionId = await this._resolveFunctionIdByName(functionName.trim(), options);
        invokeUrl = this._getFunctionInvokeUrl(resolvedFunctionId);
        result = await invokeOnce(invokeUrl, true);
      } catch (error) {
        return {
          data: null,
          status: null,
          headers: {},
          version: null,
          error: VolcanoApiError.from(error, 'Failed to resolve function'),
        };
      }
    }

    return result;
  }

  // ========================================================================
  // Session Management (Internal)
  // ========================================================================

  private async _initializeSession(hasExplicitAccessToken: boolean): Promise<void> {
    if (hasExplicitAccessToken) {
      return;
    }

    if (this._hasSessionInUrl()) {
      if (await this._adoptSessionFromUrl()) {
        return;
      }
    }

    if (!this.persistSession) {
      return;
    }

    try {
      const stored = await this.storageAdapter.getItem(this.storageKey);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored) as unknown;
      if (!this._isValidSession(parsed)) {
        await this._removePersistedSession();
        return;
      }
      this._adoptSession(parsed);
    } catch (error) {
      console.warn('[Volcano] Failed to restore the persisted session:', error);
    }
  }

  private _isValidSession(value: unknown): value is Session {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const session = value as Partial<Session>;
    return (
      typeof session.access_token === 'string' &&
      typeof session.refresh_token === 'string' &&
      typeof session.expires_in === 'number' &&
      Number.isFinite(session.expires_in) &&
      typeof session.expires_at === 'number' &&
      Number.isFinite(session.expires_at) &&
      !isClientServiceKey(session.access_token)
    );
  }

  private _sessionFromTokenResponse(data: AuthTokenResponse): Session {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_in: data.expires_in,
      expires_at: Math.floor(Date.now() / 1000) + data.expires_in,
      user: data.user,
    };
  }

  private _adoptSession(session: Session): number {
    assertBrowserSafeCredentials(session.access_token);
    this._authGeneration += 1;
    this.currentSession = session;
    this.accessToken = session.access_token;
    this.refreshToken = session.refresh_token;
    this.currentUser = session.user;
    this.api.setCredentials({ accessToken: this.accessToken });
    return this._authGeneration;
  }

  private async _persistSession(session: Session | null = this.currentSession): Promise<void> {
    if (!this.persistSession || !session) {
      return;
    }
    try {
      const value = JSON.stringify(session);
      await this._queueStorageMutation(() => this.storageAdapter.setItem(this.storageKey, value));
    } catch (error) {
      console.warn('[Volcano] Failed to persist the auth session:', error);
    }
  }

  private async _removePersistedSession(): Promise<void> {
    if (!this.persistSession) {
      return;
    }
    try {
      await this._queueStorageMutation(() => this.storageAdapter.removeItem(this.storageKey));
    } catch (error) {
      console.warn('[Volcano] Failed to remove the persisted auth session:', error);
    }
  }

  private _queueStorageMutation(mutation: () => Promise<void> | void): Promise<void> {
    const pending = this._storageMutationPromise.then(mutation);
    this._storageMutationPromise = pending.catch(() => null);
    return pending;
  }

  private async _setSession(
    data: AuthTokenResponse,
    event: AuthChangeEvent,
  ): Promise<{ generation: number; session: Session }> {
    this._pendingRedirectSessionGeneration = null;
    const session = this._sessionFromTokenResponse(data);
    const generation = this._adoptSession(session);
    await this._persistSession(session);
    if (generation === this._authGeneration) {
      this._notifyAuthCallbacks(event, session);
    }
    return { generation, session };
  }

  private async _clearSession(event: AuthChangeEvent): Promise<void> {
    this._pendingRedirectSessionGeneration = null;
    this._authGeneration += 1;
    const generation = this._authGeneration;
    this.accessToken = null;
    this.refreshToken = null;
    this.currentSession = null;
    this.currentUser = null;
    this.api.setCredentials({ accessToken: undefined });

    await this._removePersistedSession();

    if (generation === this._authGeneration) {
      this._notifyAuthCallbacks(event, null);
    }
  }

  private _notifyAuthCallbacks(event: AuthChangeEvent, session: Session | null): void {
    for (const callback of this._authCallbacks) {
      try {
        callback(event, session);
      } catch (error) {
        console.error('[Volcano] Error in auth state callback:', error);
      }
    }
  }

  private _isSessionExpired(): boolean {
    return Boolean(
      this.currentSession && this.currentSession.expires_at <= Math.floor(Date.now() / 1000),
    );
  }

  // ========================================================================
  // Managed Auth Redirect (hosted login/signup hand-off)
  // ========================================================================

  /**
   * Returns true when the current browser URL fragment carries a managed-auth
   * session hand-off (i.e. an access_token from a hosted login/signup redirect).
   * Cheap peek that does not mutate state.
   */
  private _hasSessionInUrl(): boolean {
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
  private _consumeSessionFromUrl(): Session | null {
    // Adopt at most once per client. When the fragment mixes tokens with app
    // params we deliberately leave the hash in place, so without this guard
    // every later getUser() would re-adopt and re-fire auth callbacks.
    if (this._urlSessionConsumed) {
      return null;
    }
    if (!this._hasSessionInUrl()) {
      return null;
    }

    let params: URLSearchParams;
    try {
      params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    } catch {
      return null;
    }

    const accessToken = params.get('access_token');
    if (!accessToken) {
      return null;
    }

    // Login-CSRF / session-fixation defense: only adopt a redirect session that
    // this client initiated. signInWithHostedAuth()/signInWithOAuth() store a
    // one-time nonce before redirecting; the hosted page and OAuth callback echo
    // it back as `state`. Reject (and scrub) any fragment whose `state` does not
    // match the stored nonce — e.g. an attacker-crafted #access_token link.
    const expectedNonce = this._takeAuthState();
    const urlState = params.get('state') || '';
    if (!expectedNonce || urlState === '' || urlState !== expectedNonce) {
      // Unsolicited or mismatched session: do not authenticate. Scrub the tokens
      // from the URL so they don't linger, and mark as handled so we don't loop.
      this._urlSessionConsumed = true;
      this._stripAuthHashFromUrl(params);
      return null;
    }

    if (isClientServiceKey(accessToken)) {
      this._urlSessionConsumed = true;
      this._stripAuthHashFromUrl(params);
      return null;
    }

    const refreshToken = params.get('refresh_token') ?? '';
    const expiresInValue = Number(params.get('expires_in') ?? 3600);
    const expiresIn = Number.isFinite(expiresInValue) && expiresInValue > 0 ? expiresInValue : 3600;

    this._urlSessionConsumed = true;
    this._stripAuthHashFromUrl(params);
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      user: null,
    };
  }

  private async _adoptSessionFromUrl(): Promise<boolean> {
    const session = this._consumeSessionFromUrl();
    if (!session) {
      return false;
    }

    const generation = this._adoptSession(session);
    this._pendingRedirectSessionGeneration = generation;
    await this._persistSession(session);
    if (generation === this._authGeneration) {
      this._notifyAuthCallbacks('SIGNED_IN', session);
    }
    return true;
  }

  /**
   * Remove the managed-auth tokens from the URL fragment so they do not linger
   * in history, referrers, or bookmarks. Only strips when the fragment is
   * exclusively the hand-off params, to avoid clobbering app hash routing.
   */
  private _stripAuthHashFromUrl(params: URLSearchParams): void {
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
  private _generateAuthStateNonce(): string {
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
  private _storeAuthState(nonce: string): void {
    if (!isBrowser()) {
      return;
    }
    try {
      window.sessionStorage.setItem(`${this.storageKey}-oauth-state`, nonce);
    } catch {
      // sessionStorage may be unavailable (privacy mode); the redirect will then
      // be rejected on return, which fails safe.
    }
  }

  // Read and clear the stored nonce (one-time use).
  private _takeAuthState(): string | null {
    if (!isBrowser()) {
      return null;
    }
    try {
      const key = `${this.storageKey}-oauth-state`;
      const nonce = window.sessionStorage.getItem(key);
      window.sessionStorage.removeItem(key);
      return nonce;
    } catch {
      return null;
    }
  }

  // ========================================================================
  // Initialization
  // ========================================================================

  async initialize(): Promise<UserResponse> {
    await this._initializationPromise;
    await this._adoptSessionFromUrl();
    if (this.accessToken) {
      const { user, error } = await this.getUser();
      return { user, error };
    }
    return { user: null, error: null };
  }
}

// ============================================================================
// Database query builders
// ============================================================================

type RowShape = Record<string, unknown>;
type ColumnName<Row extends RowShape> = Extract<keyof Row, string>;
type MutationOperation = 'delete' | 'insert' | 'update';

abstract class FilterBuilder<Row extends RowShape> {
  protected readonly filters: QueryFilter[] = [];

  private addFilter(
    column: ColumnName<Row>,
    operator: QueryFilter['operator'],
    value: FilterValue,
  ): this {
    this.filters.push({ column, operator, value });
    return this;
  }

  eq(column: ColumnName<Row>, value: FilterValue): this {
    return this.addFilter(column, 'eq', value);
  }
  neq(column: ColumnName<Row>, value: FilterValue): this {
    return this.addFilter(column, 'neq', value);
  }
  gt(column: ColumnName<Row>, value: FilterValue): this {
    return this.addFilter(column, 'gt', value);
  }
  gte(column: ColumnName<Row>, value: FilterValue): this {
    return this.addFilter(column, 'gte', value);
  }
  lt(column: ColumnName<Row>, value: FilterValue): this {
    return this.addFilter(column, 'lt', value);
  }
  lte(column: ColumnName<Row>, value: FilterValue): this {
    return this.addFilter(column, 'lte', value);
  }
  like(column: ColumnName<Row>, pattern: string): this {
    return this.addFilter(column, 'like', pattern);
  }
  ilike(column: ColumnName<Row>, pattern: string): this {
    return this.addFilter(column, 'ilike', pattern);
  }
  is(column: ColumnName<Row>, value: null): this {
    return this.addFilter(column, 'is', value);
  }
  in(column: ColumnName<Row>, values: (string | number | boolean)[]): this {
    return this.addFilter(column, 'in', values);
  }
}

class QueryBuilder<Row extends RowShape>
  extends FilterBuilder<Row>
  implements QueryBuilderType<Row>
{
  private readonly orderClauses: {
    ascending: boolean;
    column: string;
  }[] = [];
  private readonly selectColumns: string[];
  private limitValue: number | null = null;
  private offsetValue: number | null = null;

  constructor(
    private readonly volcanoClient: VolcanoClientCore,
    private readonly table: string,
    private readonly databaseName: string,
    columns: '*' | string | string[] = '*',
  ) {
    super();
    this.selectColumns = columns === '*' ? [] : Array.isArray(columns) ? columns : [columns];
  }

  order(column: ColumnName<Row>, options: { ascending?: boolean } = {}): this {
    this.orderClauses.push({ column, ascending: options.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.limitValue = count;
    return this;
  }

  offset(count: number): this {
    this.offsetValue = count;
    return this;
  }

  async execute(): Promise<QueryResult<Row>> {
    const credentialError = await this.volcanoClient._credentialError();
    if (credentialError) {
      return { count: 0, data: null, error: credentialError };
    }
    const body: NonNullable<OperationOptions<typeof queryDatabaseSelect>['body']> = {
      table: this.table,
    };
    if (this.selectColumns.length > 0) {
      body.select = this.selectColumns;
    }
    if (this.filters.length > 0) {
      body.filters = this.filters;
    }
    if (this.orderClauses.length > 0) {
      body.order = this.orderClauses;
    }
    if (this.limitValue !== null) {
      body.limit = this.limitValue;
    }
    if (this.offsetValue !== null) {
      body.offset = this.offsetValue;
    }

    const result = await this.volcanoClient._callApi(
      queryDatabaseSelect,
      { body, path: { databaseName: this.databaseName } },
      'Query failed',
    );
    if (!result.ok) {
      return { count: 0, data: null, error: result.error };
    }
    const data = (result.data.data ?? []) as Row[];
    return { data, error: null, count: result.data.count ?? data.length };
  }

  then<TResult1 = QueryResult<Row>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<Row>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class MutationBuilder<Row extends RowShape>
  extends FilterBuilder<Row>
  implements MutationBuilderType<Row>
{
  constructor(
    private readonly volcanoClient: VolcanoClientCore,
    private readonly table: string,
    private readonly databaseName: string,
    private readonly operation: MutationOperation,
    private readonly values: RowShape | null,
  ) {
    super();
  }

  async execute(): Promise<MutationResult<Row>> {
    const credentialError = await this.volcanoClient._credentialError();
    if (credentialError) {
      return { data: null, error: credentialError };
    }
    if (this.operation !== 'insert' && this.filters.length === 0) {
      return errorResult(`${this.operation} requires at least one filter`);
    }

    let result: NormalizedApiResult<{ data?: RowShape[] }>;
    if (this.operation === 'insert') {
      result = await this.volcanoClient._callApi(
        queryDatabaseInsert,
        {
          body: { table: this.table, values: this.values ?? {} },
          path: { databaseName: this.databaseName },
        },
        'insert failed',
      );
    } else if (this.operation === 'update') {
      result = await this.volcanoClient._callApi(
        queryDatabaseUpdate,
        {
          body: {
            table: this.table,
            values: this.values ?? {},
            filters: this.filters as NonNullable<
              OperationOptions<typeof queryDatabaseUpdate>['body']
            >['filters'],
          },
          path: { databaseName: this.databaseName },
        },
        'update failed',
      );
    } else {
      result = await this.volcanoClient._callApi(
        queryDatabaseDelete,
        {
          body: {
            table: this.table,
            filters: this.filters as NonNullable<
              OperationOptions<typeof queryDatabaseDelete>['body']
            >['filters'],
          },
          path: { databaseName: this.databaseName },
        },
        'delete failed',
      );
    }

    if (!result.ok) {
      return { data: null, error: result.error };
    }
    return { data: (result.data.data ?? []) as Row[], error: null };
  }

  then<TResult1 = MutationResult<Row>, TResult2 = never>(
    onfulfilled?: ((value: MutationResult<Row>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class TableClientImplementation<Table extends GenericTable> {
  constructor(
    private readonly volcanoClient: VolcanoClientCore,
    private readonly table: string,
    private readonly databaseName: string,
  ) {}

  delete(): MutationBuilder<Table['Row']> {
    return new MutationBuilder(this.volcanoClient, this.table, this.databaseName, 'delete', null);
  }

  insert(values: Table['Insert']): MutationBuilder<Table['Row']> {
    return new MutationBuilder(this.volcanoClient, this.table, this.databaseName, 'insert', values);
  }

  select(columns: '*' | string | string[] = '*'): QueryBuilder<Table['Row']> {
    const normalized =
      typeof columns === 'string' && columns !== '*' && columns.includes(',')
        ? columns.split(',').map((column) => column.trim())
        : columns;
    return new QueryBuilder(this.volcanoClient, this.table, this.databaseName, normalized);
  }

  update(values: Table['Update']): MutationBuilder<Table['Row']> {
    return new MutationBuilder(this.volcanoClient, this.table, this.databaseName, 'update', values);
  }
}

class DatabaseClient<Database extends GenericDatabase> implements DatabaseClientType<Database> {
  constructor(
    private readonly volcanoClient: VolcanoClientCore,
    private readonly databaseName: string,
  ) {}

  from<TableName extends Extract<keyof Database['Tables'], string>>(
    table: TableName,
  ): TableClientImplementation<Database['Tables'][TableName]> {
    return new TableClientImplementation(this.volcanoClient, table, this.databaseName);
  }
}

// ============================================================================
// StorageFileApi - For storage operations on a specific bucket
// ============================================================================

class StorageFileApi implements StorageFileClient {
  constructor(
    private readonly volcanoClient: VolcanoClientCore,
    private readonly bucketName: string,
  ) {}

  private _checkAuth(): Promise<VolcanoApiError | null> {
    return this.volcanoClient._credentialError('No active session. Please sign in first.');
  }

  private _buildUrl(path: string): string {
    return `${this.volcanoClient.apiUrl}/storage/${encodeURIComponent(this.bucketName)}/${this._encodePath(path)}`;
  }

  private _encodePath(path: string): string {
    return path
      .split('/')
      .map((segment) => encodeURIComponent(segment))
      .join('/');
  }

  private async _storageRequest<T>(
    url: string,
    options: StorageRequestOptions = {},
  ): Promise<ErrorResponse<T>> {
    try {
      const response = await fetchWithAuthRetry(this.volcanoClient, url, options);
      if (options.responseType === 'blob' && response.ok) {
        return { data: (await response.blob()) as T, error: null };
      }

      const data = await safeJsonParse(response);
      if (!response.ok) {
        return {
          data: null,
          error: apiError(data, 'Storage request failed', new Request(url, options), response),
        };
      }
      return { data: data as T, error: null };
    } catch (error) {
      return { data: null, error: VolcanoApiError.from(error, 'Storage request failed') };
    }
  }

  async upload(
    path: string,
    fileBody: ArrayBuffer | Blob | File,
    options: RequestControlOptions & { contentType?: string } = {},
  ): Promise<ErrorResponse<StorageObject>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }

    try {
      const FileConstructor = globalThis.File;
      let file: Blob | File;
      if (FileConstructor && fileBody instanceof FileConstructor) {
        file = options.contentType
          ? new FileConstructor([fileBody], fileBody.name, { type: options.contentType })
          : fileBody;
      } else if (fileBody instanceof Blob) {
        const contentType = options.contentType || fileBody.type || 'application/octet-stream';
        file = FileConstructor
          ? new FileConstructor([fileBody], path.split('/').pop() || 'file', {
              type: contentType,
            })
          : fileBody;
      } else if (fileBody instanceof ArrayBuffer) {
        const blob = new Blob([fileBody], {
          type: options.contentType || 'application/octet-stream',
        });
        file = FileConstructor
          ? new FileConstructor([blob], path.split('/').pop() || 'file', { type: blob.type })
          : blob;
      } else {
        return errorResult('Invalid file body type. Expected File, Blob, or ArrayBuffer.');
      }
      const result = await this.volcanoClient._callApi(
        uploadStorageObject,
        {
          body: { file },
          path: { bucketName: this.bucketName },
          query: { path },
          signal: options.signal,
        },
        'Upload failed',
        options,
      );
      return result.ok
        ? { data: result.data as StorageObject, error: null }
        : { data: null, error: result.error };
    } catch (error) {
      return { data: null, error: VolcanoApiError.from(error, 'Upload failed') };
    }
  }

  async download(
    path: string,
    options: RequestControlOptions & { range?: string } = {},
  ): Promise<ErrorResponse<Blob>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    return this._storageRequest<Blob>(this._buildUrl(path), {
      method: 'GET',
      headers: options.range ? { Range: options.range } : undefined,
      responseType: 'blob',
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async list(
    prefix = '',
    options: RequestControlOptions & { cursor?: string; limit?: number } = {},
  ): Promise<ErrorResponse<StorageObject[]> & { nextCursor: string | null }> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError, nextCursor: null };
    }
    const result = await this.volcanoClient._callApi(
      listStorageObjects,
      {
        path: { bucketName: this.bucketName },
        query: { cursor: options.cursor, limit: options.limit, prefix: prefix || undefined },
        signal: options.signal,
      },
      'Failed to list storage objects',
      options,
    );
    if (!result.ok) {
      return { data: null, error: result.error, nextCursor: null };
    }
    return {
      data: result.data.objects ?? [],
      error: null,
      nextCursor: result.data.next_cursor ?? null,
    };
  }

  async remove(
    paths: string | string[],
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<{ deleted: string[] }>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    const pathList = Array.isArray(paths) ? paths : [paths];
    const errors: { error: string; path: string }[] = [];
    const deleted: string[] = [];
    for (const path of pathList) {
      const result = await this._storageRequest<unknown>(this._buildUrl(path), {
        method: 'DELETE',
        signal: options.signal,
        timeoutMs: options.timeoutMs,
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
        error: VolcanoApiError.from(
          { code: 'partial_delete', details: errors },
          `Failed to delete ${errors.length} file(s)`,
        ),
      };
    }
    return { data: { deleted }, error: null };
  }

  async move(
    fromPath: string,
    toPath: string,
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<StorageObject>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    const result = await this.volcanoClient._callApi(
      moveStorageObject,
      {
        body: { from: fromPath, to: toPath },
        path: { bucketName: this.bucketName },
        signal: options.signal,
      },
      'Failed to move storage object',
      options,
    );
    return result.ok
      ? { data: result.data as StorageObject, error: null }
      : { data: null, error: result.error };
  }

  async copy(
    fromPath: string,
    toPath: string,
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<StorageObject>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    const result = await this.volcanoClient._callApi(
      copyStorageObject,
      {
        body: { from: fromPath, to: toPath },
        path: { bucketName: this.bucketName },
        signal: options.signal,
      },
      'Failed to copy storage object',
      options,
    );
    return result.ok
      ? { data: result.data as StorageObject, error: null }
      : { data: null, error: result.error };
  }

  getPublicUrl(path: string): ErrorResponse<{ publicUrl: string }> {
    if ((this.volcanoClient.anonKey ?? '').split('.').length !== 3) {
      return errorResult('Invalid anon key format');
    }
    const projectId = projectIdFromToken(this.volcanoClient.anonKey);
    if (!projectId) {
      return errorResult('Project ID not found in anon key');
    }
    return {
      data: {
        publicUrl: `${this.volcanoClient.apiUrl}/public/${projectId}/${encodeURIComponent(this.bucketName)}/${this._encodePath(path)}`,
      },
      error: null,
    };
  }

  async updateVisibility(
    path: string,
    isPublic: boolean,
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<StorageObject>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    return this._storageRequest<StorageObject>(`${this._buildUrl(path)}/visibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: isPublic }),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async createUploadSession(
    path: string,
    options: RequestControlOptions & {
      contentType?: string;
      partSize?: number;
      totalSize: number;
    },
  ): Promise<ErrorResponse<CreateUploadSessionResponse>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    if (!options.totalSize) {
      return errorResult('totalSize is required');
    }
    return this._storageRequest<CreateUploadSessionResponse>(this._buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: path.split('/').pop() || path,
        content_type: options.contentType ?? 'application/octet-stream',
        total_size: options.totalSize,
        part_size: options.partSize,
      }),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<UploadPartResponse>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    return this._storageRequest<UploadPartResponse>(this._buildUrl(path), {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-Upload-Session': sessionId,
        'X-Part-Number': String(partNumber),
      },
      body: partData,
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async completeUploadSession(
    path: string,
    sessionId: string,
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<CompleteUploadSessionResponse>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    return this._storageRequest<CompleteUploadSessionResponse>(this._buildUrl(path), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Session': sessionId,
        'X-Upload-Complete': 'true',
      },
      body: JSON.stringify({}),
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async getUploadSession(
    path: string,
    sessionId: string,
    options: RequestControlOptions = {},
  ): Promise<ErrorResponse<UploadSessionStatusResponse>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    return this._storageRequest<UploadSessionStatusResponse>(this._buildUrl(path), {
      method: 'GET',
      headers: { 'X-Upload-Session': sessionId },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
  }

  async abortUploadSession(
    path: string,
    sessionId: string,
    options: RequestControlOptions = {},
  ): Promise<{ error: VolcanoApiError | null }> {
    const authError = await this._checkAuth();
    if (authError) {
      return { error: authError };
    }
    const result = await this._storageRequest<unknown>(this._buildUrl(path), {
      method: 'DELETE',
      headers: { 'X-Upload-Session': sessionId },
      signal: options.signal,
      timeoutMs: options.timeoutMs,
    });
    return { error: result.error };
  }

  async uploadResumable(
    path: string,
    fileBody: Blob | File,
    options: RequestControlOptions & {
      contentType?: string;
      onProgress?: (uploaded: number, total: number) => void;
      partSize?: number;
    } = {},
  ): Promise<ErrorResponse<StorageObject>> {
    const authError = await this._checkAuth();
    if (authError) {
      return { data: null, error: authError };
    }
    const totalSize = fileBody.size;
    const contentType = options.contentType || fileBody.type || 'application/octet-stream';
    try {
      const sessionResult = await this.createUploadSession(path, {
        totalSize,
        contentType,
        partSize: options.partSize ?? DEFAULT_UPLOAD_PART_SIZE,
        signal: options.signal,
        timeoutMs: options.timeoutMs,
      });
      if (sessionResult.error) {
        return { data: null, error: sessionResult.error };
      }
      if (!sessionResult.data) {
        return errorResult('Upload session response is empty');
      }
      const {
        session_id: sessionId,
        total_parts: totalParts,
        part_size: partSize,
      } = sessionResult.data;
      if (!sessionId || !totalParts || !partSize) {
        return errorResult('Upload session response is incomplete');
      }

      for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(start + partSize, totalSize);
        const part = await this.uploadPart(
          path,
          sessionId,
          partNumber,
          fileBody.slice(start, end),
          options,
        );
        if (part.error) {
          await this.abortUploadSession(path, sessionId, options);
          return { data: null, error: part.error };
        }
        options.onProgress?.(end, totalSize);
      }

      const completed = await this.completeUploadSession(path, sessionId, options);
      if (completed.error) {
        return { data: null, error: completed.error };
      }
      if (!completed.data) {
        return errorResult('Upload completion response is empty');
      }
      if (!completed.data.object) {
        return errorResult('Upload completion response is incomplete');
      }
      return { data: completed.data.object, error: null };
    } catch (error) {
      return { data: null, error: VolcanoApiError.from(error, 'Resumable upload failed') };
    }
  }
}

function createVolcanoClient<Databases extends GenericDatabases = GenericDatabases>(
  config: VolcanoClientConfig = {},
): VolcanoClient<Databases> {
  const client = new VolcanoClientCore(config);
  return {
    api: client.api,
    auth: client.auth,
    database: (<Name extends Extract<keyof Databases, string>>(name: Name) =>
      client.database<Databases[Name]>(name)) as VolcanoClient<Databases>['database'],
    functions: client.functions,
    storage: client.storage,
  };
}

// ============================================================================
// Exports
// ============================================================================

export { createVolcanoClient, databaseConnectionString };

export { VolcanoApiError } from './errors';
