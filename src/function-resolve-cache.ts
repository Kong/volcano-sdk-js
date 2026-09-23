import { extractRequiredProjectIdFromToken } from './token-claims.ts';

const DEFAULT_MAX_ENTRIES = 1024;
const PRUNE_INTERVAL_MS = 5000;

export interface FunctionResolveState {
  cache: Map<string, unknown>;
  inFlight: Map<string, Promise<unknown>>;
  maxEntries: number;
  lastPruneAtMs: number;
}

declare global {
  // The V1 key shares resolution across SDK copies in one JavaScript realm.
  var __VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__: FunctionResolveState | undefined;
}

export function getSharedFunctionResolveState(): FunctionResolveState {
  const shared = globalThis.__VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__;
  if (shared !== undefined) {
    return shared;
  }
  const state: FunctionResolveState = {
    cache: new Map(),
    inFlight: new Map(),
    maxEntries: DEFAULT_MAX_ENTRIES,
    lastPruneAtMs: 0,
  };
  globalThis.__VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__ = state;
  return state;
}

export function functionResolveCacheKey(
  apiUrl: string,
  functionName: string,
  token: string,
  useAnonKey: boolean,
): string {
  if (useAnonKey) {
    return `${apiUrl}|anon:${token}|${functionName}`;
  }
  const projectScope = extractRequiredProjectIdFromToken(token);
  return `${apiUrl}|project:${projectScope}|token:${token}|${functionName}`;
}

export function clearFunctionResolveCache(state: FunctionResolveState, cacheKey: string): void {
  state.cache.delete(cacheKey);
  state.inFlight.delete(cacheKey);
}

function cacheExpiry(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('expiresAt' in value)) {
    return null;
  }
  return typeof value.expiresAt === 'number' ? value.expiresAt : null;
}

export function pruneFunctionResolveCache(
  state: FunctionResolveState,
  nowMs = Date.now(),
  force = false,
): void {
  if (!force && nowMs - state.lastPruneAtMs < PRUNE_INTERVAL_MS) {
    return;
  }
  state.lastPruneAtMs = nowMs;
  const retained = removeExpiredEntries(state, nowMs);
  removeOverflowEntries(state, retained);
}

function removeExpiredEntries(state: FunctionResolveState, nowMs: number): [string, number][] {
  const retained: [string, number][] = [];
  for (const [key, value] of state.cache) {
    const expiresAt = cacheExpiry(value);
    if (expiresAt === null || expiresAt <= nowMs) {
      state.cache.delete(key);
    } else {
      retained.push([key, expiresAt]);
    }
  }
  return retained;
}

function removeOverflowEntries(state: FunctionResolveState, retained: [string, number][]): void {
  if (retained.length <= state.maxEntries) {
    return;
  }

  retained.sort((a, b) => a[1] - b[1]);
  const overflowCount = retained.length - state.maxEntries;
  for (const [key] of retained.slice(0, overflowCount)) {
    state.cache.delete(key);
  }
}

export function clearSharedFunctionResolveStateForTests(): void {
  const state = getSharedFunctionResolveState();
  state.cache.clear();
  state.inFlight.clear();
  state.maxEntries = DEFAULT_MAX_ENTRIES;
  state.lastPruneAtMs = 0;
}
