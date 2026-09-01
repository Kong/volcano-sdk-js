/**
 * Volcano Auth SDK Type Definitions
 */

export type {
  components as OpenAPIComponents,
  operations as OpenAPIOperations,
  paths as OpenAPIPaths,
} from './generated/openapi';

export interface VolcanoAuthConfig {
  /**
   * Your Volcano API base URL.
   * Defaults to 'https://api.volcano.dev' if not specified.
   */
  apiUrl?: string;
  /**
   * Your anonymous/public key from project settings.
   * The project ID is embedded in the key - no need to specify it separately.
   *
   * SECURITY: If a service key (sk-*) is passed and the SDK detects a browser
   * environment, an error will be thrown. Service keys bypass Row Level Security
   * and must only be used in secure server-side environments.
   */
  anonKey: string;
  /**
   * Optional access token for server-side use (e.g., Lambda functions).
   * When provided, skips localStorage and uses this token for authenticated requests.
   * Typically obtained from event.__volcano_auth.access_token in Lambda handlers.
   */
  accessToken?: string;
  /**
   * Optional refresh token for server-side use.
   * Should be provided along with accessToken if token refresh is needed.
   */
  refreshToken?: string;
}

/** JSON-serializable value type */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** User metadata object */
export type UserMetadata = Record<string, JsonValue>;

export type UserStatus = 'active' | 'banned' | 'deleted';

