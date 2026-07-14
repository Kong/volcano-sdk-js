const { createServerClient, withAuth } = require('../src/next/middleware.ts');

describe('Next.js middleware helpers', () => {
  const config = {
    anonKey: 'ak-test-anon-key',
    baseUrl: 'https://api.test.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getUser returns user from response payload', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { id: 'user-123', email: 'test@example.com' } }),
    });

    const client = createServerClient(config);
    const { user, error } = await client.getUser('access-token');

    expect(error).toBeNull();
    expect(user).toEqual({ id: 'user-123', email: 'test@example.com' });
  });

  it('preserves HTTP metadata when getUser fails', async () => {
    global.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'unauthorized', error: 'expired' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    );

    const client = createServerClient(config);
    const { error, user } = await client.getUser('expired-token');

    expect(user).toBeNull();
    expect(error).toMatchObject({ code: 'unauthorized', status: 401 });
    expect(error.request.url).toBe('https://api.test.com/auth/user');
    expect(error.response.status).toBe(401);
  });

  it('withAuth returns user when Authorization header is present', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ user: { id: 'user-456' } }),
    });

    const client = createServerClient(config);
    const request = {
      headers: {
        get: (name) => (name === 'authorization' ? 'Bearer test-token' : null),
      },
      cookies: {
        get: () => null,
      },
    };

    const user = await withAuth(request, client);

    expect(user).toEqual({ id: 'user-456' });
  });

  it('refreshes through the generated auth operation', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
        }),
    });

    const client = createServerClient(config);
    const result = await client.refreshToken('refresh-token');

    expect(result).toEqual({
      accessToken: 'new-access-token',
      error: null,
      refreshToken: 'new-refresh-token',
    });
    const request = global.fetch.mock.calls[0][0];
    expect(request.url).toBe('https://api.test.com/auth/refresh');
    expect(request.headers.get('Authorization')).toBe('Bearer ak-test-anon-key');
  });

  it('preserves HTTP metadata when refresh fails', async () => {
    global.fetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: 'invalid_refresh_token', error: 'invalid token' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      }),
    );

    const client = createServerClient(config);
    const result = await client.refreshToken('invalid-token');

    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.error).toMatchObject({ code: 'invalid_refresh_token', status: 401 });
    expect(result.error.request.url).toBe('https://api.test.com/auth/refresh');
    expect(result.error.response.status).toBe(401);
  });
});
