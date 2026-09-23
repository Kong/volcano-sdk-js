import { type FunctionResolveState, pruneFunctionResolveCache } from './function-resolve-cache.ts';
import { sanitizeFunctionIdentifierForHost } from './function-url.ts';

const NEGATIVE_RESOLVE_TTL_MS = 30_000;

interface ResolutionError extends Error {
  code?: string;
  retryAfter?: number;
}

interface ResolveResponse {
  ok?: boolean;
  status: number | null;
  data: unknown;
  error: ResolutionError | null;
}

export interface ResolutionClient {
  readonly _functionResolveState: FunctionResolveState;
  _anonFetch(
    path: string,
    options: { method: 'GET'; headers: Record<string, string> },
  ): Promise<ResolveResponse>;
}

export interface ResolutionOutcome {
  functionId: string | null;
  invokeUrl?: unknown;
  error: Error | null;
  status: number | null;
}

export function isResolutionOutcome(value: unknown): value is ResolutionOutcome {
  if (!isRecord(value)) {
    return false;
  }
  return (
    validResolvedId(value['functionId']) &&
    validResolvedError(value['error']) &&
    validResolvedStatus(value['status'])
  );
}

function validResolvedId(value: unknown): value is string | null {
  return typeof value === 'string' || value === null;
}

function validResolvedError(value: unknown): value is Error | null {
  return value instanceof Error || value === null;
}

function validResolvedStatus(value: unknown): value is number | null {
  return typeof value === 'number' || value === null;
}

export async function resolveFunctionByHttp(
  client: ResolutionClient,
  hostLabel: string,
  token: string,
  cacheKey: string,
): Promise<ResolutionOutcome> {
  const path = `/functions/resolve?name=${encodeURIComponent(hostLabel)}`;
  const result = await client._anonFetch(path, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (result.ok !== true) {
    return failedResolution(client._functionResolveState, cacheKey, result);
  }
  return successfulResolution(client._functionResolveState, cacheKey, result);
}

function failedResolution(
  state: FunctionResolveState,
  cacheKey: string,
  result: ResolveResponse,
): ResolutionOutcome {
  if (result.status === 404) {
    cacheNotFound(state, cacheKey, result);
  }
  return {
    functionId: null,
    error: result.error ?? new Error('Failed to resolve function'),
    status: result.status,
  };
}

function cacheNotFound(
  state: FunctionResolveState,
  cacheKey: string,
  result: ResolveResponse,
): void {
  state.cache.set(cacheKey, {
    functionId: null,
    // Older bundles share the V1 cache, where failures are strings.
    error: cachedErrorMessage(result.error),
    errorMetadata: {
      status: result.status,
      code: result.error?.code,
      retryAfter: result.error?.retryAfter,
    },
    expiresAt: Date.now() + NEGATIVE_RESOLVE_TTL_MS,
  });
  pruneFunctionResolveCache(state, Date.now(), true);
}

function successfulResolution(
  state: FunctionResolveState,
  cacheKey: string,
  result: ResolveResponse,
): ResolutionOutcome {
  const payload = validatedPayload(result.data);
  state.cache.set(cacheKey, {
    functionId: payload.functionId,
    invokeUrl: payload.invokeUrl,
    error: null,
    expiresAt: Date.now() + payload.ttlSeconds * 1000,
  });
  pruneFunctionResolveCache(state, Date.now(), true);
  return {
    functionId: payload.functionId,
    invokeUrl: payload.invokeUrl,
    error: null,
    status: result.status,
  };
}

function validatedPayload(data: unknown): {
  functionId: string;
  invokeUrl: unknown;
  ttlSeconds: number;
} {
  if (!isRecord(data)) {
    throw new Error('Resolve response missing valid function_id');
  }
  const record = data;
  return {
    functionId: resolvedId(record),
    invokeUrl: record['invoke_url'],
    ttlSeconds: resolvedTtl(record),
  };
}

function cachedErrorMessage(error: ResolutionError | null): string {
  if (error === null || error.message.length === 0) {
    return 'function not found';
  }
  return error.message;
}

function resolvedId(record: Record<string, unknown>): string {
  const functionId = sanitizeFunctionIdentifierForHost(record['function_id']);
  if (functionId === null) {
    throw new Error('Resolve response missing valid function_id');
  }
  return functionId;
}

function resolvedTtl(record: Record<string, unknown>): number {
  const ttlSeconds = Number(record['cache_ttl_seconds']);
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error('Resolve response missing valid cache_ttl_seconds');
  }
  return ttlSeconds;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