export interface User {
  id: string;
  project_id?: string;
  email: string;
  email_confirmed?: boolean;
  user_metadata?: UserMetadata;
  app_metadata?: UserMetadata;
  avatar_url?: string;
  status?: UserStatus;
  banned_until?: string | null;
  last_sign_in_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface CurrentSession {
  access_token: string;
  refresh_token: string | null;
  user: User | null;
}

export interface CompleteSession extends CurrentSession {
  refresh_token: string;
  user: User;
}

export interface CurrentSessionResponse {
  data: { session: CurrentSession | null };
  error: Error | null;
}

export interface SignUpOptions {
  email: string;
  password: string;
  metadata?: UserMetadata;
  /**
   * Opt-in: when the project does not require email confirmation
   * (`confirmationRequired === false`), perform a follow-up {@link VolcanoAuth.signIn}
   * with the same credentials so the returned {@link SignUpResponse} carries a live
   * `user`/`session`. Defaults to `false`, matching the server's session-less signup
   * contract. When confirmation is required this flag has no effect. If the follow-up
   * sign-in fails, `error` is populated and `user`/`session` remain `null` (the
   * account is still created).
   */
  signInWhenAllowed?: boolean;
}

export interface SignInOptions {
  email: string;
  password: string;
}

export interface UpdateUserOptions {
  password?: string;
  metadata?: UserMetadata;
}

export interface ConvertAnonymousOptions {
  email: string;
  password: string;
  metadata?: UserMetadata;
}

export interface ResetPasswordOptions {
  token: string;
  newPassword: string;
}

export interface MessageResponse {
  message: string | null;
  error: Error | null;
}

export interface EmailChangeResponse {
  message: string | null;
  newEmail: string | null;
  emailChangeToken?: string;
  error: Error | null;
}

export interface OAuthTokenResponse {
  message: string | null;
  provider: string | null;
  expiresIn: number | null;
  error: Error | null;
}

export interface OAuthAPIResponse<T = unknown> {
  data: T | null;
  error: Error | null;
}

export interface OAuthAPIParams {
  endpoint: string;
  method?: string;
  body?: JsonValue;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

/**
 * Session-less signup response (VOL-309). The server returns a uniform
 * acknowledgement with no user and no session tokens, so `user`/`session` are
 * always null on success; obtain a session via a separate {@link VolcanoAuth.signIn}.
 * `message` is the server's acknowledgement and `confirmationRequired` reflects
 * the project's auth config.
 */
export interface SignUpResponse {
  user: User | null;
  session: Session | null;
  confirmationRequired: boolean;
  message: string | null;
  error: Error | null;
}

export interface UserResponse {
  user: User | null;
  error: Error | null;
}

export interface SessionResponse {
  session: Session | null;
  error: Error | null;
}

export interface AuthSession {
  id: string;
  user_id: string;
  provider: 'email' | 'google' | 'github' | 'microsoft' | 'apple' | 'anonymous';
  user_agent?: string;
  ip_address?: string;
  last_ip_address?: string;
  expires_at: string;
  last_activity_at?: string;
  session_started_at?: string;
  is_active: boolean;
  is_current: boolean;
  created_at: string;
  updated_at: string;
}

export interface SessionsResponse {
  sessions: AuthSession[] | null;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  error: Error | null;
}

export interface GetSessionsOptions {
  /** Page number (1-indexed, default: 1) */
  page?: number;
  /** Number of sessions per page (max 100, default: 20) */
  limit?: number;
}

export interface DeleteSessionResponse {
  error: Error | null;
}

/** Valid OAuth provider names */
export type OAuthProviderName = 'google' | 'github' | 'microsoft' | 'apple';

export interface OAuthProvider {
  provider: OAuthProviderName;
  linked_at: string;
  updated_at: string;
}

export interface LinkProviderResponse {
  authorization_url: string;
}

export type AuthStateCallback = (user: User | null) => void;

export interface Auth {
  /** Sign up a new user */
  signUp(options: SignUpOptions): Promise<SignUpResponse>;
  /** Sign in existing user */
  signIn(options: SignInOptions): Promise<AuthResponse>;
  /** Read a detached snapshot of the locally held session without validating it. */
  getSession(): Promise<CurrentSessionResponse>;
  /** Adopt a complete session into local memory without network, storage, or listener effects. */
  setSession(session: CompleteSession): Promise<CurrentSessionResponse>;
  /** Sign out current user */
  signOut(): Promise<{ error: Error | null }>;
  /**
   * Get current user data.
   *
   * In the browser the client transparently completes OAuth callbacks by
   * exchanging the returned one-time `code`, then removes it from the URL.
   * Managed email/password hosted auth hand-offs that use a token fragment are
   * also detected, stored, and scrubbed automatically.
   *
   * The redirect must be initiated via signInWithHostedAuth()/signInWithOAuth()
   * (or getHostedAuthUrl()): those store a one-time nonce that the returned
   * `state` is validated against.
   */
  getUser(): Promise<UserResponse>;
  /** Update current user */
  updateUser(options: UpdateUserOptions): Promise<UserResponse>;
  /** Refresh access token */
  refreshSession(): Promise<SessionResponse>;
  /** Listen for auth state changes. Returns unsubscribe function. */
  onAuthStateChange(callback: AuthStateCallback): () => void;
  /** Get current user (synchronous) */
  user(): User | null;

  // Anonymous user methods
  /** Sign in as an anonymous user (no email/password required). */
  signInAnonymously(metadata?: UserMetadata): Promise<AuthResponse>;
  /** @deprecated Use signInAnonymously instead. */
  signUpAnonymous(metadata?: UserMetadata): Promise<AuthResponse>;
  /** Convert anonymous user to authenticated user */
  convertAnonymous(options: ConvertAnonymousOptions): Promise<UserResponse>;

  // Email confirmation methods
  /** Confirm email address with token from signup email */
  confirmEmail(token: string): Promise<MessageResponse>;
  /** Resend email confirmation link */
  resendConfirmation(email: string): Promise<MessageResponse>;

  // Password recovery methods
  /** Request a password reset email without revealing whether the account exists. */
  resetPasswordForEmail(email: string): Promise<MessageResponse>;
  /** Request password reset - sends recovery token to email */
  /** @deprecated Use resetPasswordForEmail. */
  forgotPassword(email: string): Promise<MessageResponse>;
  /** Reset password using recovery token from email */
  resetPassword(options: ResetPasswordOptions): Promise<MessageResponse>;

