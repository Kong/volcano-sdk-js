import type { ContextRequest } from './auth-request.ts';
import { optionalField, requiredField } from './auth-response.ts';
import type { AuthContext } from './auth-session-lifecycle.ts';
import { sanitizeProvider } from './auth-validation.ts';
import { AuthSessionChangedError } from './errors.ts';
import type {
  LinkProviderResponse,
  OAuthProvider,
  OAuthTokenResponse,
} from './sdk-public-types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertLinkResponse(value: unknown): asserts value is LinkProviderResponse {
  if (!isRecord(value) || typeof value['authorization_url'] !== 'string') {
    throw new TypeError('OAuth link response must include an authorization URL');
  }
}

function hasValidProviderDates(value: Record<string, unknown>): boolean {
  for (const name of ['linked_at', 'updated_at']) {
    if (Object.hasOwn(value, name) && typeof value[name] !== 'string') {
      return false;
    }
  }
  return true;
}

function isLinkedProvider(value: unknown): value is OAuthProvider {
  return isRecord(value) && typeof value['provider'] === 'string' && hasValidProviderDates(value);
}

function linkedProviders(value: unknown): OAuthProvider[] {
  const providers = optionalField(value, 'providers');
  if (providers === undefined || providers === null) {
    return [];
  }
  if (!Array.isArray(providers) || !providers.every(isLinkedProvider)) {
    throw new TypeError('OAuth providers response must contain valid providers');
  }
  return providers;
}

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
): Promise<{ data: LinkProviderResponse | null; error: Error | null }> {
  sanitizeProvider(provider);
  const { result, context } = await host._authFetchWithContext(`/auth/oauth/${provider}/link`, {
    method: 'POST',
  });
  if (!host._isAuthContextCurrent(context)) {
    return { data: null, error: new AuthSessionChangedError() };
  }
  if (result.ok !== true) {
    return { data: null, error: result.error };
  }
  assertLinkResponse(result.data);
  return { data: result.data, error: null };
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
): Promise<{ providers: OAuthProvider[] | null; error: Error | null }> {
  const { result, context } = await host._authFetchWithContext('/auth/oauth/providers');
  if (!host._isAuthContextCurrent(context)) {
    return { providers: null, error: new AuthSessionChangedError() };
  }
  if (result.ok !== true) {
    return { providers: null, error: result.error };
  }
  return { providers: linkedProviders(result.data), error: null };
}

function failedTokenStatus(error: Error): OAuthTokenResponse {
  return { message: null, provider: null, expiresIn: null, error };
}

function tokenString(value: unknown, name: string): string {
  const field = requiredField(value, name);
  if (typeof field !== 'string') {
    throw new TypeError(`OAuth token ${name} must be a string`);
  }
  return field;
}

function tokenExpiry(value: unknown): number {
  const field = requiredField(value, 'expires_in');
  if (typeof field !== 'number' || !Number.isInteger(field)) {
    throw new TypeError('OAuth token expires_in must be an integer');
  }
  return field;
}

function tokenStatus(host: AuthProviderHost, response: ContextRequest): OAuthTokenResponse {
  const { result, context } = response;
  if (!host._isAuthContextCurrent(context)) {
    return failedTokenStatus(new AuthSessionChangedError());
  }
  if (result.ok !== true) {
    return failedTokenStatus(result.error);
  }
  return {
    message: tokenString(result.data, 'message'),
    provider: tokenString(result.data, 'provider'),
    expiresIn: tokenExpiry(result.data),
    error: null,
  };
}

export async function refreshOAuthToken(
  host: AuthProviderHost,
  provider: string,
): Promise<OAuthTokenResponse> {
  sanitizeProvider(provider);
  return tokenStatus(
    host,
    await host._authFetchWithContext(`/auth/oauth/${provider}/refresh-token`, { method: 'POST' }),
  );
}

export async function getOAuthProviderToken(
  host: AuthProviderHost,
  provider: string,
): Promise<OAuthTokenResponse> {
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
