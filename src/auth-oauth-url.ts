import { OAUTH_RESPONSE_QUERY_KEYS } from './auth-browser.ts';
import { optionalField } from './auth-response.ts';
import { sanitizeProvider } from './auth-validation.ts';
import { isBrowser } from './next/request.ts';
import { extractRequiredProjectIdFromToken } from './token-claims.ts';

interface HostedAuthOptions {
  projectId?: string;
  action?: string;
}

export interface AuthOAuthUrlHost {
  readonly apiUrl: string;
  readonly anonKey: string;
  _generateAuthStateNonce(): string;
  _storeAuthState(nonce: string, redirectURL?: string): void;
  _resolveOAuthRedirectTarget(redirectTo: unknown): string;
  _resolveProjectIdForHostedAuth(projectId: unknown): string;
  getHostedAuthUrl(options?: HostedAuthOptions): string;
  signInWithOAuth(provider: string): string;
}

function navigate(url: string): void {
  try {
    const location = window.location;
    const assign: unknown = Reflect.get(location, 'assign');
    if (typeof assign === 'function') {
      Reflect.apply(assign, location, [url]);
    } else {
      location.href = url;
    }
  } catch (error) {
    const message = optionalField(error, 'message');
    const detail = typeof message === 'string' ? message : String(error);
    if (!detail.includes('Not implemented: navigation')) {
      throw error;
    }
  }
}

function oauthRedirect(host: AuthOAuthUrlHost, redirectTo: unknown, nonce: string): string {
  const target = new URL(host._resolveOAuthRedirectTarget(redirectTo));
  for (const key of OAUTH_RESPONSE_QUERY_KEYS) {
    if (target.searchParams.has(key)) {
      throw new Error(`OAuth redirectTo must not contain the reserved "${key}" query parameter`);
    }
  }
  const redirectURL = target.toString();
  host._storeAuthState(nonce, redirectURL);
  // Keep the legacy nonce parameter until every server accepts client_state.
  const transport = new URL(redirectURL);
  const separator = transport.search === '' ? '' : '&';
  transport.search = `${transport.search}${separator}vh_state=${encodeURIComponent(nonce)}`;
  return transport.toString();
}

export function signInWithOAuth(
  host: AuthOAuthUrlHost,
  provider: string,
  options: { redirectTo?: string },
): string {
  sanitizeProvider(provider);
  if (!isBrowser()) {
    throw new Error(
      'OAuth sign-in is only available in browser environment. Use server-side auth flow for SSR.',
    );
  }
  const nonce = host._generateAuthStateNonce();
  const redirect = oauthRedirect(host, options.redirectTo, nonce);
  const oauthUrl =
    `${host.apiUrl}/auth/oauth/${provider}/authorize` +
    `?anon_key=${encodeURIComponent(host.anonKey)}` +
    `&redirect_url=${encodeURIComponent(redirect)}` +
    `&client_state=${encodeURIComponent(nonce)}` +
    '&response_mode=code';
  navigate(oauthUrl);
  return oauthUrl;
}

export function resolveOAuthRedirectTarget(redirectTo: unknown): string {
  if (typeof redirectTo === 'string' && redirectTo.trim() !== '') {
    return redirectTo.trim();
  }
  const location = window.location;
  return `${location.origin}${location.pathname}`;
}

export function getHostedAuthUrl(host: AuthOAuthUrlHost, options: HostedAuthOptions): string {
  if (!isBrowser()) {
    throw new Error('getHostedAuthUrl is only available in the browser.');
  }
  const projectId = host._resolveProjectIdForHostedAuth(options.projectId);
  const nonce = host._generateAuthStateNonce();
  host._storeAuthState(nonce);
  const url = new URL(`${host.apiUrl}/projects/${projectId}/auth/hosted`);
  url.searchParams.set('anon_key', host.anonKey);
  if (options.action !== undefined && options.action !== '') {
    url.searchParams.set('action', options.action);
  }
  url.searchParams.set('state', nonce);
  return url.toString();
}

export function signInWithHostedAuth(host: AuthOAuthUrlHost, options: HostedAuthOptions): string {
  const url = host.getHostedAuthUrl(options);
  navigate(url);
  return url;
}

export function resolveProjectIdForHostedAuth(
  host: AuthOAuthUrlHost,
  explicitProjectId: unknown,
): string {
  if (typeof explicitProjectId === 'string' && explicitProjectId.trim() !== '') {
    return explicitProjectId.trim();
  }
  try {
    return extractRequiredProjectIdFromToken(host.anonKey);
  } catch {
    throw new Error(
      'Unable to determine project id for hosted auth. Pass { projectId } to getHostedAuthUrl()/signInWithHostedAuth().',
    );
  }
}

export function signInWithProvider(host: AuthOAuthUrlHost, provider: string): string {
  return host.signInWithOAuth(provider);
}
