interface RequestCookies {
  get(name: string): { value: string } | undefined;
}

/** A standard Request, optionally carrying Next.js's parsed cookies. */
export type MiddlewareRequest = Pick<Request, 'headers'> & { cookies?: RequestCookies };

/** Prefer the Authorization header to the SSR access-token cookie. */
export function getTokenFromRequest(request: MiddlewareRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ') === true) {
    return authHeader.slice(7);
  }
  return cookieToken(request.cookies);
}

function cookieToken(cookies: RequestCookies | undefined): string | null {
  const value = cookies?.get('volcano_access_token')?.value;
  return value === undefined || value === '' ? null : value;
}

export function isBrowser(): boolean {
  const environment: { window?: { document?: unknown } } = globalThis;
  return environment.window?.document !== undefined;
}

export function isServer(): boolean {
  return !isBrowser();
}
