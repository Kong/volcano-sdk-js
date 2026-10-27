import type {
  AuthError,
  AuthResponse,
  AuthStateCallback,
  CompleteSession,
  ConvertAnonymousOptions,
  CurrentSessionResponse,
  DeleteSessionResponse,
  EmailChangeResponse,
  GetSessionsOptions,
  LinkProviderResponse,
  MessageResponse,
  OAuthAPIParams,
  OAuthAPIResponse,
  OAuthProvider,
  OAuthProviderName,
  OAuthTokenResponse,
  ResetPasswordOptions,
  SessionResponse,
  SessionsResponse,
  SignInOptions,
  SignUpOptions,
  SignUpResponse,
  UpdateUserOptions,
  User,
  UserMetadata,
  UserResponse,
} from './sdk-public-types-auth.ts';

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
  signOut(): Promise<{ error: AuthError | null }>;
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
   * Throws when the project ID is "." or "..", contains "/", or has a lone
   * UTF-16 surrogate.
   */
  getHostedAuthUrl(options?: { projectId?: string; action?: 'login' | 'signup' | 'forgot-password' }): string;
  /**
   * Redirect the browser to the managed hosted-auth pages (stores the nonce).
   * Throws, without navigating, for the project IDs `getHostedAuthUrl` refuses.
   */
  signInWithHostedAuth(options?: { projectId?: string; action?: 'login' | 'signup' | 'forgot-password' }): string;

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
  ): Promise<{ data: LinkProviderResponse | null; error: AuthError | null }>;
  /** Unlink OAuth provider. Throws if provider is invalid. */
  unlinkOAuthProvider(provider: OAuthProviderName): Promise<{ error: AuthError | null }>;
  /** Get linked OAuth providers */
  getLinkedOAuthProviders(): Promise<{
    providers: OAuthProvider[] | null;
    error: AuthError | null;
  }>;
  /** Refresh a server-held OAuth provider token and return status metadata. */
  refreshOAuthToken(provider: OAuthProviderName): Promise<OAuthTokenResponse>;
  /** Get server-held OAuth provider token status. Auto-refreshes if expired; never exposes the token. */
  getOAuthProviderToken(provider: OAuthProviderName): Promise<OAuthTokenResponse>;
  /** Call OAuth provider API on behalf of user. Throws if provider is invalid. */
  callOAuthAPI(provider: OAuthProviderName, params: OAuthAPIParams): Promise<OAuthAPIResponse>;

  // Session management methods
  /** Get paginated sessions for the current user */
  getSessions(options?: GetSessionsOptions): Promise<SessionsResponse>;
  /**
   * Delete a specific session (sign out from that device). Returns an error
   * without a request when the ID is blank, is "." or "..", contains "/", or
   * has a lone UTF-16 surrogate.
   */
  deleteSession(sessionId: string): Promise<DeleteSessionResponse>;
  /** Delete all sessions except the current one (sign out from all other devices) */
  deleteAllOtherSessions(): Promise<DeleteSessionResponse>;
}
