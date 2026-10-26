/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { createServerClient } from '../src/next/middleware.ts';
import { config } from './support/next-middleware-fixtures.ts';

function refusesMissingRefreshTokens(): void {
  test('refreshToken refuses a missing token without making a request', async () => {
    await expect(createServerClient(config).refreshToken('')).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
      error: new Error('No refresh token provided'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test.each([null, undefined, 0, 42])('refreshToken rejects an untyped %p token', async (token) => {
    const client = createServerClient(config);
    const result: unknown = Reflect.apply(client.refreshToken.bind(client), undefined, [token]);

    await expect(result).resolves.toEqual({
      accessToken: null,
      refreshToken: null,
      error: new Error('No refresh token provided'),
    });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
}

function requestsReplacementTokens(): void {
  test('refreshToken sends the current refresh token and returns its replacement', async () => {
    jest
      .mocked(globalThis.fetch)
      .mockResolvedValueOnce(Response.json({ access_token: 'next-access', refresh_token: 'next-refresh' }));

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

  test('refreshToken reports transport failures', async () => {
    const failure = new Error('offline');
    jest.mocked(globalThis.fetch).mockRejectedValueOnce(failure);

    const result = await createServerClient(config).refreshToken('current-refresh');
    expect(result).toEqual({
      accessToken: null,
      refreshToken: null,
      error: failure,
    });
    expect(result.error).toBe(failure);
  });
}

function rejectsUnusableRefreshResponses(): void {
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
}

describe('Next.js middleware helpers', () => {
  refusesMissingRefreshTokens();
  requestsReplacementTokens();
  rejectsUnusableRefreshResponses();
});
