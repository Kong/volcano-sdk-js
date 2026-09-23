/** @jest-environment node */
import { describe, expect, jest, test } from '@jest/globals';
import {
  createServerClient,
  type ServerClientConfig,
  type User,
  withAuth,
} from '../src/next/middleware.ts';

const config: ServerClientConfig = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

function user(id: string): User {
  return {
    id,
    email: 'test@example.com',
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Next.js middleware helpers', () => {
  test('getUser refuses a missing token without making a request', async () => {
    await expect(createServerClient(config).getUser('')).resolves.toMatchObject({
      user: null,
      error: new Error('No access token provided'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('getUser returns a user from the response payload', async () => {
    const expectedUser = user('user-123');
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: expectedUser }));

    const client = createServerClient(config);
    const result = await client.getUser('access-token');

    expect(result).toEqual({ user: expectedUser, error: null });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.test.com/auth/user', {
      method: 'GET',
      headers: {
        Authorization: 'Bearer access-token',
        'X-Anon-Key': config.anonKey,
        'Content-Type': 'application/json',
      },
    });
  });

  test.each([
    ['server message', Response.json({ error: 'denied' }, { status: 401 }), 'denied'],
    ['fallback message', Response.json({}, { status: 403 }), 'Auth failed: 403'],
    ['non-object body', Response.json(null, { status: 401 }), 'Auth failed: 401'],
    ['malformed body', new Response('not json', { status: 502 }), 'Auth failed: 502'],
  ])('getUser reports %s on HTTP errors', async (_case, response, message) => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(response);

    const result = await createServerClient(config).getUser('access-token');

    expect(result.user).toBeNull();
    expect(result.error).toEqual(new Error(message));
  });

  test('getUser treats a malformed success body as an absent user', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('not json'));

    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: null,
      error: null,
    });
  });

  test.each([
    ['non-object body', null],
    ['missing required status', { user: { id: 'user-123', email: 'test@example.com' } }],
    ['invalid metadata', { user: { ...user('user-123'), user_metadata: 'invalid' } }],
    ['invalid created timestamp', { user: { ...user('user-123'), created_at: 123 } }],
    ['invalid updated timestamp', { user: { ...user('user-123'), updated_at: 123 } }],
  ])('getUser rejects %s in a successful response', async (_case, payload) => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(payload));

    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: null,
      error: null,
    });
  });

  test('withAuth accepts a user without optional timestamps', async () => {
    const expectedUser = { id: 'user-123', email: 'test@example.com', status: 'active' };
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: expectedUser }));
    const request = new Request('https://app.test.com/dashboard', {
      headers: { authorization: 'Bearer access-token' },
    });

    await expect(withAuth(request, createServerClient(config))).resolves.toEqual(expectedUser);
  });

  test.each(['banned', 'deleted'])('getUser accepts the %s status', async (status) => {
    const expectedUser = { ...user('user-123'), status };
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: expectedUser }));

    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: expectedUser,
      error: null,
    });
  });

  test('getUser reports transport failures', async () => {
    const failure = new Error('offline');
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(failure);

    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: null,
      error: failure,
    });
  });

  test.each([
    ['record without a name', { message: 'offline' }],
    ['string', 'offline'],
  ])('getUser normalizes a rejected %s to an Error', async (_case, failure) => {
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(failure);

    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: null,
      error: new Error('offline'),
    });
  });

  test('refreshToken refuses a missing token without making a request', async () => {
    await expect(createServerClient(config).refreshToken('')).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
      error: new Error('No refresh token provided'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('refreshToken sends the current refresh token and returns its replacement', async () => {
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(
        Response.json({ access_token: 'next-access', refresh_token: 'next-refresh' }),
      );

    await expect(createServerClient(config).refreshToken('current-refresh')).resolves.toEqual({
      accessToken: 'next-access',
      refreshToken: 'next-refresh',
      error: null,
    });
    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.test.com/auth/refresh', {
      method: 'POST',
      headers: {
        'X-Anon-Key': config.anonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: 'current-refresh' }),
    });
  });

  test.each([
    ['server message', Response.json({ error: 'expired' }, { status: 401 }), 'expired'],
    ['fallback message', Response.json({}, { status: 429 }), 'Refresh failed: 429'],
    ['non-object body', Response.json(null, { status: 401 }), 'Refresh failed: 401'],
    ['malformed body', new Response('not json', { status: 502 }), 'Refresh failed: 502'],
  ])('refreshToken reports %s on HTTP errors', async (_case, response, message) => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(response);

    await expect(createServerClient(config).refreshToken('current-refresh')).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
      error: new Error(message),
    });
  });

  test('refreshToken reports malformed successful responses', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(new Response('not json'));

    const result = await createServerClient(config).refreshToken('current-refresh');

    expect(result.accessToken).toBeNull();
    expect(result.refreshToken).toBeNull();
    expect(result.error).toMatchObject({ name: 'SyntaxError' });
  });

  test.each([
    ['non-object body', null],
    ['missing access token', { refresh_token: 'next-refresh' }],
    ['missing refresh token', { access_token: 'next-access' }],
  ])('refreshToken rejects %s in a successful response', async (_case, payload) => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json(payload));

    await expect(createServerClient(config).refreshToken('current-refresh')).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
      error: new TypeError('Invalid refresh response'),
    });
  });

  test('refreshToken reports transport failures', async () => {
    const failure = new Error('offline');
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(failure);

    await expect(createServerClient(config).refreshToken('current-refresh')).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
      error: failure,
    });
  });

  test('defaults to the production API URL when no override is supplied', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: null }));

    await createServerClient({ anonKey: config.anonKey }).getUser('access-token');

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.volcano.dev/auth/user',
      expect.any(Object),
    );
  });

  test('withAuth returns null without a request when no token is present', async () => {
    const request = new Request('https://app.test.com/dashboard');

    await expect(withAuth(request, createServerClient(config))).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('withAuth uses the Authorization header and returns the user', async () => {
    const expectedUser = user('user-456');
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: expectedUser }));

    const request = new Request('https://app.test.com/dashboard', {
      headers: { authorization: 'Bearer test-token' },
    });
    const result = await withAuth(request, createServerClient(config));

    expect(result).toEqual(expectedUser);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.test.com/auth/user',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
  });

  test('withAuth logs auth failures and returns null', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    try {
      jest
        .mocked(globalThis.fetch)
        .mockResolvedValueOnce(Response.json({ error: 'denied' }, { status: 401 }));
      const request = new Request('https://app.test.com/dashboard', {
        headers: { authorization: 'Bearer expired-token' },
      });

      await expect(withAuth(request, createServerClient(config))).resolves.toBeNull();
      expect(warning).toHaveBeenCalledWith('Auth validation failed:', 'denied');
    } finally {
      warning.mockRestore();
    }
  });
});
