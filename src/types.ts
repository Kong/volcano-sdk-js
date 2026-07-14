import type {
  ApiClient,
  ApiCredentials,
  AuthGetMySessionsData,
  AuthSession,
  AuthSigninData,
  AuthSignupData,
  AuthTokenResponse,
  AuthUpdateUserData,
  AuthUser,
  CompleteUploadSessionResponse as GeneratedCompleteUploadSessionResponse,
  CreateUploadSessionResponse as GeneratedCreateUploadSessionResponse,
  FunctionInvocationRequest,
  QueryDatabaseInsertData,
  QueryDatabaseSelectData,
  StorageObject,
  UploadPartResponse as GeneratedUploadPartResponse,
  UploadSessionStatusResponse as GeneratedUploadSessionStatusResponse,
} from './api/index.js';
import type { VolcanoApiError } from './errors.js';

export type MaybePromise<T> = T | Promise<T>;

export interface AuthStorage {
  getItem(key: string): MaybePromise<string | null>;
  removeItem(key: string): MaybePromise<void>;
  setItem(key: string, value: string): MaybePromise<void>;
}

export interface AuthClientOptions {
  autoRefreshToken?: boolean;
  persistSession?: boolean;
  storage?: AuthStorage;
  storageKey?: string;
}

export interface VolcanoClientConfig extends ApiCredentials {
  auth?: AuthClientOptions;
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  refreshToken?: string;
  timeoutMs?: number;
}

export type User = AuthUser;
export type Session = Pick<AuthTokenResponse, 'access_token' | 'expires_in' | 'refresh_token'> & {
  expires_at: number;
  user: User | null;
};
export type UserMetadata = NonNullable<AuthSignupData['body']['user_metadata']>;
export type SignInOptions = AuthSigninData['body'];
export type SignUpOptions = Omit<AuthSignupData['body'], 'user_metadata'> & {
  metadata?: UserMetadata;
  signInWhenAllowed?: boolean;
};
export type UpdateUserOptions = Omit<NonNullable<AuthUpdateUserData['body']>, 'user_metadata'> & {
  metadata?: UserMetadata;
};

export type AuthChangeEvent =
  | 'INITIAL_SESSION'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED';

export interface ErrorResponse<T> {
  data: T | null;
  error: VolcanoApiError | null;
}

export interface AuthResponse {
  error: VolcanoApiError | null;
  session: Session | null;
  user: User | null;
}

export interface SignUpResponse extends AuthResponse {
  confirmationRequired: boolean;
  message: string | null;
}

export interface UserResponse {
  error: VolcanoApiError | null;
  user: User | null;
}

export interface SessionResponse {
  error: VolcanoApiError | null;
  session: Session | null;
}

export interface MessageResponse {
  error: VolcanoApiError | null;
  message: string | null;
}

export interface SessionsResponse {
  error: VolcanoApiError | null;
  limit: number;
  page: number;
  sessions: AuthSession[] | null;
  total: number;
  total_pages: number;
}

export type OAuthProviderName = 'apple' | 'github' | 'google' | 'microsoft';