  // Email change methods
  /** Request email change - sends confirmation to new email */
  requestEmailChange(newEmail: string): Promise<EmailChangeResponse>;
  /** Confirm email change with token from email */
  confirmEmailChange(emailChangeToken: string): Promise<UserResponse>;
  /** Cancel pending email change */
  cancelEmailChange(): Promise<MessageResponse>;

  // Managed hosted auth pages
  /**
   * Build the managed hosted-auth URL for this project and store a one-time
   * nonce (sessionStorage) so the returned session can be bound to this flow
   * (login-CSRF / session-fixation defense). The nonce is sent as `state` and
   * echoed back in the post-auth fragment, which the SDK validates on return.
   * Browser-only. Pass `projectId` when the anon key is opaque (not a JWT).
   */
  getHostedAuthUrl(options?: {
    projectId?: string;
    action?: 'login' | 'signup' | 'forgot-password';
  }): string;
  /** Redirect the browser to the managed hosted-auth pages (stores the nonce). */
  signInWithHostedAuth(options?: {
    projectId?: string;
    action?: 'login' | 'signup' | 'forgot-password';
  }): string;

  // OAuth methods
  /**
   * Start OAuth flow (redirects browser). Throws if the provider is invalid or
   * `redirectTo` contains a reserved OAuth response query parameter.
   * Stores a one-time nonce and carries it through the OAuth callback so the
   * returned authorization code is bound to this flow (login-CSRF defense).
   * The SDK exchanges that code without placing session tokens in the browser
   * URL. `redirectTo` overrides the return URL (defaults to the current page).
   */
  signInWithOAuth(provider: OAuthProviderName, options?: { redirectTo?: string }): string;
  /** Sign in with Google */
  signInWithGoogle(): void;
  /** Sign in with GitHub */
  signInWithGitHub(): void;
  /** Sign in with Microsoft */
  signInWithMicrosoft(): void;
  /** Sign in with Apple */
  signInWithApple(): void;
  /** Link OAuth provider to current user. Throws if provider is invalid. */
  linkOAuthProvider(
    provider: OAuthProviderName,
  ): Promise<{ data: LinkProviderResponse | null; error: Error | null }>;
  /** Unlink OAuth provider. Throws if provider is invalid. */
  unlinkOAuthProvider(provider: OAuthProviderName): Promise<{ error: Error | null }>;
  /** Get linked OAuth providers */
  getLinkedOAuthProviders(): Promise<{ providers: OAuthProvider[] | null; error: Error | null }>;
  /** Refresh OAuth provider access token. Throws if provider is invalid. */
  refreshOAuthToken(provider: OAuthProviderName): Promise<OAuthTokenResponse>;
  /** Get server-held OAuth provider token status. Auto-refreshes if expired; never exposes the token. */
  getOAuthProviderToken(provider: OAuthProviderName): Promise<OAuthTokenResponse>;
  /** Call OAuth provider API on behalf of user. Throws if provider is invalid. */
  callOAuthAPI(provider: OAuthProviderName, params: OAuthAPIParams): Promise<OAuthAPIResponse>;

