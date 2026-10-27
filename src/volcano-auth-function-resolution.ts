import type { AuthContext } from './auth-session-lifecycle.ts';
import { AuthRefreshDiscardedError, AuthSessionChangedError } from './errors.ts';
import {
  isResolutionOutcome,
  type ResolutionClient,
  type ResolutionOutcome,
  resolveFunctionByHttp,
} from './function-resolution.ts';
import { cachedFunctionResolution, pruneFunctionResolveCache } from './function-resolve-cache.ts';

interface FunctionResolution {
  functionId: string | null;
  invokeUrl: unknown;
  token: string | null;
}

interface ResolveOptions {
  authContext: AuthContext;
  useAnonKey: boolean;
  allowRefresh?: boolean;
}

interface FunctionResolutionHost extends ResolutionClient {
  _isAuthContextCurrent(context: AuthContext): boolean;
  _captureAuthContext(): AuthContext;
  _refreshSessionForContext(context: AuthContext): Promise<{ error: unknown }>;
  _resolveFunctionIdByName(
    functionName: string,
    options: ResolveOptions & { token: string | null },
  ): Promise<FunctionResolution>;
}

export function assertCurrentAuthContext(host: FunctionResolutionHost, authContext: AuthContext): void {
  if (!host._isAuthContextCurrent(authContext)) {
    throw new AuthSessionChangedError();
  }
}

export function readFunctionResolveCache(
  host: FunctionResolutionHost,
  cacheKey: string,
  token: string,
): { functionId: string | null; invokeUrl: unknown; token: string } | null {
  const now = Date.now();
  pruneFunctionResolveCache(host._functionResolveState, now);
  const rawCached = host._functionResolveState.cache.get(cacheKey);
  const cached = cachedFunctionResolution(rawCached);
  if (cached !== null && cached.expiresAt > now) {
    if (cached.error !== null) {
      throw Object.assign(new Error(cached.error), { status: 404 }, cached.errorMetadata);
    }
    return { functionId: cached.functionId, invokeUrl: cached.invokeUrl, token };
  }
  if (rawCached !== undefined) {
    host._functionResolveState.cache.delete(cacheKey);
  }
  return null;
}

export async function resolveUncachedFunction(
  host: FunctionResolutionHost,
  hostLabel: string,
  functionName: string,
  cacheKey: string,
  token: string,
  options: ResolveOptions,
): Promise<FunctionResolution> {
  let pending = host._functionResolveState.inFlight.get(cacheKey);
  const ownsPending = pending === undefined;
  if (pending === undefined) {
    // Share only the credentialed HTTP result. Session validation and 401
    // refresh belong to each caller, not the shared request.
    pending = resolveFunctionByHttp(host, hostLabel, token, cacheKey);
    host._functionResolveState.inFlight.set(cacheKey, pending);
  }
  try {
    const outcome = await awaitFunctionResolution(host, pending, options.authContext);
    if (outcome.error !== null) {
      return await handleFunctionResolutionError(host, outcome.error, outcome.status, functionName, options);
    }
    return { functionId: outcome.functionId, invokeUrl: outcome.invokeUrl, token };
  } finally {
    if (ownsPending && host._functionResolveState.inFlight.get(cacheKey) === pending) {
      host._functionResolveState.inFlight.delete(cacheKey);
    }
  }
}

async function awaitFunctionResolution(
  host: FunctionResolutionHost,
  pending: Promise<unknown>,
  authContext: AuthContext,
): Promise<ResolutionOutcome> {
  let outcome: unknown;
  try {
    outcome = await pending;
  } catch (error) {
    assertCurrentAuthContext(host, authContext);
    throw error;
  }
  assertCurrentAuthContext(host, authContext);
  if (!isResolutionOutcome(outcome)) {
    throw new Error('Invalid in-flight function resolution');
  }
  return outcome;
}

async function handleFunctionResolutionError(
  host: FunctionResolutionHost,
  error: Error,
  status: number | null,
  functionName: string,
  options: ResolveOptions,
): Promise<FunctionResolution> {
  if (status === 401 && !options.useAnonKey && options.allowRefresh !== false) {
    return retryFunctionResolution(host, functionName, options, error);
  }
  throw error;
}

async function retryFunctionResolution(
  host: FunctionResolutionHost,
  functionName: string,
  options: { authContext: AuthContext; useAnonKey: boolean },
  cause: Error,
): Promise<FunctionResolution> {
  const sessionExpiredError = Object.assign(new Error('Session expired'), cause);
  if (options.authContext.refreshToken === null || options.authContext.refreshToken === '') {
    throw sessionExpiredError;
  }
  const refreshed = await host._refreshSessionForContext(options.authContext);
  if (AuthRefreshDiscardedError.is(refreshed.error)) {
    throw refreshed.error;
  }
  assertRefreshSucceeded(refreshed.error, sessionExpiredError);
  if (!host._isAuthContextCurrent(options.authContext)) {
    throw new AuthRefreshDiscardedError();
  }
  const refreshedContext = host._captureAuthContext();
  return host._resolveFunctionIdByName(functionName, {
    authContext: refreshedContext,
    token: refreshedContext.accessToken,
    useAnonKey: options.useAnonKey,
    allowRefresh: false,
  });
}

function assertRefreshSucceeded(error: unknown, sessionExpiredError: Error): void {
  if (error !== null) {
    throw sessionExpiredError;
  }
}