export interface AuthClient {
  callOAuthAPI<T = unknown>(
    provider: OAuthProviderName,
    params: { body?: Record<string, unknown>; endpoint: string; method?: 'GET' | 'POST' },
  ): Promise<ErrorResponse<T>>;
  cancelEmailChange(): Promise<MessageResponse>;
  confirmEmail(token: string): Promise<MessageResponse>;
  confirmEmailChange(emailChangeToken: string): Promise<UserResponse>;
  convertAnonymous(options: {
    email: string;
    metadata?: UserMetadata;
    password: string;
  }): Promise<UserResponse>;
  deleteAllOtherSessions(): Promise<{ error: VolcanoApiError | null }>;
  deleteSession(sessionId: string): Promise<{ error: VolcanoApiError | null }>;
  forgotPassword(email: string): Promise<MessageResponse>;
  getHostedAuthUrl(options?: {
    action?: 'forgot-password' | 'login' | 'signup';
    projectId?: string;
  }): string;
  getLinkedOAuthProviders(): Promise<{
    error: VolcanoApiError | null;
    providers: unknown[] | null;
  }>;
  getOAuthProviderToken(provider: OAuthProviderName): Promise<{
    error: VolcanoApiError | null;
    expiresIn: number | null;
    message: string | null;
    provider: string | null;
  }>;
  getSession(): Promise<SessionResponse>;
  getSessions(options?: NonNullable<AuthGetMySessionsData['query']>): Promise<SessionsResponse>;
  getUser(): Promise<UserResponse>;
  initialize(): Promise<UserResponse>;
  linkOAuthProvider(provider: OAuthProviderName): Promise<ErrorResponse<unknown>>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): () => void;
  refreshOAuthToken(provider: OAuthProviderName): Promise<{
    error: VolcanoApiError | null;
    expiresIn: number | null;
    message: string | null;
    provider: string | null;
  }>;
  refreshSession(): Promise<SessionResponse>;
  requestEmailChange(newEmail: string): Promise<{
    error: VolcanoApiError | null;
    message: string | null;
    newEmail: string | null;
  }>;
  resendConfirmation(email: string): Promise<MessageResponse>;
  resetPassword(options: { newPassword: string; token: string }): Promise<MessageResponse>;
  signIn(options: SignInOptions): Promise<AuthResponse>;
  signInWithApple(): string;
  signInWithGitHub(): string;
  signInWithGoogle(): string;
  signInWithHostedAuth(options?: {
    action?: 'forgot-password' | 'login' | 'signup';
    projectId?: string;
  }): string;
  signInWithMicrosoft(): string;
  signInWithOAuth(provider: OAuthProviderName, options?: { redirectTo?: string }): string;
  signOut(): Promise<{ error: VolcanoApiError | null }>;
  signUp(options: SignUpOptions): Promise<SignUpResponse>;
  signUpAnonymous(metadata?: UserMetadata): Promise<AuthResponse>;
  unlinkOAuthProvider(provider: OAuthProviderName): Promise<{ error: VolcanoApiError | null }>;
  updateUser(options: UpdateUserOptions): Promise<UserResponse>;
  user(): User | null;
}

export type QueryFilter = NonNullable<QueryDatabaseSelectData['body']['filters']>[number];
export type FilterValue = QueryFilter['value'];

export interface GenericTable<
  Row extends Record<string, unknown> = Record<string, unknown>,
  Insert extends Record<string, unknown> = Partial<Row>,
  Update extends Record<string, unknown> = Partial<Row>,
> {
  Insert: Insert;
  Row: Row;
  Update: Update;
}

export interface GenericDatabase {
  Tables: Record<string, GenericTable>;
}

export type GenericDatabases = Record<string, GenericDatabase>;
type ColumnName<Row> = Extract<keyof Row, string>;

export interface QueryResult<T extends Record<string, unknown> = Record<string, unknown>> {
  count: number;
  data: T[] | null;
  error: VolcanoApiError | null;
}

export interface QueryBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends PromiseLike<QueryResult<T>> {
  eq(column: ColumnName<T>, value: FilterValue): QueryBuilder<T>;
  execute(): Promise<QueryResult<T>>;
  gt(column: ColumnName<T>, value: FilterValue): QueryBuilder<T>;
  gte(column: ColumnName<T>, value: FilterValue): QueryBuilder<T>;
  ilike(column: ColumnName<T>, pattern: string): QueryBuilder<T>;
  in(column: ColumnName<T>, values: FilterValue[]): QueryBuilder<T>;
  is(column: ColumnName<T>, value: null): QueryBuilder<T>;
  like(column: ColumnName<T>, pattern: string): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  lt(column: ColumnName<T>, value: FilterValue): QueryBuilder<T>;
  lte(column: ColumnName<T>, value: FilterValue): QueryBuilder<T>;
  neq(column: ColumnName<T>, value: FilterValue): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  order(column: ColumnName<T>, options?: { ascending?: boolean }): QueryBuilder<T>;
}

export interface MutationResult<T extends Record<string, unknown> = Record<string, unknown>> {
  data: T[] | null;
  error: VolcanoApiError | null;
}

export interface MutationBuilder<
  T extends Record<string, unknown> = Record<string, unknown>,
