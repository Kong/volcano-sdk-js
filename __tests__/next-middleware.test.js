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
});
