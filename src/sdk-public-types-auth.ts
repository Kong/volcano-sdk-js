import type { JsonValue } from './sdk-public-types-json.ts';

export interface VolcanoAuthConfig {
  /** HTTP request timeout in milliseconds. Sandbox execution may extend this budget. */
  timeout?: number;
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

/** HTTP metadata is absent for local validation and transport errors. */
export interface AuthError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

export interface CurrentSessionResponse {
  data: { session: CurrentSession | null };
  error: AuthError | null;
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
  /** Page number (1-indexed, default: 1) */
  page?: number;
  /** Number of sessions per page (max 100, default: 20) */
  limit?: number;
}

export interface DeleteSessionResponse {
  error: AuthError | null;
}

/** Valid OAuth provider names */
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