> extends PromiseLike<MutationResult<T>> {
  eq(column: ColumnName<T>, value: FilterValue): MutationBuilder<T>;
  execute(): Promise<MutationResult<T>>;
  gt(column: ColumnName<T>, value: FilterValue): MutationBuilder<T>;
  gte(column: ColumnName<T>, value: FilterValue): MutationBuilder<T>;
  ilike(column: ColumnName<T>, pattern: string): MutationBuilder<T>;
  in(column: ColumnName<T>, values: FilterValue[]): MutationBuilder<T>;
  is(column: ColumnName<T>, value: null): MutationBuilder<T>;
  like(column: ColumnName<T>, pattern: string): MutationBuilder<T>;
  lt(column: ColumnName<T>, value: FilterValue): MutationBuilder<T>;
  lte(column: ColumnName<T>, value: FilterValue): MutationBuilder<T>;
  neq(column: ColumnName<T>, value: FilterValue): MutationBuilder<T>;
}

export interface TableClient<Table extends GenericTable = GenericTable> {
  delete(): MutationBuilder<Table['Row']>;
  insert(values: Table['Insert']): MutationBuilder<Table['Row']>;
  select(columns?: '*' | string | string[]): QueryBuilder<Table['Row']>;
  update(values: Table['Update']): MutationBuilder<Table['Row']>;
}

export interface DatabaseClient<Database extends GenericDatabase = GenericDatabase> {
  from<TableName extends Extract<keyof Database['Tables'], string>>(
    table: TableName,
  ): TableClient<Database['Tables'][TableName]>;
}

export interface FunctionInvokeOptions {
  body?: FunctionInvocationRequest['payload'];
  headers?: HeadersInit;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface FunctionInvokeResult<T = unknown> {
  data: T | string | null;
  error: VolcanoApiError | null;
  headers: Record<string, string>;
  status: number | null;
  version: string | null;
}

export interface FunctionsClient {
  invoke<T = unknown>(
    functionName: string,
    options?: FunctionInvokeOptions,
  ): Promise<FunctionInvokeResult<T>>;
}

export interface RequestControlOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface StorageFileClient {
  abortUploadSession(
    path: string,
    sessionId: string,
    options?: RequestControlOptions,
  ): Promise<{ error: VolcanoApiError | null }>;
  completeUploadSession(
    path: string,
    sessionId: string,
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<GeneratedCompleteUploadSessionResponse>>;
  copy(
    fromPath: string,
    toPath: string,
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<StorageObject>>;
  createUploadSession(
    path: string,
    options: RequestControlOptions & {
      contentType?: string;
      partSize?: number;
      totalSize: number;
    },
  ): Promise<ErrorResponse<GeneratedCreateUploadSessionResponse>>;
  download(
    path: string,
    options?: RequestControlOptions & { range?: string },
  ): Promise<ErrorResponse<Blob>>;
  getPublicUrl(path: string): ErrorResponse<{ publicUrl: string }>;
  getUploadSession(
    path: string,
    sessionId: string,
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<GeneratedUploadSessionStatusResponse>>;
  list(
    prefix?: string,
    options?: RequestControlOptions & { cursor?: string; limit?: number },
  ): Promise<ErrorResponse<StorageObject[]> & { nextCursor: string | null }>;
  move(
    fromPath: string,
    toPath: string,
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<StorageObject>>;
  remove(
    paths: string | string[],
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<{ deleted: string[] }>>;
  updateVisibility(
    path: string,
    isPublic: boolean,
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<StorageObject>>;
  upload(
    path: string,
    fileBody: ArrayBuffer | Blob | File,
    options?: RequestControlOptions & { contentType?: string },
  ): Promise<ErrorResponse<StorageObject>>;
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
    options?: RequestControlOptions,
  ): Promise<ErrorResponse<GeneratedUploadPartResponse>>;
  uploadResumable(
    path: string,
    fileBody: Blob | File,
    options?: RequestControlOptions & {
      contentType?: string;
      onProgress?: (uploaded: number, total: number) => void;
      partSize?: number;
    },
  ): Promise<ErrorResponse<StorageObject>>;
}

export interface StorageClient {
  from(bucketName: string): StorageFileClient;
}

export interface VolcanoClient<Databases extends GenericDatabases = GenericDatabases> {
  api: ApiClient;
  auth: AuthClient;
  database<Name extends Extract<keyof Databases, string>>(
    name: Name,
  ): DatabaseClient<Databases[Name]>;
  functions: FunctionsClient;
  storage: StorageClient;
}

export type DatabaseInsertValues = QueryDatabaseInsertData['body']['values'];

export type { VolcanoApiError } from './errors.js';
