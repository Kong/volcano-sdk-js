/** @jest-environment node */

import { authGetUser, listStorageObjects } from '../src/api';
import { createVolcanoClient } from '../src/index.ts';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

describe('createVolcanoClient generated API refresh', () => {
  it('shares concurrent public refresh calls', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    const fetchMock = jest.fn(async () => {
      refreshStarted.resolve();
      return refreshResponse.promise;
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });

    const first = volcano.auth.refreshSession();
    const second = volcano.auth.refreshSession();
    await refreshStarted.promise;

    expect(fetchMock).toHaveBeenCalledTimes(1);
    refreshResponse.resolve(
      jsonResponse(200, {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
        user: { id: 'user-id' },
      }),
    );
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(firstResult.session?.access_token).toBe('new-access-token');
    expect(secondResult.session?.access_token).toBe('new-access-token');
  });

  it('ignores a refresh response after sign-out completes', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname === '/auth/refresh') {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      return jsonResponse(200, {});
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });
    const events: string[] = [];
    volcano.auth.onAuthStateChange((event) => events.push(event));

    const pendingRefresh = volcano.auth.refreshSession();
    await refreshStarted.promise;
    await volcano.auth.signOut();
    refreshResponse.resolve(
      jsonResponse(200, {
        access_token: 'stale-access-token',
        expires_in: 3600,
        refresh_token: 'stale-refresh-token',
        user: { id: 'stale-user' },
      }),
    );

    await expect(pendingRefresh).resolves.toEqual({ error: null, session: null });
    expect(volcano.auth.user()).toBeNull();
    expect(events).not.toContain('TOKEN_REFRESHED');
  });

  it('ignores a refresh response after a new sign-in completes', async () => {
    const refreshResponse = deferred<Response>();
    const refreshStarted = deferred<void>();
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname === '/auth/refresh') {
        refreshStarted.resolve();
        return refreshResponse.promise;
      }
      return jsonResponse(200, {
        access_token: 'signed-in-access-token',
        expires_in: 3600,
        refresh_token: 'signed-in-refresh-token',
        user: { id: 'signed-in-user' },
      });
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      anonKey: 'anon-key',
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });
    const events: string[] = [];
    volcano.auth.onAuthStateChange((event) => events.push(event));

    const pendingRefresh = volcano.auth.refreshSession();
    await refreshStarted.promise;
    await volcano.auth.signIn({ email: 'user@example.com', password: 'secret' });
    refreshResponse.resolve(
      jsonResponse(200, {
        access_token: 'stale-access-token',
        expires_in: 3600,
        refresh_token: 'stale-refresh-token',
        user: { id: 'stale-user' },
      }),
    );

    const result = await pendingRefresh;
    expect(result.session?.access_token).toBe('signed-in-access-token');
    expect(volcano.auth.user()).toEqual({ id: 'signed-in-user' });
    expect(events).not.toContain('TOKEN_REFRESHED');
  });

  it('refreshes concurrent access-token 401s once and retries each request', async () => {
    let userRequests = 0;
    let refreshRequests = 0;
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === '/auth/refresh') {
        refreshRequests += 1;
        await Promise.resolve();
        return jsonResponse(200, {
          access_token: 'new-access-token',
          expires_in: 3600,
          refresh_token: 'new-refresh-token',
          user: { id: 'user-id' },
        });
      }
      if (path === '/auth/user') {
        userRequests += 1;
        if (request.headers.get('Authorization') === 'Bearer old-access-token') {
          return jsonResponse(401, { error: 'expired' });
        }
        return jsonResponse(200, { user: { id: 'user-id' } });
      }
      throw new Error(`Unexpected request: ${request.url}`);
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      anonKey: 'anon-key',
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });

    const [first, second] = await Promise.all([volcano.auth.getUser(), volcano.auth.getUser()]);

    expect(first.error).toBeNull();
    expect(second.error).toBeNull();
    expect(first.user).toEqual({ id: 'user-id' });
    expect(second.user).toEqual({ id: 'user-id' });
    expect(refreshRequests).toBe(1);
    expect(userRequests).toBe(4);
  });

  it('retries an access-token request only once', async () => {
    let userRequests = 0;
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === '/auth/refresh') {
        return jsonResponse(200, {
          access_token: 'new-access-token',
          expires_in: 3600,
          refresh_token: 'new-refresh-token',
        });
      }
      userRequests += 1;
      return jsonResponse(401, { error: 'still expired' });
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      anonKey: 'anon-key',
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });

    const result = await volcano.auth.getUser();

    expect(result.error?.message).toBe('still expired');
    expect(userRequests).toBe(2);
  });

  it('does not refresh a 401 when automatic refresh is disabled', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, { error: 'expired' }));
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      anonKey: 'anon-key',
      auth: { autoRefreshToken: false },
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });

    const result = await volcano.auth.getUser();

    expect(result.error?.message).toBe('expired');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops waiting for a shared refresh when the request is cancelled', async () => {
    let releaseRefresh: ((response: Response) => void) | undefined;
    let notifyRefreshStarted: (() => void) | undefined;
    const refreshStarted = new Promise<void>((resolve) => {
      notifyRefreshStarted = resolve;
    });
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname === '/auth/refresh') {
        notifyRefreshStarted?.();
        return new Promise<Response>((resolve) => {
          releaseRefresh = resolve;
        });
      }
      return jsonResponse(401, { error: 'expired' });
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      anonKey: 'anon-key',
      fetch: fetchMock,
      refreshToken: 'refresh-token',
    });
    const controller = new AbortController();

    const pending = listStorageObjects({
      client: volcano.api,
      path: { bucketName: 'documents' },
      signal: controller.signal,
    });
    await refreshStarted;
    controller.abort(new DOMException('Cancelled by caller', 'AbortError'));
    const result = await pending;

    expect(result.error).toMatchObject({ message: 'Cancelled by caller', name: 'AbortError' });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    releaseRefresh?.(
      jsonResponse(200, {
        access_token: 'new-access-token',
        expires_in: 3600,
        refresh_token: 'new-refresh-token',
      }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it('clears the invalid session when refresh fails', async () => {
    const fetchMock = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      return path === '/auth/refresh'
        ? jsonResponse(401, { error: 'invalid refresh token' })
        : jsonResponse(401, { error: 'expired access token' });
    });
    const volcano = createVolcanoClient({
      accessToken: 'old-access-token',
      anonKey: 'anon-key',
      fetch: fetchMock,
      refreshToken: 'invalid-refresh-token',
    });
    const events: string[] = [];
    volcano.auth.onAuthStateChange((event) => events.push(event));

    await volcano.auth.getUser();
    const auth = volcano.api.getConfig().auth;
    const token =
      typeof auth === 'function'
        ? await auth({ key: 'AuthUserAccessToken', scheme: 'bearer', type: 'http' })
        : auth;

    expect(token).toBeUndefined();
    expect(volcano.auth.user()).toBeNull();
    await authGetUser({ client: volcano.api });
    const lastCall = fetchMock.mock.calls.at(-1);
    const lastRequest = lastCall ? new Request(lastCall[0], lastCall[1]) : undefined;
    expect(lastRequest?.headers.get('Authorization')).toBeNull();
    expect(events.filter((event) => event === 'SIGNED_OUT')).toHaveLength(1);
  });

  it('does not refresh a multi-scheme operation using a service-role credential', async () => {
    const fetchMock = jest.fn(async () => jsonResponse(401, { error: 'invalid service key' }));
    const volcano = createVolcanoClient({
      baseUrl: 'https://api.volcano.dev',
      fetch: fetchMock,
      serviceRoleKey: 'service-role-key',
    });

    const result = await listStorageObjects({
      client: volcano.api,
      path: { bucketName: 'documents' },
    });

    expect(result.error).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = new Request(fetchMock.mock.calls[0][0], fetchMock.mock.calls[0][1]);
    expect(request.headers.get('Authorization')).toBe('Bearer service-role-key');
  });
});
