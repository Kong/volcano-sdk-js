import { isBrowser } from './next/request.ts';

const stateKey = 'volcano_auth_state';
const redirectKey = 'volcano_auth_redirect_url';
const authHashKeys = new Set([
  'access_token',
  'refresh_token',
  'token_type',
  'expires_in',
  'state',
  'error',
  'error_description',
]);
export const OAUTH_RESPONSE_QUERY_KEYS = new Set([
  'code',
  'state',
  'error',
  'error_description',
  'error_uri',
  'iss',
  'vh_state',
]);

export function generateAuthStateNonce(): string {
  const browserCrypto: unknown = isBrowser() ? Reflect.get(window, 'crypto') : undefined;
  const cryptoObject: unknown = browserCrypto ?? Reflect.get(globalThis, 'crypto');
  if (!hasRandomValues(cryptoObject)) {
    throw new Error(
      'A Web Crypto implementation (crypto.getRandomValues) is required to start a hosted-auth/OAuth flow.',
    );
  }
  const bytes = new Uint8Array(16);
  cryptoObject.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

interface RandomSource {
  getRandomValues(bytes: Uint8Array): Uint8Array;
}

function hasRandomValues(value: unknown): value is RandomSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof Reflect.get(value, 'getRandomValues') === 'function'
  );
}

export function storeAuthState(nonce: string, redirectUrl = ''): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.sessionStorage.setItem(stateKey, nonce);
    if (redirectUrl !== '') {
      window.sessionStorage.setItem(redirectKey, redirectUrl);
    } else {
      window.sessionStorage.removeItem(redirectKey);
    }
  } catch {
    // Without session storage, the callback fails closed when its nonce is missing.
  }
}

export function takeAuthState(): string | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const nonce = window.sessionStorage.getItem(stateKey);
    window.sessionStorage.removeItem(stateKey);
    return nonce;
  } catch {
    return null;
  }
}

export function peekAuthState(): string | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(stateKey);
  } catch {
    return null;
  }
}

export function takeAuthRedirectUrl(): string | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    const redirectUrl = window.sessionStorage.getItem(redirectKey);
    window.sessionStorage.removeItem(redirectKey);
    return redirectUrl;
  } catch {
    return null;
  }
}

export function peekAuthRedirectUrl(): string | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(redirectKey);
  } catch {
    return null;
  }
}

export function getStorageItem(key: string): string | null {
  if (!isBrowser()) {
    return null;
  }
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function setStorageItem(key: string, value: string): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Keep the in-memory session when browser storage is unavailable.
  }
}

export function removeStorageItem(key: string): void {
  if (!isBrowser()) {
    return;
  }
  try {
    window.localStorage.removeItem(key);
  } catch {
    // The in-memory session is already cleared.
  }
}

export function removeOAuthResponseParams(callbackUrl: URL, clearHash = true): void {
  for (const key of OAUTH_RESPONSE_QUERY_KEYS) {
    callbackUrl.searchParams.delete(key);
  }
  if (clearHash) {
    callbackUrl.hash = '';
  }
}

export function stripOAuthQueryFromUrl(callbackUrl: URL): void {
  try {
    removeOAuthResponseParams(callbackUrl, false);
    const cleanUrl =
      (callbackUrl.pathname === '' ? '/' : callbackUrl.pathname) +
      callbackUrl.search +
      callbackUrl.hash;
    window.history.replaceState(window.history.state, '', cleanUrl);
  } catch {
    // Leaving a one-time code in place is non-fatal when history is unavailable.
  }
}

export function hasSessionInUrl(): boolean {
  if (!isBrowser()) {
    return false;
  }
  try {
    return window.location.hash.includes('access_token');
  } catch {
    return false;
  }
}

export function stripAuthHashFromUrl(params: URLSearchParams): void {
  try {
    if (!Array.from(params.keys()).every((key) => authHashKeys.has(key))) {
      return;
    }
    const history = window.history;
    const location = window.location;
    const cleanUrl = (location.pathname === '' ? '/' : location.pathname) + location.search;
    history.replaceState(history.state, '', cleanUrl);
  } catch {
    // Leaving the fragment in place is non-fatal when history is unavailable.
  }
}

function presentParam(params: URLSearchParams, name: string): boolean {
  const value = params.get(name);
  return value !== null && value !== '';
}

function hasOAuthResponse(params: URLSearchParams): boolean {
  return (
    presentParam(params, 'state') && (presentParam(params, 'code') || presentParam(params, 'error'))
  );
}

function matchingOAuthCallback(storedRedirectUrl: string | null): boolean {
  try {
    const callbackUrl = new URL(window.location.href);
    if (!hasOAuthResponse(callbackUrl.searchParams)) {
      return false;
    }
    const expectedUrl = new URL(String(storedRedirectUrl));
    removeOAuthResponseParams(callbackUrl);
    removeOAuthResponseParams(expectedUrl);
    return callbackUrl.toString() === expectedUrl.toString();
  } catch {
    return false;
  }
}

export function hasOAuthCallbackInUrl(
  storedRedirectUrl: string | null,
  hasState: boolean,
): boolean {
  if (!isBrowser() || !hasState) {
    return false;
  }
  return matchingOAuthCallback(storedRedirectUrl);
}
