const { createServerClient, withAuth } = require('../src/next/middleware.js');

describe('Next.js middleware helpers', () => {
  const config = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-test-anon-key',
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
});
