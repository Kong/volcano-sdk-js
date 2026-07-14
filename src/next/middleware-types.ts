import type { AuthUser } from '../api/index.js';
import type { VolcanoApiError } from '../errors.js';

export interface ServerClientConfig {
  anonKey: string;
  baseUrl?: string;
  accessToken?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

export interface ServerClient {
  getUser(accessToken: string): Promise<{
    user: AuthUser | null;
    error: VolcanoApiError | null;
  }>;
  refreshToken(refreshToken: string): Promise<{
    accessToken: string | null;
    refreshToken: string | null;
    error: VolcanoApiError | null;
  }>;
}

export interface MiddlewareRequest extends Request {
  cookies?: {
    get(name: string): { value: string } | undefined;
  };
}
