/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { createServerClient } from '../src/next/middleware.ts';
import { config, user } from './support/next-middleware-fixtures.ts';

function refusesMissingAccessTokens(): void {
  test('getUser refuses a missing token without making a request', async () => {
    await expect(createServerClient(config).getUser('')).resolves.toMatchObject({
      user: null,
      error: new Error('No access token provided'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each([null, undefined, 0, 42])('getUser rejects an untyped %p token', async (token) => {
    const client = createServerClient(config);
    const result: unknown = Reflect.apply(client.getUser.bind(client), undefined, [token]);

    await expect(result).resolves.toEqual({
      user: null,
      error: new Error('No access token provided'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
}

function returnsValidatedUsers(): void {
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

  test.each(['banned', 'deleted'])('getUser accepts the %s status', async (status) => {
    const expectedUser = { ...user('user-123'), status };
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: expectedUser }));

    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: expectedUser,
      error: null,
    });
  });
}

function rejectsUnusableUserResponses(): void {
  test.each([
    ['server message', Response.json({ error: 'denied' }, { status: 401 }), 'denied'],
    ['empty server message', Response.json({ error: '' }, { status: 401 }), 'Auth failed: 401'],
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
    ['non-object user', { user: null }],
    ['string user', { user: 'invalid' }],
    ['missing id', { user: { email: 'test@example.com', status: 'active' } }],
    ['missing email', { user: { id: 'user-123', status: 'active' } }],
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
}

function reportsUserTransportFailures(): void {
  test('getUser reports transport failures', async () => {
    const failure = new Error('offline');
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(failure);

    const result = await createServerClient(config).getUser('access-token');
    expect(result).toEqual({
      user: null,
      error: failure,
    });
    expect(result.error).toBe(failure);
  });

  test.each([
    ['record without a name', { message: 'offline' }],
    ['record without a string message', { message: 42 }],
    ['string', 'offline'],
  ])('getUser normalizes a rejected %s to an Error', async (_case, failure) => {
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(failure);

    const message = typeof failure === 'object' && typeof failure.message !== 'string' ? '[object Object]' : 'offline';
    await expect(createServerClient(config).getUser('access-token')).resolves.toEqual({
      user: null,
      error: new Error(message),
    });
  });

  test.each([
    ['NetworkError', 'NetworkError'],
    [42, 'Error'],
  ])('getUser preserves a rejected record name %p when valid', async (name, expectedName) => {
    jest.mocked(globalThis.fetch).mockRejectedValueOnce({ message: 'offline', name });

    const result = await createServerClient(config).getUser('access-token');
    expect(result.error?.message).toBe('offline');
    expect(result.error?.name).toBe(expectedName);
  });
}

function defaultsToTheProductionApiUrl(): void {
  test('defaults to the production API URL when no override is supplied', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: null }));

    await createServerClient({ anonKey: config.anonKey }).getUser('access-token');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.volcano.dev/auth/user', expect.any(Object));
  });

  test('defaults to the production API URL when the override is empty', async () => {
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: null }));

    await createServerClient({ anonKey: config.anonKey, apiUrl: '' }).getUser('access-token');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://api.volcano.dev/auth/user', expect.any(Object));
  });
}

describe('Next.js middleware helpers', () => {
  refusesMissingAccessTokens();
  returnsValidatedUsers();
  rejectsUnusableUserResponses();
  reportsUserTransportFailures();
  defaultsToTheProductionApiUrl();
});
