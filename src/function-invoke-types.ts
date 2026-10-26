import type { AuthContext } from './auth-session-lifecycle.ts';
import type { FunctionError } from './sdk-public-types.ts';

export interface FunctionInvokeResponse<TResult = unknown> {
  data: TResult | string | null;
  status: number | null;
  headers: Record<string, string>;
  version: string | null;
  /** Platform failures are errors; non-2xx function responses remain data. */
  error: FunctionError | null;
}

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
