/** @jest-environment node */
import { describe, expect, jest, test } from '@jest/globals';
import {
  createServerClient,
  type ServerClientConfig,
  type User,
  withAuth,
} from '../src/next/middleware.js';

const config: ServerClientConfig = {
  apiUrl: 'https://api.test.com',
  anonKey: 'ak-test-anon-key',
};

function user(id: string): User {
  return {
    id,
    email: 'test@example.com',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

describe('Next.js middleware helpers', () => {
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
});
