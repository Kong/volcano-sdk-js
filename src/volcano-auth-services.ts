import type { AuthContext } from './auth-session-lifecycle.ts';
import type { DurableFacade } from './durable-facade.ts';
import { isFalsy } from './falsy.ts';
import { type FunctionInvokeResponse, invokeFunction as invokeFunctionWithClient } from './function-invoke.ts';
import {
  clearFunctionResolveCache,
  clearSharedFunctionResolveStateForTests,
  functionResolveCacheKey,
  getSharedFunctionResolveState,
  pruneFunctionResolveCache,
} from './function-resolve-cache.ts';
import { functionInvokeUrl, sanitizeFunctionIdentifierForHost } from './function-url.ts';
import { pathSegment } from './path-segments.ts';
import { logActivityResult, logSearchResult } from './project-logs.ts';
import {
  assertCurrentAuthContext,
  readFunctionResolveCache,
  resolveUncachedFunction,
} from './volcano-auth-function-resolution.ts';
import { VolcanoAuthIdentity } from './volcano-auth-identity.ts';

export class VolcanoAuthServices extends VolcanoAuthIdentity {
  /** @internal */
  async _postProjectLogRequest(
    projectId: string,
    endpoint: string,
    request: unknown,
  ): Promise<{ data: unknown; error: Error | null }> {
    const project = pathSegment('projectId', projectId);
    if (project.error !== null) {
      return { data: null, error: project.error };
    }

    const result = await this._authFetch(`/projects/${project.segment}/logs/${endpoint}`, {
      method: 'POST',
      body: JSON.stringify(isFalsy(request) ? {} : request),
    });

    if (result.ok !== true) {
      return { data: null, error: result.error };
    }

    return { data: result.data, error: null };
  }

  /** @internal */
  async searchLogs(
    projectId: string,
    request: import('./sdk-public-types.ts').LogSearchRequest,
  ): Promise<import('./sdk-public-types.ts').LogsResponse<import('./sdk-public-types.ts').LogSearchResponse>> {
    const result = await this._postProjectLogRequest(projectId, 'search', request);
    return result.error === null ? logSearchResult(result.data) : { data: null, error: result.error };
  }

  /** @internal */
  async getLogActivity(
    projectId: string,
    request: import('./sdk-public-types.ts').LogActivityRequest,
  ): Promise<import('./sdk-public-types.ts').LogsResponse<import('./sdk-public-types.ts').LogActivityResponse>> {
    const result = await this._postProjectLogRequest(projectId, 'activity', request);
    return result.error === null ? logActivityResult(result.data) : { data: null, error: result.error };
  }

  /** @internal */
  _getFunctionInvokeUrl(functionIdentifier: unknown, resolvedInvokeUrl: unknown): ReturnType<typeof functionInvokeUrl> {
    return functionInvokeUrl(this.apiUrl, functionIdentifier, resolvedInvokeUrl);
  }

  /** @internal */
  _functionResolveCacheKey(
    functionName: string,
    token: string,
    useAnonKey: boolean,
  ): ReturnType<typeof functionResolveCacheKey> {
    return functionResolveCacheKey(this.apiUrl, functionName, token, useAnonKey);
  }

  /** @internal */
  _clearFunctionResolveCache(functionName: string, token: string, useAnonKey: boolean): void {
    const cacheKey = this._functionResolveCacheKey(functionName, token, useAnonKey);
    clearFunctionResolveCache(this._functionResolveState, cacheKey);
  }

  /** @internal */
  async _resolveFunctionIdByName(
    functionName: string,
    options: {
      authContext: AuthContext;
      token: string | null;
      useAnonKey: boolean;
      allowRefresh?: boolean;
    },
  ): Promise<{ functionId: string | null; invokeUrl: unknown; token: string | null }> {
    const hostLabel = sanitizeFunctionIdentifierForHost(functionName);
    if (hostLabel === null) {
      throw new Error('functionName must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars');
    }
    const { authContext, token, useAnonKey } = options;
    assertCurrentAuthContext(this, authContext);
    if (token === null) {
      throw new Error('No credential available to resolve function');
    }
    const cacheKey = this._functionResolveCacheKey(hostLabel, token, useAnonKey);
    const cached = readFunctionResolveCache(this, cacheKey, token);
    if (cached !== null) {
      return cached;
    }
    return resolveUncachedFunction(this, hostLabel, functionName, cacheKey, token, options);
  }

  /** @internal */
  invokeFunction<TResult = unknown>(functionName: string, payload?: unknown): Promise<FunctionInvokeResponse<TResult>>;
  /** @internal */
  async invokeFunction(functionName: string, payload: unknown = {}): Promise<FunctionInvokeResponse> {
    return invokeFunctionWithClient(this, functionName, payload);
  }

  /** @internal */
  startDurableExecution(
    functionName: string,
    input: unknown = {},
    options: { executionName?: string } = {},
  ): ReturnType<DurableFacade['start']> {
    return this._durableFacade.start(functionName, input, options);
  }

  /** @internal */
  getDurableExecution(projectId: string, functionName: string, executionId: string): ReturnType<DurableFacade['get']> {
    return this._durableFacade.get(projectId, functionName, executionId);
  }

  /** @internal */
  listDurableExecutions(
    projectId: string,
    functionName: string,
    options: Parameters<DurableFacade['list']>[2] = {},
  ): ReturnType<DurableFacade['list']> {
    return this._durableFacade.list(projectId, functionName, options);
  }

  /** @internal */
  stopDurableExecution(
    projectId: string,
    functionName: string,
    executionId: string,
  ): ReturnType<DurableFacade['stop']> {
    return this._durableFacade.stop(projectId, functionName, executionId);
  }

  /**
   * @internal Test-only helper to ensure deterministic cache behavior in unit tests.
   */
  static __resetFunctionResolveCacheForTests(): void {
    clearSharedFunctionResolveStateForTests();
  }

  /**
   * @internal Test-only helper for asserting global resolver cache state.
   */
  static __getFunctionResolveCacheMetricsForTests(): {
    cacheSize: number;
    inFlightSize: number;
    maxEntries: number;
  } {
    const state = getSharedFunctionResolveState();
    return {
      cacheSize: state.cache.size,
      inFlightSize: state.inFlight.size,
      maxEntries: state.maxEntries,
    };
  }

  /**
   * @internal Test-only helper for forcing resolver cache limits.
   */
  static __setFunctionResolveCacheMaxEntriesForTests(maxEntries: unknown): void {
    const nextMax = Number(maxEntries);
    if (!Number.isInteger(nextMax) || nextMax < 1) {
      throw new Error('maxEntries must be a positive integer');
    }
    const state = getSharedFunctionResolveState();
    state.maxEntries = nextMax;
    pruneFunctionResolveCache(state, Date.now(), true);
  }
}
