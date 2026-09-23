import type { AuthContext } from './auth-session-lifecycle.ts';
import {
  AuthRefreshDiscardedError,
  AuthSessionChangedError,
  VolcanoSystemError,
} from './errors.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';
import { functionInvokeResult, functionWasDispatched } from './function-invocation-response.ts';

export interface FunctionInvocationResult {
  data: unknown;
  status: number | null;
  headers: Record<string, string>;
  version: string | null;
  error: Error | null;
}

interface Resolution {
  functionId: unknown;
  invokeUrl: unknown;
  token: string | null;
}

export interface FunctionInvocationHost {
  readonly anonKey: string;
  readonly accessToken: string | null;
  readonly timeout: number;
  readonly _oauthExchangePromise: Promise<unknown> | null;
  readonly _sessionOperations: AuthContext['operations'];
  readonly _sessionGeneration: number;
  _captureAuthContext(): AuthContext;
  _isAuthContextCurrent(context: AuthContext): boolean;
  _completeOAuthExchange(): Promise<unknown>;
  _resolveFunctionIdByName(
    functionName: string,
    options: {
      authContext: AuthContext;
      token: string | null;
      useAnonKey: boolean;
      allowRefresh?: boolean;
    },
  ): Promise<Resolution>;
  _getFunctionInvokeUrl(functionIdentifier: unknown, resolvedInvokeUrl: unknown): string;
  _refreshSessionForContext(context: AuthContext): Promise<{ error: unknown }>;
  _clearFunctionResolveCache(functionName: string, token: string | null, useAnonKey: boolean): void;
}

function failed(error: Error, status: number | null = null): FunctionInvocationResult {
  return { data: null, status, headers: {}, version: null, error };
}

function asError(reason: unknown, fallback: string): Error {
  return reason instanceof Error ? reason : new Error(fallback);
}

function hasToken(token: string | null): token is string {
  return token !== null && token.length > 0;
}

function authSessionChangedResult(): FunctionInvocationResult {
  const error = new AuthSessionChangedError();
  return failed(error, error.status);
}

export async function invokeFunction(
  host: FunctionInvocationHost,
  functionName: unknown,
  payload: unknown = {},
): Promise<FunctionInvocationResult> {
  if (typeof functionName !== 'string' || functionName.length === 0) {
    return failed(new Error('functionName must be a non-empty string'));
  }
  return new FunctionInvocation(host, functionName).run(payload);
}

class FunctionInvocation {
  private operationContext: AuthContext;
  private resolutionContext: AuthContext;
  private useAnonKey = false;
  private resolutionToken: string | null = null;
  private resolvedFunctionId: unknown;
  private resolvedInvokeUrl: unknown;
  private invokeUrl = '';
  private requestBody = '';
  private dispatched = false;

  constructor(
    private readonly host: FunctionInvocationHost,
    private readonly functionName: string,
  ) {
    this.operationContext = host._captureAuthContext();
    this.resolutionContext = this.operationContext;
  }

  async run(payload: unknown): Promise<FunctionInvocationResult> {
    const serializationError = this.serializePayload(payload);
    if (serializationError !== null) {
      return failed(serializationError);
    }
    if (!this.contextIsAvailable()) {
      return authSessionChangedResult();
    }
    await this.completeOAuthExchange();
    const resolutionError = await this.initialResolution();
    if (resolutionError !== null) {
      return resolutionError;
    }
    let result = await this.invokeWithCurrentCredential();
    result = await this.retryDeletedFunction(result);
    return this.finalize(result);
  }

  private finalize(result: FunctionInvocationResult): FunctionInvocationResult {
    if (
      !this.host._isAuthContextCurrent(this.operationContext) &&
      !AuthRefreshDiscardedError.is(result.error)
    ) {
      return authSessionChangedResult();
    }
    return result;
  }

  private serializePayload(payload: unknown): Error | null {
    try {
      // Snapshot before yielding so resolution and auth recovery cannot change the payload.
      const body = JSON.stringify({ payload });
      this.requestBody = body;
      return null;
    } catch (reason) {
      return new VolcanoSystemError(
        reason instanceof Error ? reason.message : 'Invalid function payload',
        { cause: reason },
      );
    }
  }

  private contextIsAvailable(): boolean {
    return (
      this.host._isAuthContextCurrent(this.operationContext) &&
      this.operationContext.operations.pendingSignOut() === null
    );
  }

  private async completeOAuthExchange(): Promise<void> {
    if (this.host._oauthExchangePromise !== null) {
      await this.host._completeOAuthExchange();
      this.operationContext = this.host._captureAuthContext();
    }
    this.useAnonKey = !Boolean(this.operationContext.accessToken);
    this.resolutionContext = this.operationContext;
    this.resolutionToken = this.credential(this.resolutionContext);
  }

