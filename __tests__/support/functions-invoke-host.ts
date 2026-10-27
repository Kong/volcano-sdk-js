import { jest } from '@jest/globals';
import { AuthSessionOperations } from '../../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../../src/auth-session-lifecycle.ts';
import {
  type FunctionInvocationHost,
  type FunctionInvocationResult,
  invokeFunction,
} from '../../src/function-invoke.ts';

interface HostFixture {
  host: FunctionInvocationHost;
  context: AuthContext;
  setToken(token: string | null): void;
}

export function hostFixture(oauthExchangePromise: Promise<unknown> | null = null, anonKey = 'anon-token'): HostFixture {
  const operations = new AuthSessionOperations<RefreshResult, SignOutResult>();
  let token: string | null = 'user-token';
  const context: AuthContext = {
    generation: 1,
    operations,
    userId: 'user-1',
    accessToken: 'user-token',
    refreshToken: 'refresh-token',
  };
  const host: FunctionInvocationHost = {
    anonKey,
    get accessToken() {
      return token;
    },
    timeout: 1000,
    _oauthExchangePromise: oauthExchangePromise,
    _sessionOperations: operations,
    _sessionGeneration: 1,
    _captureAuthContext: () => context,
    _isAuthContextCurrent: () => true,
    _completeOAuthExchange: () => Promise.resolve(),
    _resolveFunctionIdByName: () =>
      Promise.resolve({
        functionId: 'fn-1',
        invokeUrl: 'https://function.test/invoke',
        token: 'user-token',
      }),
    _getFunctionInvokeUrl: () => 'https://function.test/invoke',
    _refreshSessionForContext: () => Promise.resolve({ error: null }),
    _clearFunctionResolveCache: jest.fn<FunctionInvocationHost['_clearFunctionResolveCache']>(),
  };
  return {
    host,
    context,
    setToken(next) {
      token = next;
    },
  };
}

export function foreignError(message: string): Error {
  return new Proxy(new Error(message), { getPrototypeOf: () => null });
}

export function rejectedRefreshResult(
  refreshClearedSession: boolean,
  sameOperations: boolean,
  generation: number,
): Promise<FunctionInvocationResult> {
  const fixture = hostFixture();
  const context = fixture.context;
  const replacement: AuthContext = { ...context, generation: 2, accessToken: null };
  let current = context;
  const host: FunctionInvocationHost = {
    ...fixture.host,
    _sessionOperations: sameOperations ? context.operations : new AuthSessionOperations<RefreshResult, SignOutResult>(),
    _sessionGeneration: generation,
    _captureAuthContext: () => current,
    _isAuthContextCurrent: (captured) => captured === current,
    _refreshSessionForContext() {
      context.operations.refreshClearedSession = refreshClearedSession;
      current = replacement;
      return Promise.resolve({ error: new Error('refresh denied') });
    },
  };
  return invokeFunction(host, 'orders');
}
