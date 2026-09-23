import { AuthSessionOperations } from './auth-session.ts';
import { validateOAuthSession } from './auth-validation.ts';

const accessTokenKey = 'volcano_access_token';
const refreshTokenKey = 'volcano_refresh_token';

export interface RedirectHost {
  _urlSessionConsumed: boolean;
  _sessionGeneration: number;
  _sessionOperations: AuthSessionOperations<unknown, unknown>;
  accessToken: string | null;
  refreshToken: string | null;
  currentUser: unknown;
  _hasSessionInUrl(): boolean;
  _takeAuthState(): string | null;
  _takeAuthRedirectURL(): string | null;
  _replaceSessionFromUrl(accessToken: string, refreshToken: string | null): void;
  _stripAuthHashFromUrl(params: URLSearchParams): void;
  _setStorageItem(key: string, value: string): void;
  _removeStorageItem(key: string): void;
}

export interface OAuthRedirectHost extends RedirectHost {
  _oauthExchangeError: unknown;
  _oauthExchangePromise: Promise<boolean> | null;
  _stripOAuthQueryFromUrl(callbackUrl: URL): void;
  _anonFetch(
    path: string,
    options: { method: 'POST'; body: string },
  ): Promise<{ ok?: boolean; data: unknown; error: unknown }>;
  _setSession(data: unknown, expectedGeneration: number): boolean;
}

function handoffParams(): URLSearchParams | null {
  try {
    return new URLSearchParams(window.location.hash.replace(/^#/, ''));
  } catch {
    return null;
  }
}

function stateMatches(expectedNonce: string | null, urlState: string): boolean {
  return (
    expectedNonce !== null && expectedNonce !== '' && urlState !== '' && urlState === expectedNonce
  );
}

function nonempty(value: string | null): value is string {
  return value !== null && value !== '';
}

function rejectHandoff(host: RedirectHost, params: URLSearchParams): false {
  host._urlSessionConsumed = true;
  host._stripAuthHashFromUrl(params);
  return false;
}

function currentHandoff(
  host: RedirectHost,
): { params: URLSearchParams; accessToken: string } | null {
  if (host._urlSessionConsumed || !host._hasSessionInUrl()) {
    return null;
  }
  const params = handoffParams();
  if (params === null) {
    return null;
  }
  const accessToken = params.get('access_token');
  if (!nonempty(accessToken)) {
    return null;
  }
  return { params, accessToken };
}

export function consumeSessionFromUrl(host: RedirectHost): boolean {
  const handoff = currentHandoff(host);
  if (handoff === null) {
    return false;
  }
  const { params, accessToken } = handoff;
  const expectedNonce = host._takeAuthState();
  host._takeAuthRedirectURL();
  if (!stateMatches(expectedNonce, params.get('state') ?? '')) {
    return rejectHandoff(host, params);
  }
  host._replaceSessionFromUrl(accessToken, params.get('refresh_token'));
  host._urlSessionConsumed = true;
  host._stripAuthHashFromUrl(params);
  return true;
}

export function replaceSessionFromUrl(
  host: RedirectHost,
  accessToken: string,
  refreshToken: string | null,
): void {
  host.accessToken = accessToken;
  host.refreshToken = refreshToken === null || refreshToken === '' ? null : refreshToken;
  host.currentUser = null;
  host._sessionGeneration += 1;
  host._sessionOperations = new AuthSessionOperations();
  host._setStorageItem(accessTokenKey, host.accessToken);
  if (host.refreshToken === null) {
    host._removeStorageItem(refreshTokenKey);
    return;
  }
  host._setStorageItem(refreshTokenKey, host.refreshToken);
}

interface OAuthCallback {
  url: URL;
  code: string;
  providerError: string;
  description: string;
  state: string;
}

function queryValue(url: URL, name: string): string {
  return url.searchParams.get(name) ?? '';
}

function oauthCallback(): OAuthCallback | null {
  try {
    const url = new URL(window.location.href);
    const code = queryValue(url, 'code');
    const providerError = queryValue(url, 'error');
    const state = queryValue(url, 'state');
    if ((code === '' && providerError === '') || state === '') {
      return null;
    }
    return {
      url,
      code,
      providerError,
      description: queryValue(url, 'error_description'),
      state,
    };
  } catch {
    return null;
  }
}

function redirectTarget(stored: string | null, callback: OAuthCallback): string {
  return stored === null || stored === ''
    ? `${callback.url.origin}${callback.url.pathname}${callback.url.search}`
    : stored;
}

function exchangeFailure(value: unknown): unknown {
  return Boolean(value) ? value : new Error('OAuth code exchange failed');
}

function providerFailure(callback: OAuthCallback): Error | null {
  if (callback.providerError === '') {
    return null;
  }
  return new Error(
    callback.description === ''
      ? `OAuth provider rejected sign-in: ${callback.providerError}`
      : callback.description,
  );
}

async function exchangeOAuthCode(
  host: OAuthRedirectHost,
  callback: OAuthCallback,
  storedRedirectUrl: string | null,
): Promise<boolean> {
  const expectedGeneration = host._sessionGeneration;
  const result = await host._anonFetch('/auth/oauth/exchange', {
    method: 'POST',
    body: JSON.stringify({
      code: callback.code,
      redirect_url: redirectTarget(storedRedirectUrl, callback),
    }),
  });
  if (expectedGeneration !== host._sessionGeneration) {
    return false;
  }
  if (!result.ok) {
    host._oauthExchangeError = exchangeFailure(result.error);
    return false;
  }
  const validationError = validateOAuthSession(result.data);
  if (validationError !== null) {
    host._oauthExchangeError = validationError;
    return false;
  }
  return host._setSession(result.data, expectedGeneration);
}

export async function consumeOAuthCodeFromUrl(host: OAuthRedirectHost): Promise<boolean> {
  const callback = oauthCallback();
  if (callback === null) {
    return false;
  }
  const expectedState = host._takeAuthState();
  const storedRedirectUrl = host._takeAuthRedirectURL();
  host._stripOAuthQueryFromUrl(callback.url);
  if (!stateMatches(expectedState, callback.state)) {
    host._oauthExchangeError = new Error('OAuth callback state did not match');
    return false;
  }
  const failure = providerFailure(callback);
  if (failure !== null) {
    host._oauthExchangeError = failure;
    return false;
  }
  return exchangeOAuthCode(host, callback, storedRedirectUrl);
}

export async function completeOAuthExchange(host: OAuthRedirectHost): Promise<void> {
  const pending = host._oauthExchangePromise;
  if (pending === null) {
    return;
  }
  try {
    await pending;
  } catch (error) {
    host._oauthExchangeError =
      error instanceof Error ? error : new Error('OAuth code exchange failed');
  } finally {
    if (host._oauthExchangePromise === pending) {
      host._oauthExchangePromise = null;
    }
  }
}
