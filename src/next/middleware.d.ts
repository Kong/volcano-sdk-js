/**
 * Volcano SDK - Next.js Middleware Helpers Type Definitions
 */

export interface ServerClientConfig {
  /** Your project's anon key */
  anonKey: string;
  /** API URL (defaults to https://api.volcano.dev) */
  apiUrl?: string;
  /** Optional pre-set access token */
  accessToken?: string;
}

export interface User {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface GetUserResult {
  user: User | null;
  error: Error | null;
}

export interface RefreshTokenResult {
  accessToken: string | null;
  refreshToken: string | null;
  error: Error | null;
}

export interface ServerClient {
  /**
   * Validate a token and get user info
   * @param accessToken - The access token to validate
   */
  getUser(accessToken: string): Promise<GetUserResult>;

  /**
   * Refresh an access token
   * @param refreshToken - The refresh token
   */
  refreshToken(refreshToken: string): Promise<RefreshTokenResult>;
}

/**
 * Extract auth token from request headers or cookies
 * @param request - Next.js request object
 * @returns The access token or null
 */
export function getTokenFromRequest(request: Request): string | null;

/**
 * Create a server-side Volcano client for middleware/API routes
 * @param config - Client configuration
 * @returns A minimal client for server-side auth validation
 */
export function createServerClient(config: ServerClientConfig): ServerClient;

/**
 * Middleware helper to validate auth and get user
 * @param request - Next.js request object
 * @param client - Server client created with createServerClient
 * @returns The user object or null if not authenticated
 */
export function withAuth(request: Request, client: ServerClient): Promise<User | null>;

/**
 * Check if running in browser environment
 */
export function isBrowser(): boolean;

/**
 * Check if running in server environment (Node.js, Edge Runtime, etc.)
 */
export function isServer(): boolean;
