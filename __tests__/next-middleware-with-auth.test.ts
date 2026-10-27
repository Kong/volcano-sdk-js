/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { createServerClient, withAuth } from '../src/next/middleware.ts';
import { config, user } from './support/next-middleware-fixtures.ts';

function returnsNullWithoutABearerToken(): void {
  test('withAuth returns null without a request when no token is present', async () => {
    const request = new Request('https://app.test.com/dashboard');
    const client = {
      getUser: () => Promise.reject(new Error('Unexpected validation request')),
      refreshToken: () => Promise.reject(new Error('Unexpected refresh request')),
    };

    await expect(withAuth(request, client)).resolves.toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  test('withAuth does not ask the client to validate a blank bearer token', async () => {
    const request = new Request('https://app.test.com/dashboard');
    jest.spyOn(request.headers, 'get').mockReturnValue('Bearer ');
    const client = {
      getUser: () => Promise.reject(new Error('Unexpected validation request')),
      refreshToken: () => Promise.reject(new Error('Unexpected refresh request')),
    };

    await expect(withAuth(request, client)).resolves.toBeNull();
  });
}

function validatesTheBearerToken(): void {
  test('withAuth accepts a user without optional timestamps', async () => {
    const expectedUser = { id: 'user-123', email: 'test@example.com', status: 'active' };
    jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ user: expectedUser }));
    const request = new Request('https://app.test.com/dashboard', {
      headers: { authorization: 'Bearer access-token' },
    });

    await expect(withAuth(request, createServerClient(config))).resolves.toEqual(expectedUser);
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
    const warning = jest.spyOn(console, 'warn').mockImplementation(jest.fn<typeof console.warn>());
    try {
      jest.mocked(globalThis.fetch).mockResolvedValueOnce(Response.json({ error: 'denied' }, { status: 401 }));
      const request = new Request('https://app.test.com/dashboard', {
        headers: { authorization: 'Bearer expired-token' },
      });

      await expect(withAuth(request, createServerClient(config))).resolves.toBeNull();
      expect(warning).toHaveBeenCalledWith('Auth validation failed:', 'denied');
    } finally {
      warning.mockRestore();
    }
  });
}

describe('Next.js middleware helpers', () => {
  returnsNullWithoutABearerToken();
  validatesTheBearerToken();
});
