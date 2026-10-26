import type { ContextRequest } from '../../src/auth-request.ts';

type Deferred<Value> = Value | (() => Value);

interface AuthRequest {
  path: string;
  options: RequestInit | undefined;
}

function resolvePath(path: Deferred<string>): string {
  return typeof path === 'function' ? path() : path;
}

function resolveOptions(options: Deferred<RequestInit> | undefined): RequestInit | undefined {
  return typeof options === 'function' ? options() : options;
}

/**
 * An `_authFetchWithContext` double that answers every request with `answer` and
 * records it with its deferred path and options resolved, as the session host sends it.
 */
export function recordAuthRequests(answer: ContextRequest): {
  requests: AuthRequest[];
  authFetchWithContext: (path: Deferred<string>, options?: Deferred<RequestInit>) => Promise<ContextRequest>;
} {
  const requests: AuthRequest[] = [];
  return {
    requests,
    authFetchWithContext: (path, options) => {
      requests.push({ path: resolvePath(path), options: resolveOptions(options) });
      return Promise.resolve(answer);
    },
  };
}
