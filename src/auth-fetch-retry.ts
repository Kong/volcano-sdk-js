import { AuthRefreshDiscardedError } from './errors.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';

interface AuthContext {
  accessToken: string | null;
}

export interface AuthRetryClient<Context extends AuthContext> {
  readonly timeout: number;
  readonly accessToken: string | null;
  _completeOAuthExchange(): Promise<unknown>;
  _captureAuthContext(): Context;
  _refreshSessionForContext(context: Context): Promise<{ error: Error | null | undefined }>;
  _isAuthContextCurrent(context: Context): boolean;
}

/** Retries one authenticated request only while its captured session remains current. */
export async function fetchWithAuthRetry<Context extends AuthContext>(
  client: AuthRetryClient<Context>,
  url: string,
  options: RequestInit = {},
): Promise<Response> {
  await client._completeOAuthExchange();
  const context = client._captureAuthContext();
  const doFetch = (accessToken: string | null): Promise<Response> => {
    return fetchWithTimeout(
      url,
      {
        ...options,
        headers: authenticatedHeaders(options.headers, accessToken),
      },
      client.timeout,
    );
  };

  const response = await doFetch(context.accessToken);
  if (response.status !== 401) {
    return response;
  }
  return retryAfterUnauthorized(client, context, response, doFetch);
}

function authenticatedHeaders(
  source: HeadersInit | undefined,
  accessToken: string | null,
): Record<string, string> {
  const headers =
    source instanceof Headers || Array.isArray(source)
      ? Object.fromEntries(new Headers(source).entries())
      : { ...source };
  const authenticated: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() !== 'authorization') {
      authenticated[name] = value;
    }
  }
  authenticated['Authorization'] = `Bearer ${String(accessToken)}`;
  return authenticated;
}

async function retryAfterUnauthorized<Context extends AuthContext>(
  client: AuthRetryClient<Context>,
  context: Context,
  response: Response,
  doFetch: (accessToken: string | null) => Promise<Response>,
): Promise<Response> {
  const refreshed = await client._refreshSessionForContext(context);
  if (AuthRefreshDiscardedError.is(refreshed.error)) {
    throw refreshed.error;
  }
  if (refreshed.error != null) {
    return response;
  }
  if (!client._isAuthContextCurrent(context)) {
    throw new AuthRefreshDiscardedError();
  }
  return doFetch(client.accessToken);
}
