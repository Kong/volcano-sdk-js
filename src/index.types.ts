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
  QueryDatabaseInsertData,
  QueryDatabaseSelectData,
  StorageObject,
  UploadPartResponse as GeneratedUploadPartResponse,
  UploadSessionStatusResponse as GeneratedUploadSessionStatusResponse,
} from './api/index.js';

export type User = AuthUser;
export type Session = Pick<AuthTokenResponse, 'access_token' | 'expires_in' | 'refresh_token'>;
export type UserMetadata = NonNullable<AuthSignupData['body']['user_metadata']>;
export type SignInOptions = AuthSigninData['body'];
export type SignUpOptions = Omit<AuthSignupData['body'], 'user_metadata'> & {
  metadata?: UserMetadata;
  signInWhenAllowed?: boolean;
};
export type UpdateUserOptions = Omit<NonNullable<AuthUpdateUserData['body']>, 'user_metadata'> & {
  metadata?: UserMetadata;
};

export interface VolcanoClientConfig extends ApiCredentials {
  baseUrl?: string;
  fetch?: typeof fetch;
  refreshToken?: string;
  timeoutMs?: number;
}

export interface ErrorResponse<T> {
  data: T | null;
  error: Error | null;
}

export interface AuthResponse {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

export interface SignUpResponse extends AuthResponse {
  confirmationRequired: boolean;
  message: string | null;
}

export interface UserResponse {
  user: User | null;
  error: Error | null;
}

export interface SessionResponse {
  session: Session | null;
  error: Error | null;
}

export interface MessageResponse {
  message: string | null;
  error: Error | null;
}

export interface SessionsResponse {
  sessions: AuthSession[] | null;
  total: number;
  page: number;
  limit: number;
  total_pages: number;
  error: Error | null;
}

export type OAuthProviderName = 'apple' | 'github' | 'google' | 'microsoft';

export interface AuthClient {
  signUp(options: SignUpOptions): Promise<SignUpResponse>;
  signIn(options: SignInOptions): Promise<AuthResponse>;
  signOut(): Promise<{ error: Error | null }>;
  getUser(): Promise<UserResponse>;
  updateUser(options: UpdateUserOptions): Promise<UserResponse>;
  refreshSession(): Promise<SessionResponse>;
  initialize(): Promise<UserResponse>;
  onAuthStateChange(callback: (user: User | null) => void): () => void;
  user(): User | null;
  signUpAnonymous(metadata?: UserMetadata): Promise<AuthResponse>;
  convertAnonymous(options: {
    email: string;
    password: string;
    metadata?: UserMetadata;
  }): Promise<UserResponse>;
  confirmEmail(token: string): Promise<MessageResponse>;
  resendConfirmation(email: string): Promise<MessageResponse>;
  forgotPassword(email: string): Promise<MessageResponse>;
  resetPassword(options: { token: string; newPassword: string }): Promise<MessageResponse>;
  requestEmailChange(newEmail: string): Promise<{
    message: string | null;
    newEmail: string | null;
    error: Error | null;
  }>;
  confirmEmailChange(emailChangeToken: string): Promise<UserResponse>;
  cancelEmailChange(): Promise<MessageResponse>;
  getHostedAuthUrl(options?: {
    action?: 'forgot-password' | 'login' | 'signup';
    projectId?: string;
  }): string;
  signInWithHostedAuth(options?: {
    action?: 'forgot-password' | 'login' | 'signup';
    projectId?: string;
  }): string;
  signInWithOAuth(provider: OAuthProviderName, options?: { redirectTo?: string }): string;
  signInWithGoogle(): string;
  signInWithGitHub(): string;
  signInWithMicrosoft(): string;
  signInWithApple(): string;
  linkOAuthProvider(provider: OAuthProviderName): Promise<ErrorResponse<unknown>>;
  unlinkOAuthProvider(provider: OAuthProviderName): Promise<{ error: Error | null }>;
  getLinkedOAuthProviders(): Promise<{ providers: unknown[] | null; error: Error | null }>;
  refreshOAuthToken(provider: OAuthProviderName): Promise<{
    message: string | null;
    provider: string | null;
    expiresIn: number | null;
    error: Error | null;
  }>;
  getOAuthProviderToken(provider: OAuthProviderName): Promise<{
    message: string | null;
    provider: string | null;
    expiresIn: number | null;
    error: Error | null;
  }>;
  callOAuthAPI<T = unknown>(
    provider: OAuthProviderName,
    params: { endpoint: string; method?: string; body?: unknown },
  ): Promise<ErrorResponse<T>>;
  getSessions(options?: NonNullable<AuthGetMySessionsData['query']>): Promise<SessionsResponse>;
  deleteSession(sessionId: string): Promise<{ error: Error | null }>;
  deleteAllOtherSessions(): Promise<{ error: Error | null }>;
}

export type QueryFilter = NonNullable<QueryDatabaseSelectData['body']['filters']>[number];
export type FilterValue = QueryFilter['value'];

export interface QueryResult<T = Record<string, unknown>> {
  data: T[] | null;
  error: Error | null;
  count: number;
}

export interface QueryBuilder<T = Record<string, unknown>> extends PromiseLike<QueryResult<T>> {
  select(columns: string | string[]): QueryBuilder<T>;
  eq(column: string, value: FilterValue): QueryBuilder<T>;
  neq(column: string, value: FilterValue): QueryBuilder<T>;
  gt(column: string, value: FilterValue): QueryBuilder<T>;
  gte(column: string, value: FilterValue): QueryBuilder<T>;
  lt(column: string, value: FilterValue): QueryBuilder<T>;
  lte(column: string, value: FilterValue): QueryBuilder<T>;
  like(column: string, pattern: string): QueryBuilder<T>;
  ilike(column: string, pattern: string): QueryBuilder<T>;
  is(column: string, value: null): QueryBuilder<T>;
  in(column: string, values: FilterValue[]): QueryBuilder<T>;
  order(column: string, options?: { ascending?: boolean }): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  execute(): Promise<QueryResult<T>>;
}

export interface MutationResult<T = Record<string, unknown>> {
  data: T[] | null;
  error: Error | null;
}

export interface MutationBuilder<T = Record<string, unknown>> extends PromiseLike<
  MutationResult<T>
> {
  eq(column: string, value: FilterValue): MutationBuilder<T>;
  neq(column: string, value: FilterValue): MutationBuilder<T>;
  gt(column: string, value: FilterValue): MutationBuilder<T>;
  gte(column: string, value: FilterValue): MutationBuilder<T>;
  lt(column: string, value: FilterValue): MutationBuilder<T>;
  lte(column: string, value: FilterValue): MutationBuilder<T>;
  like(column: string, pattern: string): MutationBuilder<T>;
  ilike(column: string, pattern: string): MutationBuilder<T>;
  is(column: string, value: null): MutationBuilder<T>;
  in(column: string, values: FilterValue[]): MutationBuilder<T>;
  execute(): Promise<MutationResult<T>>;
}

export interface DatabaseClient {
  from<T = Record<string, unknown>>(table: string): QueryBuilder<T>;
  insert<T = Record<string, unknown>>(
    table: string,
    values: QueryDatabaseInsertData['body']['values'],
  ): MutationBuilder<T>;
  update<T = Record<string, unknown>>(
    table: string,
    values: QueryDatabaseInsertData['body']['values'],
  ): MutationBuilder<T>;
  delete<T = Record<string, unknown>>(table: string): MutationBuilder<T>;
}

export interface FunctionInvokeResult<T = unknown> {
  data: T | string | null;
  status: number | null;
  headers: Record<string, string>;
  version: string | null;
  error: Error | null;
}

export interface FunctionsClient {
  invoke<T = unknown>(functionName: string, payload?: unknown): Promise<FunctionInvokeResult<T>>;
}

export interface StorageFileClient {
  upload(
    path: string,
    fileBody: ArrayBuffer | Blob | File,
    options?: { contentType?: string },
  ): Promise<ErrorResponse<StorageObject>>;
  download(path: string, options?: { range?: string }): Promise<ErrorResponse<Blob>>;
  list(
    prefix?: string,
    options?: { cursor?: string; limit?: number },
  ): Promise<ErrorResponse<StorageObject[]> & { nextCursor: string | null }>;
  remove(paths: string | string[]): Promise<ErrorResponse<{ deleted: string[] }>>;
  move(fromPath: string, toPath: string): Promise<ErrorResponse<StorageObject>>;
  copy(fromPath: string, toPath: string): Promise<ErrorResponse<StorageObject>>;
  getPublicUrl(path: string): ErrorResponse<{ publicUrl: string }>;
  updateVisibility(path: string, isPublic: boolean): Promise<ErrorResponse<StorageObject>>;
  createUploadSession(
    path: string,
    options: { contentType?: string; partSize?: number; totalSize: number },
  ): Promise<ErrorResponse<GeneratedCreateUploadSessionResponse>>;
  uploadPart(
    path: string,
    sessionId: string,
    partNumber: number,
    partData: ArrayBuffer | Blob,
  ): Promise<ErrorResponse<GeneratedUploadPartResponse>>;
  completeUploadSession(
    path: string,
    sessionId: string,
  ): Promise<ErrorResponse<GeneratedCompleteUploadSessionResponse>>;
  getUploadSession(
    path: string,
    sessionId: string,
  ): Promise<ErrorResponse<GeneratedUploadSessionStatusResponse>>;
  abortUploadSession(path: string, sessionId: string): Promise<{ error: Error | null }>;
  uploadResumable(
    path: string,
    fileBody: Blob | File,
    options?: {
      contentType?: string;
      onProgress?: (uploaded: number, total: number) => void;
      partSize?: number;
    },
  ): Promise<ErrorResponse<StorageObject>>;
}

export interface StorageClient {
  from(bucketName: string): StorageFileClient;
}

export interface VolcanoClient {
  api: ApiClient;
  auth: AuthClient;
  database(name: string): DatabaseClient;
  functions: FunctionsClient;
  storage: StorageClient;
}

export declare function createVolcanoClient(config?: VolcanoClientConfig): VolcanoClient;

export declare function databaseConnectionString(
  baseConnectionString: string,
  options?: { userId?: string | null } | null,
): string;
