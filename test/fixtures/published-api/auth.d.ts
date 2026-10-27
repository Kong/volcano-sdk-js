export interface VolcanoAuthConfig {
  /** HTTP request timeout in milliseconds. Sandbox execution may extend this budget. */
  timeout?: number;
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
  getHostedAuthUrl(options?: { projectId?: string; action?: 'login' | 'signup' | 'forgot-password' }): string;
  signInWithHostedAuth(options?: { projectId?: string; action?: 'login' | 'signup' | 'forgot-password' }): string;
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
