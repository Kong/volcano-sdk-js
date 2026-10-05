// Frozen main 3ec5cf3 API with the nine human-approved return-type corrections.
import type { FilterValue } from '../../dist/database-filters';
export type { FilterValue } from '../../dist/database-filters';
export type {
  components as OpenAPIComponents,
  operations as OpenAPIOperations,
  paths as OpenAPIPaths,
} from '../../dist/generated/openapi';
import type { components as GeneratedComponents } from '../../dist/generated/openapi';
export type DurableExecution = GeneratedComponents['schemas']['DurableExecution'];
export type DurableExecutionStatus = GeneratedComponents['schemas']['DurableExecutionStatus'];
export type PaginatedDurableExecutions =
  GeneratedComponents['schemas']['PaginatedDurableExecutions'];
export interface VolcanoAuthConfig {
  apiUrl?: string;
  anonKey: string;
  accessToken?: string;
  refreshToken?: string;
}
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
      [key: string]: JsonValue;
    };
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
  created_at?: string;
  updated_at?: string;
}
export interface Session {
  access_token: string;
  refresh_token: string | undefined;
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
export interface AuthError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}
export interface CurrentSessionResponse {
  data: {
    session: CurrentSession | null;
  };
  error: AuthError | null;
}
export interface SignUpOptions {
  email: string;
  password: string;
  metadata?: UserMetadata;
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
  error: AuthError | null;
}
export interface EmailChangeResponse {
  message: string | null;
  newEmail: string | null;
  emailChangeToken?: string | undefined;
  error: AuthError | null;
}
export interface OAuthTokenResponse {
  message: string | null | undefined;
  provider: string | null | undefined;
  expiresIn: number | null | undefined;
  error: AuthError | null;
}
export interface OAuthAPIResponse<T = unknown> {
  data: T | null;
  error: AuthError | null;
}
export interface OAuthAPIParams {
  endpoint: string;
  method?: string;
  body?: JsonValue;
}
export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: AuthError | null;
}
export interface SignUpResponse {
  user: User | null;
  session: Session | null;
  confirmationRequired: boolean;
  message: string | null;
  error: AuthError | null;
}
export interface UserResponse {
  user: User | null;
  error: AuthError | null;
}
export interface SessionResponse {
  session: Session | null;
  error: AuthError | null;
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
  created_at?: string;
  updated_at?: string;
}
export interface SessionsResponse {
  sessions: AuthSession[] | null | undefined;
  total: number | undefined;
  page: number | undefined;
  limit: number | undefined;
  total_pages: number | undefined;
  error: AuthError | null;
}
export interface GetSessionsOptions {
  page?: number;
  limit?: number;
}
export interface DeleteSessionResponse {
  error: AuthError | null;
}
export type OAuthProviderName = 'google' | 'github' | 'microsoft' | 'apple';
export interface OAuthProvider {
  provider?: string;
  linked_at?: string;
  updated_at?: string;
}
export interface LinkProviderResponse {
  authorization_url?: string;
}
export type AuthStateCallback = (user: User | null) => void;
export interface Auth {
  signUp(options: SignUpOptions): Promise<SignUpResponse>;
  signIn(options: SignInOptions): Promise<AuthResponse>;
  getSession(): Promise<CurrentSessionResponse>;
  setSession(session: CompleteSession): Promise<CurrentSessionResponse>;
  signOut(): Promise<{
    error: AuthError | null;
  }>;
  getUser(): Promise<UserResponse>;
  updateUser(options: UpdateUserOptions): Promise<UserResponse>;
  refreshSession(): Promise<SessionResponse>;
  onAuthStateChange(callback: AuthStateCallback): () => void;
  user(): User | null;
  signInAnonymously(metadata?: UserMetadata): Promise<AuthResponse>;
  signUpAnonymous(metadata?: UserMetadata): Promise<AuthResponse>;
  convertAnonymous(options: ConvertAnonymousOptions): Promise<UserResponse>;
  confirmEmail(token: string): Promise<MessageResponse>;
  resendConfirmation(email: string): Promise<MessageResponse>;
  resetPasswordForEmail(email: string): Promise<MessageResponse>;
  forgotPassword(email: string): Promise<MessageResponse>;
  resetPassword(options: ResetPasswordOptions): Promise<MessageResponse>;
  requestEmailChange(newEmail: string): Promise<EmailChangeResponse>;
  confirmEmailChange(emailChangeToken: string): Promise<UserResponse>;
  cancelEmailChange(): Promise<MessageResponse>;
  getHostedAuthUrl(options?: {
    projectId?: string;
    action?: 'login' | 'signup' | 'forgot-password';
  }): string;
  signInWithHostedAuth(options?: {
    projectId?: string;
    action?: 'login' | 'signup' | 'forgot-password';
  }): string;
  signInWithOAuth(
    provider: OAuthProviderName,
    options?: {
      redirectTo?: string;
    },
  ): string;
  signInWithGoogle(): void;
  signInWithGitHub(): void;
  signInWithMicrosoft(): void;
  signInWithApple(): void;
  linkOAuthProvider(provider: OAuthProviderName): Promise<{
    data: LinkProviderResponse | null;
    error: AuthError | null;
  }>;
  unlinkOAuthProvider(provider: OAuthProviderName): Promise<{
    error: AuthError | null;
  }>;
  getLinkedOAuthProviders(): Promise<{
    providers: OAuthProvider[] | null;
    error: AuthError | null;
  }>;
  refreshOAuthToken(provider: OAuthProviderName): Promise<OAuthTokenResponse>;
  getOAuthProviderToken(provider: OAuthProviderName): Promise<OAuthTokenResponse>;
  callOAuthAPI(provider: OAuthProviderName, params: OAuthAPIParams): Promise<OAuthAPIResponse>;
  getSessions(options?: GetSessionsOptions): Promise<SessionsResponse>;
  deleteSession(sessionId: string): Promise<DeleteSessionResponse>;
  deleteAllOtherSessions(): Promise<DeleteSessionResponse>;
}
export interface FunctionError extends Error {
  status?: number | null;
  code?: string;
  retryAfter?: number;
}
export interface Functions {
  invoke<TPayload = JsonValue, TResult = unknown>(
    functionName: string,
    payload?: TPayload,
  ): Promise<{
    data: TResult | string | null;
    status: number | null;
    headers: Record<string, string>;
    version: string | null;
    error: FunctionError | null;
  }>;
}
export interface Durable {
  start<TInput = JsonValue>(
    functionName: string,
    input?: TInput,
    options?: {
      executionName?: string;
    },
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;
  get(
    projectId: string,
    functionName: string,
    executionId: string,
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;
  list(
    projectId: string,
    functionName: string,
    options?: {
      status?: DurableExecutionStatus;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: PaginatedDurableExecutions | null;
    status: number | null;
    error: Error | null;
  }>;
  stop(
    projectId: string,
    functionName: string,
    executionId: string,
  ): Promise<{
    data: DurableExecution | null;
    status: number | null;
    error: Error | null;
  }>;
}
export {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from '../../dist/errors';
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
  search(projectId: string, request: LogSearchRequest): Promise<LogsResponse<LogSearchResponse>>;
  activity(
    projectId: string,
    request: LogActivityRequest,
  ): Promise<LogsResponse<LogActivityResponse>>;
}
export interface StorageObject {
  id: string;
  bucket_id: string;
  name: string;
  owner_id?: string | null;
  is_public: boolean;
  size: number;
  mime_type: string;
  etag?: string;
  metadata?: Record<string, JsonValue>;
  created_at?: string;
  updated_at?: string;
  public_url?: string;
}
export interface StorageUploadOptions {
  contentType?: string;
}
export interface StorageDownloadOptions {
  range?: string;
}
export interface StorageListOptions {
  limit?: number;
  cursor?: string;
}
export interface StorageError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}
export interface StorageUploadResponse {
  data: StorageObject | null;
  error: StorageError | null;
}
export interface StorageDownloadResponse {
  data: Blob | null;
  error: StorageError | null;
}
export interface StorageListResponse {
  data: StorageObject[] | null;
  error: StorageError | null;
  nextCursor: string | null;
}
export interface StorageRemoveError extends StorageError {
  failures?: {
    path: string;
    error: StorageError;
  }[];
}
export interface StorageRemoveResponse {
  data: {
    deleted: string[];
  } | null;
  error: StorageRemoveError | null;
}
export interface StorageMoveResponse {
  data: StorageObject | null;
  error: StorageError | null;
}
export interface StorageVisibilityResponse {
  data: StorageObject | null;
  error: StorageError | null;
}
export interface CreateUploadSessionOptions {
  totalSize: number;
  contentType?: string;
  partSize?: number;
}
export interface CreateUploadSessionResponse {
  data: {
    session_id: string;
    part_size: number;
    total_parts: number;
    expires_at: string;
  } | null;
  error: StorageError | null;
}
export interface UploadPartResponse {
  data: {
    part_number: number;
    etag: string;
    size: number;
  } | null;
  error: StorageError | null;
}
export interface CompleteUploadSessionResponse {
  data: {
    object: StorageObject;
  } | null;
  error: StorageError | null;
}
export interface UploadSessionStatusResponse {
  data: {
    session_id: string;
    path: string;
    status: 'pending' | 'uploading' | 'completing' | 'completed' | 'aborted';
    content_type: string;
    total_size: number;
    part_size: number;
    total_parts: number;
    parts_uploaded: number;
    bytes_uploaded: number;
    parts: {
      part_number: number;
      etag: string;
      size: number;
    }[];
    expires_at: string;
    created_at: string;
  } | null;
  error: StorageError | null;
}
export interface ResumableUploadOptions {
  contentType?: string;
  partSize?: number;
  onProgress?: (uploaded: number, total: number) => void;
}
export interface StorageFileApi {
  upload(
    path: string,
    fileBody: File | Blob | ArrayBuffer,
    options?: StorageUploadOptions,
  ): Promise<StorageUploadResponse>;
  download(path: string, options?: StorageDownloadOptions): Promise<StorageDownloadResponse>;
  list(prefix?: string, options?: StorageListOptions): Promise<StorageListResponse>;
  remove(paths: string | string[]): Promise<StorageRemoveResponse>;
  move(fromPath: string, toPath: string): Promise<StorageMoveResponse>;
  copy(fromPath: string, toPath: string): Promise<StorageMoveResponse>;
  getPublicUrl(path: string): {
    data: {
      publicUrl: string;
    } | null;
    error: StorageError | null;
  };
  updateVisibility(path: string, isPublic: boolean): Promise<StorageVisibilityResponse>;
  createUploadSession(
    path: string,
    options: CreateUploadSessionOptions,
  ): Promise<CreateUploadSessionResponse>;
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<UploadPartResponse>;
  completeUploadSession(path: string, sessionId: string): Promise<CompleteUploadSessionResponse>;
  getUploadSession(path: string, sessionId: string): Promise<UploadSessionStatusResponse>;
  abortUploadSession(
    path: string,
    sessionId: string,
  ): Promise<{
    error: StorageError | null;
  }>;
  uploadResumable(
    path: string,
    fileBody: File | Blob,
    options?: ResumableUploadOptions,
  ): Promise<CompleteUploadSessionResponse>;
}
export interface Storage {
  from(bucketName: string): StorageFileApi;
}
export interface QueryResult<T = Record<string, JsonValue>> {
  data: T[] | null;
  error: Error | null;
  count?: number;
}
export interface QueryBuilder<T = Record<string, JsonValue>> {
  select(columns: string): QueryBuilder<T>;
  eq(column: string, value: FilterValue): QueryBuilder<T>;
  neq(column: string, value: FilterValue): QueryBuilder<T>;
  gt(column: string, value: FilterValue): QueryBuilder<T>;
  gte(column: string, value: FilterValue): QueryBuilder<T>;
  lt(column: string, value: FilterValue): QueryBuilder<T>;
  lte(column: string, value: FilterValue): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  is(column: string, value: null | boolean): QueryBuilder<T>;
  in(column: string, values: FilterValue[]): QueryBuilder<T>;
  order(
    column: string,
    options?: {
      ascending?: boolean;
    },
  ): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  execute(): Promise<QueryResult<T>>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export interface MutationBuilder<T = Record<string, JsonValue>> {
  eq(column: string, value: FilterValue): MutationBuilder<T>;
  neq(column: string, value: FilterValue): MutationBuilder<T>;
  gt(column: string, value: FilterValue): MutationBuilder<T>;
  gte(column: string, value: FilterValue): MutationBuilder<T>;
  lt(column: string, value: FilterValue): MutationBuilder<T>;
  lte(column: string, value: FilterValue): MutationBuilder<T>;
  like(column: string, pattern: string): MutationBuilder<T>;
  ilike(column: string, pattern: string): MutationBuilder<T>;
  is(column: string, value: null | boolean): MutationBuilder<T>;
  in(column: string, values: FilterValue[]): MutationBuilder<T>;
  execute(): Promise<QueryResult<T>>;
  then<TResult1 = QueryResult<T>, TResult2 = never>(
    resolve?: ((value: QueryResult<T>) => TResult1 | PromiseLike<TResult1>) | null,
    reject?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2>;
}
export type InsertBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
export type UpdateBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
export type DeleteBuilder<T = Record<string, JsonValue>> = MutationBuilder<T>;
export interface ProjectLockLease {
  key: string;
  token: string;
  expiresAt: string | null;
  fencingToken: number | null;
}
export interface ProjectLockRequestOptions {
  requestId?: string;
}
export interface ProjectLockOptions extends ProjectLockRequestOptions {
  ttl: number;
}
export interface ProjectLockAcquireOptions extends ProjectLockOptions {
  token?: string;
}
export interface ProjectLockRenewOptions extends ProjectLockOptions {
  signal?: AbortSignal;
}
export interface ProjectLockState {
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
    options: ProjectLockRenewOptions,
  ): Promise<{
    lease: ProjectLockLease;
    error: ProjectLockError | null;
  }>;
  release(
    key: string,
    lease: ProjectLockLease,
    options?: ProjectLockRequestOptions,
  ): Promise<{
    error: ProjectLockError | null;
  }>;
  get(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{
    state: ProjectLockState | null;
    error: ProjectLockError | null;
  }>;
  forceRelease(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{
    error: ProjectLockError | null;
  }>;
  withLock<T>(
    key: string,
    options: ProjectLockAcquireOptions,
    callback: (context: { signal: AbortSignal; lease: ProjectLockLease }) => Promise<T> | T,
  ): Promise<ProjectLockResult<T>>;
}
export class VolcanoAuth {
  constructor(config: VolcanoAuthConfig);
  auth: Auth;
  functions: Functions;
  durable: Durable;
  logs: Logs;
  storage: Storage;
  locks: ProjectLocks;
  database(databaseName: string): VolcanoAuth;
  from<T = Record<string, JsonValue>>(table: string): QueryBuilder<T>;
  insert<T = Record<string, JsonValue>>(
    table: string,
    values: Record<string, JsonValue>,
  ): MutationBuilder<T>;
  update<T = Record<string, JsonValue>>(
    table: string,
    values: Record<string, JsonValue>,
  ): MutationBuilder<T>;
  delete<T = Record<string, JsonValue>>(table: string): MutationBuilder<T>;
  initialize(): Promise<UserResponse>;
}
export { VolcanoAuth as VolcanoClient };
export default VolcanoAuth;
export function isBrowser(): boolean;
export interface RealtimeModule {
  VolcanoRealtime: typeof import('../../dist/realtime').VolcanoRealtime;
  RealtimeChannel: typeof import('../../dist/realtime').RealtimeChannel;
}
export function loadRealtime(): Promise<RealtimeModule>;
export {
  databaseConnectionString,
  type DatabaseConnectionStringOptions,
} from '../../dist/database-connection-string';
