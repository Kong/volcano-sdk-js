import { apiRequestError } from './api-errors.ts';
import type { ContextRequest, RequestResult } from './auth-request.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import { AuthRefreshDiscardedError, AuthSessionChangedError } from './errors.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';
import { safeJsonParse } from './response-json.ts';

export interface AuthHttpHost {
  readonly apiUrl: string;
  readonly anonKey: string;
  readonly timeout: number;
  readonly accessToken: string | null;
  readonly _oauthExchangePromise: Promise<boolean> | null;
  readonly _oauthExchangeError: Error | null;
  _completeOAuthExchange(): Promise<void>;
  _captureAuthContext(): AuthContext;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _refreshSessionForContext(context: AuthContext): Promise<{ error: unknown }>;
}

type Deferred<Value> = Value | (() => Value);

function hasToken(token: string | null): boolean {
  return token !== null && token !== '';
}

function resolvePath(path: Deferred<string>): string {
  return typeof path === 'function' ? path() : path;
}

function resolveOptions(options: Deferred<RequestInit>): RequestInit {
  return typeof options === 'function' ? options() : options;
}

function missingSessionError(host: AuthHttpHost): Error {
  return host._oauthExchangeError ?? new Error('No active session');
}

function failed(error: Error, status: number | null = null, data: unknown = null): RequestResult {
  return { ok: false, status, error, data };
}

function stale(): RequestResult {
  const error = new AuthSessionChangedError();
  const result = { data: null, status: error.status, headers: {}, version: null, error };
  return result;
}

export async function authFetchWithContext(
  host: AuthHttpHost,
  path: Deferred<string>,
  options: Deferred<RequestInit> = {},
): Promise<ContextRequest> {
  if (host._oauthExchangePromise !== null) {
    await host._completeOAuthExchange();
  }
  const context = host._captureAuthContext();
  if (!hasToken(context.accessToken)) {
    return { result: failed(missingSessionError(host)), context };
  }
  const requestPath = resolvePath(path);
  const requestOptions = resolveOptions(options);
  if (!host._isAuthContextCurrent(context)) {
    return { result: stale(), context };
  }
  return {
    result: await authFetchUrl(host, `${host.apiUrl}${requestPath}`, requestOptions),
    context,
  };
}

function headerEntries(source?: HeadersInit): [string, string][] {
  if (source instanceof Headers) {
    return Array.from(source.entries());
  }
  return Array.isArray(source) ? source : Object.entries(source ?? {});
}

function requestHeaders(token: string | null, source?: HeadersInit): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${String(token)}`,
    'Content-Type': 'application/json',
  };
  const names = new Map<string, string>([
    ['authorization', 'Authorization'],
    ['content-type', 'Content-Type'],
  ]);
  for (const [name, value] of headerEntries(source)) {
    const normalized = name.toLowerCase();
    const existing = names.get(normalized) ?? name;
    headers[existing] = value;
    names.set(normalized, existing);
  }
  return headers;
}

async function requestOnce(
  host: AuthHttpHost,
  url: string,
  options: RequestInit,
  token: string | null,
): Promise<{ response: Response; data: unknown }> {
  return fetchWithTimeout(
    url,
    { ...options, headers: requestHeaders(token, options.headers) },
    host.timeout,
    async (response, signal) => ({ response, data: await safeJsonParse(response, signal) }),
  );
}

function resultFromResponse(response: Response, data: unknown, message?: string): RequestResult {
  return response.ok
    ? { ok: true, status: response.status, data, error: null }
    : {
        ok: false,
        status: response.status,
        error: apiRequestError(response, data, message),
        data,
      };
}

async function fetchWithRefresh(
  host: AuthHttpHost,
  context: AuthContext,
  url: string,
  options: RequestInit,
): Promise<RequestResult> {
  const first = await requestOnce(host, url, options, context.accessToken);
  if (first.response.status !== 401) {
    return resultFromResponse(first.response, first.data);
  }
  const failure = resultFromResponse(first.response, first.data, 'Session expired');
  if (!hasToken(context.refreshToken)) {
    return failure;
  }
  return retryAfterUnauthorized(host, context, url, options, failure);
}

async function retryAfterUnauthorized(
  host: AuthHttpHost,
  context: AuthContext,
  url: string,
  options: RequestInit,
  failure: RequestResult,
): Promise<RequestResult> {
  const refreshed = await host._refreshSessionForContext(context);
  if (AuthRefreshDiscardedError.is(refreshed.error)) {
    return failed(refreshed.error, refreshed.error.status);
  }
  if (refreshed.error !== null) {
    return failure;
  }
  if (!host._isAuthContextCurrent(context)) {
    return failed(new AuthRefreshDiscardedError(), 409);
  }
  const second = await requestOnce(host, url, options, host.accessToken);
  return resultFromResponse(second.response, second.data);
}

export async function authFetchUrl(
  host: AuthHttpHost,
  url: string,
  options: RequestInit = {},
): Promise<RequestResult> {
  const context = host._captureAuthContext();
  try {
    return await fetchWithRefresh(host, context, url, options);
  } catch (error) {
    return failed(error instanceof Error ? error : new Error('Request failed'));
  }
}

export async function anonFetch(
  host: AuthHttpHost,
  path: string,
  options: RequestInit = {},
): Promise<RequestResult> {
  try {
    const response = await fetchWithTimeout(
      `${host.apiUrl}${path}`,
      { ...options, headers: requestHeaders(host.anonKey, options.headers) },
      host.timeout,
    );
    const data = await safeJsonParse(response);
    return resultFromResponse(response, data);
  } catch (error) {
    return failed(error instanceof Error ? error : new Error('Request failed'));
  }
}
