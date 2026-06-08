/**
 * Volcano SDK - Next.js Middleware Helpers
 *
 * Utilities for integrating Volcano authentication with Next.js middleware.
 *
 * @example
 * ```javascript
 * // middleware.js
 * import { NextResponse } from 'next/server';
 * import { withAuth, createServerClient } from '@volcano.dev/sdk/next/middleware';
 *
 * export async function middleware(request) {
 *   const client = createServerClient({
 *     anonKey: process.env.VOLCANO_ANON_KEY,
 *     apiUrl: process.env.VOLCANO_API_URL,
 *   });
 *
 *   const user = await withAuth(request, client);
 *
 *   if (!user && request.nextUrl.pathname.startsWith('/dashboard')) {
 *     return NextResponse.redirect(new URL('/login', request.url));
 *   }
 *
 *   return NextResponse.next();
 * }
 * ```
 */

/**
 * Extract auth token from request headers or cookies
 * @param {Request} request - Next.js request object
 * @returns {string|null} The access token or null
 */
export function getTokenFromRequest(request) {
  // Check Authorization header first
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check cookies (for SSR/middleware)
  const cookies = request.cookies;
  if (cookies) {
    const tokenCookie = cookies.get('volcano_access_token');
    if (tokenCookie?.value) {
      return tokenCookie.value;
    }
  }

  return null;
}

/**
 * Create a server-side Volcano client for middleware/API routes
 * @param {Object} config - Client configuration
 * @param {string} config.anonKey - Your project's anon key
 * @param {string} [config.apiUrl] - API URL (defaults to https://api.volcano.dev)
 * @param {string} [config.accessToken] - Optional pre-set access token
 * @returns {Object} A minimal client for server-side auth validation
 */
export function createServerClient(config) {
  const apiUrl = config.apiUrl || 'https://api.volcano.dev';
  const anonKey = config.anonKey;

  return {
    /**
     * Validate a token and get user info
     * @param {string} accessToken - The access token to validate
     * @returns {Promise<{user: Object|null, error: Error|null}>}
     */
    async getUser(accessToken) {
      if (!accessToken) {
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

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            user: null,
            error: new Error(data.error || `Auth failed: ${response.status}`),
          };
        }

        const data = await response.json().catch(() => ({}));
        return { user: data.user || null, error: null };
      } catch (err) {
        return { user: null, error: err };
      }
    },

    /**
     * Refresh an access token
     * @param {string} refreshToken - The refresh token
     * @returns {Promise<{accessToken: string|null, refreshToken: string|null, error: Error|null}>}
     */
    async refreshToken(refreshToken) {
      if (!refreshToken) {
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

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          return {
            accessToken: null,
            refreshToken: null,
            error: new Error(data.error || `Refresh failed: ${response.status}`),
          };
        }

        const data = await response.json();
        return {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          error: null,
        };
      } catch (err) {
        return { accessToken: null, refreshToken: null, error: err };
      }
    },
  };
}

/**
 * Middleware helper to validate auth and get user
 * @param {Request} request - Next.js request object
 * @param {Object} client - Server client created with createServerClient
 * @returns {Promise<Object|null>} The user object or null if not authenticated
 */
export async function withAuth(request, client) {
  const token = getTokenFromRequest(request);
  if (!token) {
    return null;
  }

  const { user, error } = await client.getUser(token);
  if (error) {
    console.warn('Auth validation failed:', error.message);
    return null;
  }

  return user;
}

/**
 * Check if running in browser environment
 * @returns {boolean}
 */
export function isBrowser() {
  return typeof window !== 'undefined' && window.document !== undefined;
}

/**
 * Check if running in server environment (Node.js, Edge Runtime, etc.)
 * @returns {boolean}
 */
export function isServer() {
  return !isBrowser();
}
