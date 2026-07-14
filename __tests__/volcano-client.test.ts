/** @jest-environment node */

import { authGetUser } from '../src/api';
import { createVolcanoClient } from '../src/index.js';

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });

describe('createVolcanoClient generated API refresh', () => {
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
  });
});
