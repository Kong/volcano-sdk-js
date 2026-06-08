/**
 * Volcano Auth SDK Type Definitions
 */

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

export interface User {
  id: string;
  email: string;
  user_metadata?: UserMetadata;
  created_at: string;
  updated_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

export interface SignUpOptions {
  email: string;
  password: string;
  metadata?: UserMetadata;
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
  signUp(options: SignUpOptions): Promise<AuthResponse>;
  /** Sign in existing user */
  signIn(options: SignInOptions): Promise<AuthResponse>;
  /** Sign out current user */
  signOut(): Promise<{ error: Error | null }>;
  /** Get current user data */
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
  /** Sign up as anonymous user (no email/password required) */
  signUpAnonymous(metadata?: UserMetadata): Promise<AuthResponse>;
  /** Convert anonymous user to authenticated user */
  convertAnonymous(options: ConvertAnonymousOptions): Promise<UserResponse>;

  // Email confirmation methods
  /** Confirm email address with token from signup email */
  confirmEmail(token: string): Promise<MessageResponse>;
  /** Resend email confirmation link */
  resendConfirmation(email: string): Promise<MessageResponse>;

  // Password recovery methods
  /** Request password reset - sends recovery token to email */
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

  // OAuth methods
  /** Start OAuth flow (redirects browser). Throws if provider is invalid. */
  signInWithOAuth(provider: OAuthProviderName): void;
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
  /** Get current OAuth provider token (auto-refreshes if expired). Throws if provider is invalid. */
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
    error: Error | null;
  }>;
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

export class VolcanoAuth {
  constructor(config: VolcanoAuthConfig);

  /** Authentication methods */
  auth: Auth;

  /** Function invocation methods */
  functions: Functions;

  /** Storage methods */
  storage: Storage;

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
