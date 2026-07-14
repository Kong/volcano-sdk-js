import type { AuthUser } from '../api/index.js';

export interface ServerClientConfig {
  anonKey: string;
  baseUrl?: string;
  accessToken?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ServerClient {
  getUser(accessToken: string): Promise<{ user: AuthUser | null; error: Error | null }>;
  refreshToken(refreshToken: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    error: Error | null;
  }>;
}

export declare function getTokenFromRequest(request: Request): string | null;
export declare function createServerClient(config: ServerClientConfig): ServerClient;
export declare function withAuth(request: Request, client: ServerClient): Promise<AuthUser | null>;
export declare function isBrowser(): boolean;
export declare function isServer(): boolean;