  // Session management methods
  /** Get paginated sessions for the current user */
  getSessions(options?: GetSessionsOptions): Promise<SessionsResponse>;
  /** Delete a specific session (sign out from that device) */
  deleteSession(sessionId: string): Promise<DeleteSessionResponse>;
  /** Delete all sessions except the current one (sign out from all other devices) */
  deleteAllOtherSessions(): Promise<DeleteSessionResponse>;
}

export interface Functions {
  /**
   * Invoke a serverless function.
   *
   * Pass the function name. The SDK handles invocation routing transparently.
   *
   * @param functionName - Function name.
   * @param payload - Optional JSON-serializable payload to send to the function.
   * @returns Raw function response data, HTTP status, headers, and version metadata.
   *          `version` mirrors `X-Volcano-Version` (`<version>` in production, `<env>-<version>` otherwise).
   *
   * @example
   * ```typescript
   * const { data, error } = await volcano.functions.invoke('my-function', { action: 'process' });
   * if (error) {
   *   console.error('Function failed:', error);
   * } else {
   *   console.log('Result:', data);
   * }
   * ```
   */
  invoke<TPayload = JsonValue, TResult = unknown>(
    functionName: string,
    payload?: TPayload,
  ): Promise<{
    data: TResult | string | null;
    status: number | null;
    headers: Record<string, string>;
    version: string | null;
    /**
     * A platform-layer invocation failure (the deploy is failed/provisioning,
     * the gateway is down, or the network call failed) is a
     * {@link VolcanoSystemError} — detect it via `error.isSystemError`. A
     * function's own non-2xx response is not an error here; it comes back as
     * `data` with `error` null. (Union stays `Error` because
     * `VolcanoSystemError extends Error`; narrow at runtime, not by type.)
     */
    error: Error | null;
  }>;
}

/**
 * Error raised when a function invocation fails at the platform layer rather
 * than inside the invoked function's own code. Detect with
 * `VolcanoSystemError.is(error)` (or `error?.isSystemError === true`) — prefer
 * either over `instanceof`, which can be `false` across duplicate SDK copies in
 * a bundle. Not raised for pre-flight / name-resolution failures (bad name, no
 * session, misconfigured apiUrl, function-not-found), which stay plain `Error`s.
 */
export class VolcanoSystemError extends Error {
  readonly name: 'VolcanoSystemError';
  readonly isSystemError: true;
  /** HTTP status of the blocked invocation, or null for transport failures. */
  readonly status: number | null;
  /** Underlying error for transport failures (network/timeout); undefined otherwise. */
  readonly cause?: unknown;
  constructor(message: string, options?: { status?: number | null; cause?: unknown });
  /**
   * Type guard for platform-layer invocation failures. Prefer over `instanceof`
   * (holds across duplicate SDK copies in a bundle).
   */
  static is(err: unknown): err is VolcanoSystemError;
}

/**
 * A refresh completed after another auth operation replaced or cleared the
 * session. The SDK discards the stale result and does not replay the request.
 */
export class AuthRefreshDiscardedError extends Error {
  readonly name: 'AuthRefreshDiscardedError';
  readonly code: 'auth_refresh_discarded';
  readonly status: 409;
  static is(error: unknown): error is AuthRefreshDiscardedError;
}

/** A stale auth operation completed after another logical session won. */
export class AuthSessionChangedError extends Error {
  readonly name: 'AuthSessionChangedError';
  readonly code: 'auth_session_changed';
  readonly status: 409;
  static is(error: unknown): error is AuthSessionChangedError;
}

// ============================================================================
// Logs Types
// ============================================================================

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type LogResourceType = 'function' | 'frontend' | 'database';

export interface LogDeploymentSelector {
  ids?: string[];
}

export type LogRequestResource =
  | {
      type: 'function';
      ids?: string[];
      deployments?: LogDeploymentSelector;
    }
  | {
      type: 'frontend';
      ids?: string[];
      deployments?: LogDeploymentSelector;
    }
  | {
      type: 'database';
      ids?: string[];
    };

export interface LogSearchRequest {
  resource: LogRequestResource;
  q?: string;
  levels?: LogLevel[];
  regions?: string[];
  start_time?: string;
  end_time?: string;
  limit?: number;
  cursor?: string;
}

export interface LogActivityRequest {
  resource: LogRequestResource;
  q?: string;
  levels?: LogLevel[];
  regions?: string[];
  start_time?: string;
  end_time?: string;
  bucket_count?: number;
}

export interface LogResource {
  type: LogResourceType;
  id: string;
  name?: string;
}

export interface LogDeployment {
  id: string;
  stage?: string;
}

export interface LogSearchEvent {
  id: string;
  timestamp: string;
  level?: LogLevel;
  /**
   * Application log value. JSON arguments keep their JSON type, so a structured
   * log arrives as an object or array rather than a serialized string.
   */
  body: JsonValue;
  region?: string;
  resource: LogResource;
  deployment?: LogDeployment;
  invocation_id?: string;
}

export interface LogSearchResponse {
  data: LogSearchEvent[];
  limit: number;
  has_more: boolean;
  next_cursor?: string;
}

export interface LogActivityBucket {
  start_time: string;
  end_time: string;
  counts: {
    levels: Record<string, number>;
    regions: Record<string, number>;
    resource_ids: Record<string, number>;
  };
  total: number;
}

export interface LogActivityResponse {
  data: LogActivityBucket[];
  total: number;
}

export interface LogsResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface Logs {
  /** Search project logs. Time fields must be ISO 8601/RFC3339 date-time strings. */
  search(projectId: string, request: LogSearchRequest): Promise<LogsResponse<LogSearchResponse>>;
  /** Fetch bucketed project log activity. Time fields must be ISO 8601/RFC3339 date-time strings. */
  activity(
    projectId: string,
    request: LogActivityRequest,
  ): Promise<LogsResponse<LogActivityResponse>>;
}

// ============================================================================
// Storage Types
// ============================================================================

/** Storage object metadata */
export interface StorageObject {
  id: string;
  bucket_id: string;
  name: string;
  owner_id?: string;
  /** Whether the file is publicly accessible (default: false) */
  is_public: boolean;
  size: number;
  mime_type: string;
  etag?: string;
  metadata?: Record<string, JsonValue>;
  created_at: string;
  updated_at: string;
  /**
   * Public URL for this file (only set for public files).
   * This URL requires no authentication and can be shared anywhere.
   * Set by the API - use this instead of constructing URLs client-side.
   */
  public_url?: string;
}

/** Upload options */
export interface StorageUploadOptions {
  /** MIME type (auto-detected from File if not provided) */
  contentType?: string;
}

/** Download options */
export interface StorageDownloadOptions {
  /** Range header for partial downloads (e.g., 'bytes=0-1023') */
  range?: string;
}

/** List options */
export interface StorageListOptions {
  /** Maximum number of files to return (default: 100, max: 1000) */
  limit?: number;
  /** Pagination cursor from previous response */
  cursor?: string;
}

/** Upload response */
export interface StorageUploadResponse {
  data: StorageObject | null;
  error: Error | null;
}

/** Download response */
export interface StorageDownloadResponse {
  data: Blob | null;
  error: Error | null;
}

/** List response */
export interface StorageListResponse {
  data: StorageObject[] | null;
  error: Error | null;
  nextCursor: string | null;
}

/** Remove response */
export interface StorageRemoveResponse {
  data: { deleted: string[] } | null;
  error: Error | null;
}

/** Move/Copy response */
export interface StorageMoveResponse {
  data: StorageObject | null;
  error: Error | null;
}

/** Visibility update response */
export interface StorageVisibilityResponse {
  data: StorageObject | null;
  error: Error | null;
}

/** Options for creating a resumable upload session */
export interface CreateUploadSessionOptions {
  /** Total file size in bytes */
  totalSize: number;
  /** MIME type (default: application/octet-stream) */
  contentType?: string;
  /** Part size in bytes (default: 25MB, min: 5MB, max: 25MB) */
  partSize?: number;
}

/** Response from creating an upload session */
export interface CreateUploadSessionResponse {
  data: {
    session_id: string;
    path: string;
    total_size: number;
    part_size: number;
    total_parts: number;
    expires_at: string;
  } | null;
  error: Error | null;
}

/** Response from uploading a part */
export interface UploadPartResponse {
  data: {
    part_number: number;
    etag: string;
    size: number;
  } | null;
  error: Error | null;
}

/** Response from completing an upload session */
export interface CompleteUploadSessionResponse {
  data: StorageObject | null;
  error: Error | null;
}

/** Response from getting upload session status */
export interface UploadSessionStatusResponse {
  data: {
    session_id: string;
    path: string;
    status: 'pending' | 'completed' | 'aborted';
    total_size: number;
    part_size: number;
    total_parts: number;
    uploaded_parts: number;
    uploaded_bytes: number;
    missing_parts: number[];
    expires_at: string;
    created_at: string;
  } | null;
  error: Error | null;
}

/** Options for resumable upload */
export interface ResumableUploadOptions {
  /** MIME type (auto-detected from File if not provided) */
  contentType?: string;
  /** Part size in bytes (default: 25MB) */
  partSize?: number;
  /** Progress callback */
  onProgress?: (uploaded: number, total: number) => void;
}

/** Storage File API for operations on a specific bucket */
export interface StorageFileApi {
  /** Upload a file to the bucket */
  upload(
    path: string,
    fileBody: File | Blob | ArrayBuffer,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResponse>;

  /** Download a file from the bucket */
  download(path: string, options?: StorageDownloadOptions): Promise<StorageDownloadResponse>;

  /** List files in the bucket */
  list(prefix?: string, options?: StorageListOptions): Promise<StorageListResponse>;

  /** Delete one or more files from the bucket */
  remove(paths: string | string[]): Promise<StorageRemoveResponse>;

  /** Move/rename a file within the bucket */
  move(fromPath: string, toPath: string): Promise<StorageMoveResponse>;

  /** Copy a file within the bucket */
  copy(fromPath: string, toPath: string): Promise<StorageMoveResponse>;

  /**
   * Get the public URL for a file (only works for public files).
   * NOTE: The list() and updateVisibility() methods return file objects with
   * a public_url field already set by the API. Using that field is preferred.
   */
  getPublicUrl(path: string): { data: { publicUrl: string } | null; error: Error | null };

  /** Update the visibility (public/private) of a file */
  updateVisibility(path: string, isPublic: boolean): Promise<StorageVisibilityResponse>;

  // ========================================================================
  // Resumable Upload Methods (for large files)
  // ========================================================================

  /**
   * Create a resumable upload session for large files.
   * Use this for files over 100MB or when you need resume capability.
   */
  createUploadSession(
    path: string,
    options: CreateUploadSessionOptions,
  ): Promise<CreateUploadSessionResponse>;

  /**
   * Upload a part of a resumable upload session.
   * @param path - The path where the file will be stored
   * @param sessionId - The upload session ID
   * @param partNumber - Part number (1 to 10000)
   * @param partData - The part data to upload
   */
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<UploadPartResponse>;

  /**
   * Complete a resumable upload session after all parts are uploaded.
   */
  completeUploadSession(path: string, sessionId: string): Promise<CompleteUploadSessionResponse>;

  /**
   * Get the status of a resumable upload session.
   * Useful for resuming interrupted uploads.
   */
  getUploadSession(path: string, sessionId: string): Promise<UploadSessionStatusResponse>;

  /**
   * Abort a resumable upload session and clean up any uploaded parts.
   */
  abortUploadSession(path: string, sessionId: string): Promise<{ error: Error | null }>;

  /**
   * Upload a large file using resumable upload with automatic chunking.
   * This is a convenience method that handles the entire resumable upload flow.
   */
  uploadResumable(
    path: string,
    fileBody: File | Blob,
    options?: ResumableUploadOptions,
  ): Promise<StorageUploadResponse>;
}

/** Storage API */
export interface Storage {
  /** Select a storage bucket to perform operations on */
  from(bucketName: string): StorageFileApi;
}

/** Filter value types for database queries */
export type FilterValue = string | number | boolean | null | Date;

export interface QueryResult<T = Record<string, JsonValue>> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}

export interface QueryBuilder<T = Record<string, JsonValue>> {
  /** Select columns to return */
  select(columns: string): QueryBuilder<T>;
  /** Filter where column equals value */
  eq(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column does not equal value */
  neq(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is greater than value */
  gt(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is greater than or equal to value */
  gte(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is less than value */
  lt(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column is less than or equal to value */
  lte(column: string, value: FilterValue): QueryBuilder<T>;
  /** Filter where column matches pattern (case-sensitive) */
  like(column: string, pattern: string): QueryBuilder<T>;
  /** Filter where column matches pattern (case-insensitive) */
  ilike(column: string, pattern: string): QueryBuilder<T>;
  /** Filter where column is null or not null */
  is(column: string, value: null): QueryBuilder<T>;
  /** Filter where column is in array of values */
  in(column: string, values: FilterValue[]): QueryBuilder<T>;
  /** Order results */
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  /** Limit number of rows */
  limit(count: number): QueryBuilder<T>;
  /** Skip rows (pagination) */
  offset(count: number): QueryBuilder<T>;
  /** Execute query and return results */
  execute(): Promise<QueryResult<T>>;
}

export interface MutationBuilder<T = Record<string, JsonValue>> {
  /** Filter where column equals value */
  eq(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column does not equal value */
  neq(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is greater than value */
  gt(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is greater than or equal to value */
  gte(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is less than value */
  lt(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column is less than or equal to value */
  lte(column: string, value: FilterValue): MutationBuilder<T>;
  /** Filter where column matches pattern (case-sensitive) */
  like(column: string, pattern: string): MutationBuilder<T>;
  /** Filter where column matches pattern (case-insensitive) */
  ilike(column: string, pattern: string): MutationBuilder<T>;
  /** Filter where column is null or not null */
  is(column: string, value: null): MutationBuilder<T>;
  /** Filter where column is in array of values */
  in(column: string, values: FilterValue[]): MutationBuilder<T>;
  /** Execute mutation and return results */
  execute(): Promise<QueryResult<T>>;
}

/** @deprecated Use MutationBuilder instead */
export type InsertBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
/** @deprecated Use MutationBuilder instead */
export type UpdateBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
/** @deprecated Use MutationBuilder instead */
export type DeleteBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;

export interface ProjectLockLease {
  key: string;
  token: string;
  expiresAt: string | null;
  /**
   * Rises whenever the lock changes hands and stays put across renewals. Pass it
   * to the resource you are protecting and reject writes carrying a lower token
   * than the highest already seen.
   */
  fencingToken: number | null;
}

export interface ProjectLockRequestOptions {
  /**
   * UUID recorded alongside the server's log line for this call. Reusing one
   * marks a retry as the same logical operation; it never deduplicates, so the
   * retry still spends the project's request budget.
   */
  requestId?: string;
}

export interface ProjectLockOptions extends ProjectLockRequestOptions {
  /** Lease duration in seconds, from 5 through 7,776,000 (90 days). */
  ttl: number;
}

export interface ProjectLockAcquireOptions extends ProjectLockOptions {
  /** Reuse only to retry an ambiguous acquire with the same ownership token. */
  token?: string;
}

export interface ProjectLockState {
  /** False means an acquire would succeed now. */
  held: boolean;
  expiresAt: string | null;
  fencingToken: number | null;
}

export interface ProjectLockAcquireResult {
  acquired: boolean;
  lease: ProjectLockLease | null;
  error: ProjectLockError | null;
}

export interface ProjectLockError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

export interface ProjectLockResult<T = unknown> {
  acquired: boolean;
  data: T | null;
  error: ProjectLockError | null;
}

export interface ProjectLocks {
  acquire(key: string, options: ProjectLockAcquireOptions): Promise<ProjectLockAcquireResult>;
  renew(
    key: string,
    lease: ProjectLockLease,
    options: ProjectLockOptions,
  ): Promise<{ lease: ProjectLockLease; error: ProjectLockError | null }>;
  release(
    key: string,
    lease: ProjectLockLease,
    options?: ProjectLockRequestOptions,
  ): Promise<{ error: ProjectLockError | null }>;
  get(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{ state: ProjectLockState | null; error: ProjectLockError | null }>;
  /** Drops the lease whatever token holds it. Safe only behind a fencing token. */
  forceRelease(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{ error: ProjectLockError | null }>;
  withLock<T>(
    key: string,
    options: ProjectLockAcquireOptions,
    callback: (context: { signal: AbortSignal; lease: ProjectLockLease }) => Promise<T> | T,
  ): Promise<ProjectLockResult<T>>;
}

export class VolcanoAuth {
  constructor(config: VolcanoAuthConfig);

  /** Authentication methods */
  auth: Auth;

  /** Function invocation methods */
  functions: Functions;

  /** Project log methods */
  logs: Logs;

  /** Storage methods */
  storage: Storage;

  /** Service-role-only project lease methods */
  locks: ProjectLocks;

  /** Set current database name for query builder (required before querying) */
  database(databaseName: string): VolcanoAuth;

  /** Start a query on a table */
  from<T = Record<string, JsonValue>>(table: string): QueryBuilder<T>;

  /** Insert data into a table */
  insert<T = Record<string, JsonValue>>(
    table: string,
    values: Record<string, JsonValue>,
  ): MutationBuilder<T>;

  /** Update data in a table */
  update<T = Record<string, JsonValue>>(
    table: string,
    values: Record<string, JsonValue>,
  ): MutationBuilder<T>;

  /** Delete data from a table */
  delete<T = Record<string, JsonValue>>(table: string): MutationBuilder<T>;

  /** Initialize SDK and restore session from localStorage */
  initialize(): Promise<UserResponse>;
}

export { VolcanoAuth as VolcanoClient };

export default VolcanoAuth;

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Detect if we're running in a browser/client-side environment.
 * Useful for SSR-safe code.
 *
 * @example
 * ```typescript
 * import { isBrowser } from '@volcano.dev/sdk';
 *
 * if (isBrowser()) {
 *   // Safe to use window, document, localStorage, etc.
 * }
 * ```
 */
export function isBrowser(): boolean;

/**
 * Realtime module types for lazy loading
 */
export interface RealtimeModule {
  VolcanoRealtime: typeof import('./realtime').VolcanoRealtime;
  RealtimeChannel: typeof import('./realtime').RealtimeChannel;
}

/**
 * Lazy-load the realtime module.
 * Prefer direct import: import { VolcanoRealtime } from '@volcano.dev/sdk/realtime'
 *
 * @example
 * ```typescript
 * import { loadRealtime } from '@volcano.dev/sdk';
 *
 * const { VolcanoRealtime } = await loadRealtime();
 * const realtime = new VolcanoRealtime({ ... });
 * ```
 */
export function loadRealtime(): Promise<RealtimeModule>;

/**
 * Options for {@link databaseConnectionString}.
 */
export interface DatabaseConnectionStringOptions {
  /**
   * When set, the connection impersonates this auth user and Row-Level Security
   * is enforced (application_name `volcano_user_access:{userId}`). Typically
   * `event.__volcano_auth.user_id`. When omitted, the connection has full
   * (admin) access and bypasses RLS.
   */
  userId?: string | null;
}

/**
 * Build a Postgres connection string for querying a Volcano database from inside
 * a function, selecting the access mode via `application_name`.
 *
 * Pass the `DATABASE_URL` Volcano advertises as `baseConnectionString`. The
 * target database is identified by the globally-unique username already baked
 * into that URL, so this only sets `application_name` to choose the access mode
 * (the username, host, database and password are left untouched):
 * - no `userId`  → `volcano_full_access` (admin, bypasses RLS)
 * - with `userId` → `volcano_user_access:{userId}` (RLS enforced)
 *
 * Throws if the base connection string is missing or not a valid URL.
 *
 * @example
 * ```typescript
 * import { databaseConnectionString } from '@volcano.dev/sdk';
 * import { Client } from 'pg';
 *
 * exports.handler = async (event) => {
 *   const auth = event.__volcano_auth;
 *   const connectionString = databaseConnectionString(process.env.DATABASE_URL, {
 *     userId: auth?.user_id, // omit for full (admin) access
 *   });
 *   const client = new Client({ connectionString });
 *   await client.connect();
 *   // ...
 * };
 * ```
 */
export function databaseConnectionString(
  baseConnectionString: string,
  options?: DatabaseConnectionStringOptions,
): string;