  private credential(context: AuthContext): string | null {
    return this.useAnonKey ? this.host.anonKey : context.accessToken;
  }

  private async initialResolution(): Promise<FunctionInvocationResult | null> {
    try {
      await this.resolveFunction();
    } catch (reason) {
      return failed(asError(reason, 'Failed to resolve function'));
    }
    try {
      this.resolveInvokeUrl();
    } catch (reason) {
      return failed(asError(reason, 'Invalid function identifier'));
    }
    return null;
  }

  private async resolveFunction(): Promise<void> {
    const resolution = await this.host._resolveFunctionIdByName(this.functionName.trim(), {
      authContext: this.resolutionContext,
      token: this.resolutionToken,
      useAnonKey: this.useAnonKey,
    });
    this.resolvedFunctionId = resolution.functionId;
    this.resolvedInvokeUrl = resolution.invokeUrl;
    this.resolutionToken = resolution.token;
  }

  private resolveInvokeUrl(): void {
    this.invokeUrl = this.host._getFunctionInvokeUrl(
      this.resolvedFunctionId,
      this.resolvedInvokeUrl,
    );
  }

  private async invokeWithCurrentCredential(): Promise<FunctionInvocationResult> {
    const context = this.host._captureAuthContext();
    if (!this.host._isAuthContextCurrent(this.operationContext)) {
      return authSessionChangedResult();
    }
    return this.invokeOnce(this.invokeUrl, !this.useAnonKey, context, this.credential(context));
  }

  private async invokeOnce(
    url: string,
    allowRefresh: boolean,
    context: AuthContext,
    accessToken: string | null,
  ): Promise<FunctionInvocationResult> {
    this.dispatched = false;
    if (!hasToken(accessToken) || context.operations.pendingSignOut() !== null) {
      return authSessionChangedResult();
    }
    try {
      return await this.sendInvocation(url, allowRefresh, context, accessToken);
    } catch (reason) {
      return this.transportFailure(reason);
    }
  }

  private async sendInvocation(
    url: string,
    allowRefresh: boolean,
    context: AuthContext,
    accessToken: string,
  ): Promise<FunctionInvocationResult> {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: this.requestBody,
      },
      this.host.timeout,
    );
    const dispatched = functionWasDispatched(response);
    this.dispatched = dispatched;
    if (response.status === 401 && allowRefresh && !dispatched) {
      const retry = await this.refreshAndRetry(url, context);
      if (retry !== null) {
        return retry;
      }
    }
    return await functionInvokeResult(response, dispatched);
  }

  private async refreshAndRetry(
    url: string,
    context: AuthContext,
  ): Promise<FunctionInvocationResult | null> {
    const refreshed = await this.host._refreshSessionForContext(context);
    if (AuthRefreshDiscardedError.is(refreshed.error)) {
      return failed(refreshed.error, refreshed.error.status);
    }
    if (!Boolean(refreshed.error)) {
      if (!this.host._isAuthContextCurrent(context)) {
        const error = new AuthRefreshDiscardedError();
        return failed(error, error.status);
      }
      return this.invokeOnce(url, false, context, this.host.accessToken);
    }
    this.captureRefreshClear(context);
    return null;
  }

  private captureRefreshClear(context: AuthContext): void {
    if (
      context.operations.refreshClearedSession &&
      this.host._sessionOperations === context.operations &&
      this.host._sessionGeneration === context.generation + 1
    ) {
      // Preserve the original rejection only when this refresh cleared its owner.
      this.operationContext = this.host._captureAuthContext();
    }
  }

  private transportFailure(reason: unknown): FunctionInvocationResult {
    if (reason instanceof VolcanoSystemError) {
      return failed(reason);
    }
    return failed(
      new VolcanoSystemError(reason instanceof Error ? reason.message : 'Request failed', {
        cause: reason,
      }),
    );
  }

  private async retryDeletedFunction(
    result: FunctionInvocationResult,
  ): Promise<FunctionInvocationResult> {
    // A function-authored 404 has been dispatched and must not run twice.
    if (result.status !== 404 || this.dispatched) {
      return result;
    }
    if (!this.host._isAuthContextCurrent(this.operationContext)) {
      return authSessionChangedResult();
    }
    this.host._clearFunctionResolveCache(
      this.functionName.trim(),
      this.resolutionToken,
      this.useAnonKey,
    );
    try {
      this.resolutionContext = this.host._captureAuthContext();
      this.resolutionToken = this.credential(this.resolutionContext);
      await this.resolveFunction();
      this.resolveInvokeUrl();
      return await this.invokeWithCurrentCredential();
    } catch (reason) {
      return failed(asError(reason, 'Failed to resolve function'));
    }
  }
}
