import type { ContextRequest } from './auth-request.ts';
import { optionalField, requiredField } from './auth-response.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import { sanitizeProvider } from './auth-validation.ts';
import { AuthSessionChangedError } from './errors.ts';

export interface AuthProviderHost {
  _authFetchWithContext(
    path: string,
    options?: RequestInit | (() => RequestInit),
  ): Promise<ContextRequest>;
  _isAuthContextCurrent(context: AuthContext): boolean;
}

export async function linkOAuthProvider(
  host: AuthProviderHost,
  provider: string,
): Promise<{ data: unknown; error: Error | null }> {
  sanitizeProvider(provider);
  const { result, context } = await host._authFetchWithContext(`/auth/oauth/${provider}/link`, {
    method: 'POST',
  });
  if (!host._isAuthContextCurrent(context)) {
    return { data: null, error: new AuthSessionChangedError() };
  }
  return result.ok === true
    ? { data: result.data, error: null }
    : { data: null, error: result.error };
}

export async function unlinkOAuthProvider(
  host: AuthProviderHost,
  provider: string,
): Promise<{ error: Error | null }> {
  sanitizeProvider(provider);
  const { result, context } = await host._authFetchWithContext(`/auth/oauth/${provider}/unlink`, {
    method: 'DELETE',
  });
  if (!host._isAuthContextCurrent(context)) {
    return { error: new AuthSessionChangedError() };
  }
  return { error: result.error };
}

export async function getLinkedOAuthProviders(
  host: AuthProviderHost,
): Promise<{ providers: unknown; error: Error | null }> {
  const { result, context } = await host._authFetchWithContext('/auth/oauth/providers');
  if (!host._isAuthContextCurrent(context)) {
    return { providers: null, error: new AuthSessionChangedError() };
  }
  if (result.ok !== true) {
    return { providers: null, error: result.error };
  }
  const providers = optionalField(result.data, 'providers');
  return { providers: Boolean(providers) ? providers : [], error: null };
}

interface TokenStatus {
  message: unknown;
  provider: unknown;
  expiresIn: unknown;
  error: Error | null;
}

function failedTokenStatus(error: Error): TokenStatus {
  return { message: null, provider: null, expiresIn: null, error };
}

function tokenStatus(host: AuthProviderHost, response: ContextRequest): TokenStatus {
  const { result, context } = response;
  if (!host._isAuthContextCurrent(context)) {
    return failedTokenStatus(new AuthSessionChangedError());
  }
  if (result.ok !== true) {
    return failedTokenStatus(result.error);
  }
  return {
    message: requiredField(result.data, 'message'),
    provider: requiredField(result.data, 'provider'),
    expiresIn: requiredField(result.data, 'expires_in'),
    error: null,
  };
}

export async function refreshOAuthToken(
  host: AuthProviderHost,
  provider: string,
): Promise<TokenStatus> {
  sanitizeProvider(provider);
  return tokenStatus(
    host,
    await host._authFetchWithContext(`/auth/oauth/${provider}/refresh-token`, { method: 'POST' }),
  );
}

export async function getOAuthProviderToken(
  host: AuthProviderHost,
  provider: string,
): Promise<TokenStatus> {
  sanitizeProvider(provider);
  return tokenStatus(host, await host._authFetchWithContext(`/auth/oauth/${provider}/token`));
}

export async function callOAuthAPI(
  host: AuthProviderHost,
  provider: string,
  params: { endpoint: string; method?: string; body?: unknown },
): Promise<{ data: unknown; error: Error | null }> {
  sanitizeProvider(provider);
  const { result, context } = await host._authFetchWithContext(
    `/auth/oauth/${provider}/call-api`,
    () => {
      const { endpoint, method = 'GET', body = null } = params;
      return { method: 'POST', body: JSON.stringify({ endpoint, method, body }) };
    },
  );
  if (!host._isAuthContextCurrent(context)) {
    return { data: null, error: new AuthSessionChangedError() };
  }
  return result.ok === true
    ? { data: requiredField(result.data, 'data'), error: null }
    : { data: null, error: result.error };
}
