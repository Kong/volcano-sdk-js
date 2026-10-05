/**
 * Volcano SDK helpers for authentication in Next.js middleware.
 *
 * @example
 * ```javascript
 * import { NextResponse } from 'next/server';
 * import { withAuth, createServerClient } from '@volcano.dev/sdk/next/middleware';
 *
 * export async function middleware(request) {
 *   const client = createServerClient({
 *     anonKey: process.env.VOLCANO_ANON_KEY,
 *     apiUrl: process.env.VOLCANO_API_URL,
 *   });
 *   const user = await withAuth(request, client);
 *   if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
 *     return NextResponse.redirect(new URL('/login', request.url));
 *   }
 *   return NextResponse.next();
 * }
 * ```
 */

import { getTokenFromRequest } from './request.ts';

export type { MiddlewareRequest } from './request.ts';
export { getTokenFromRequest, isBrowser, isServer } from './request.ts';

export interface ServerClientConfig {
  anonKey: string;
  apiUrl?: string;
  accessToken?: string;
}

export interface User {
  id: string;
  email: string;
  status: 'active' | 'banned' | 'deleted';
  user_metadata?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
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
  getUser(accessToken: string): Promise<GetUserResult>;
  refreshToken(refreshToken: string): Promise<RefreshTokenResult>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value !== '';
}

function optionalString(value: Record<string, unknown>, field: string): boolean {
  const fieldValue = value[field];
  return fieldValue === undefined || typeof fieldValue === 'string';
}

function optionalRecord(value: Record<string, unknown>, field: string): boolean {
  const fieldValue = value[field];
  return fieldValue === undefined || isRecord(fieldValue);
}

function isUserStatus(value: unknown): value is User['status'] {
  return value === 'active' || value === 'banned' || value === 'deleted';
}

function hasOptionalTimestamps(value: Record<string, unknown>): boolean {
  return optionalString(value, 'created_at') && optionalString(value, 'updated_at');
}

function isUser(value: unknown): value is User {
  if (!isRecord(value)) {
    return false;
  }
  const required = ['id', 'email'];
  return (
    required.every((field) => typeof value[field] === 'string') &&
    isUserStatus(value['status']) &&
    optionalRecord(value, 'user_metadata') &&
    hasOptionalTimestamps(value)
  );
}

function userFromPayload(payload: unknown): User | null {
  if (!isRecord(payload)) {
    return null;
  }
  return isUser(payload['user']) ? payload['user'] : null;
}

function errorFrom(cause: unknown): Error {
  if (cause instanceof Error) {
    return cause;
  }
  if (isRecord(cause) && typeof cause['message'] === 'string') {
    const error = new Error(cause['message']);
    if (typeof cause['name'] === 'string') {
      error.name = cause['name'];
    }
    return error;
  }
  return new Error(String(cause));
}

async function errorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload: unknown = await response.json();
    const detail = isRecord(payload) ? payload['error'] : undefined;
    return typeof detail === 'string' && detail !== '' ? detail : fallback;
  } catch {
    return fallback;
  }
}

async function userResponse(response: Response): Promise<GetUserResult> {
  if (!response.ok) {
    return {
      user: null,
      error: new Error(await errorMessage(response, `Auth failed: ${String(response.status)}`)),
    };
  }
  return response.json().then(
    (payload: unknown): GetUserResult => ({ user: userFromPayload(payload), error: null }),
    (): GetUserResult => ({ user: null, error: null }),
  );
}

function refreshPair(
  payload: unknown,
): Pick<RefreshTokenResult, 'accessToken' | 'refreshToken'> | null {
  if (!isRecord(payload)) {
    return null;
  }
  const accessToken = payload['access_token'];
  const refreshToken = payload['refresh_token'];
  if (typeof accessToken !== 'string' || typeof refreshToken !== 'string') {
    return null;
  }
  return { accessToken, refreshToken };
}

async function refreshResponse(response: Response): Promise<RefreshTokenResult> {
  if (!response.ok) {
    return {
      accessToken: null,
      refreshToken: null,
      error: new Error(await errorMessage(response, `Refresh failed: ${String(response.status)}`)),
    };
  }
  const payload: unknown = await response.json();
  const pair = refreshPair(payload);
  if (pair === null) {
    return {
      accessToken: null,
      refreshToken: null,
      error: new TypeError('Invalid refresh response'),
    };
  }
  return { ...pair, error: null };
}

export function createServerClient(config: ServerClientConfig): ServerClient {
  const configuredUrl: unknown = config.apiUrl;
  const apiUrl = isNonEmptyString(configuredUrl) ? configuredUrl : 'https://api.volcano.dev';
  const anonKey = config.anonKey;

  return {
    async getUser(accessToken: string): Promise<GetUserResult> {
      if (!isNonEmptyString(accessToken)) {
        return { user: null, error: new Error('No access token provided') };
      }
      try {
        const response = await fetch(`${apiUrl}/auth/user`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'X-Anon-Key': anonKey,
            'Content-Type': 'application/json',
          },
        });
        return await userResponse(response);
      } catch (cause) {
        return { user: null, error: errorFrom(cause) };
      }
    },

    async refreshToken(refreshToken: string): Promise<RefreshTokenResult> {
      if (!isNonEmptyString(refreshToken)) {
        return {
          accessToken: null,
          refreshToken: null,
          error: new Error('No refresh token provided'),
        };
      }
      try {
        const response = await fetch(`${apiUrl}/auth/refresh`, {
          method: 'POST',
          headers: {
            'X-Anon-Key': anonKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        return await refreshResponse(response);
      } catch (cause) {
        return { accessToken: null, refreshToken: null, error: errorFrom(cause) };
      }
    },
  };
}

export async function withAuth(request: Request, client: ServerClient): Promise<User | null> {
  const token = getTokenFromRequest(request);
  if (token === null || token === '') {
    return null;
  }
  const { user, error } = await client.getUser(token);
  if (error !== null) {
    console.warn('Auth validation failed:', error.message);
    return null;
  }
  return user;
}
