/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.ts';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, 'window');
  } else {
    Object.defineProperty(globalThis, 'window', originalWindow);
  }
  jest.restoreAllMocks();
});

function jsonResponse(body: unknown): Response {
  return Response.json(body);
}

test('OAuth callback accepts cookie-backed token responses without a refresh token', async () => {
  const user = { id: 'cookie-user', email: 'cookie@example.com', status: 'active' } as const;
  const storage = (initial: Record<string, string>) => {
    const items = new Map(Object.entries(initial));
    return {
      getItem: (key: string): string | null => items.get(key) ?? null,
      setItem(key: string, value: string): void {
        items.set(key, value);
      },
      removeItem(key: string): void {
        items.delete(key);
      },
    };
  };
  const localStorage = storage({ volcano_refresh_token: 'stale-refresh' });
  const sessionStorage = storage({
    volcano_auth_state: 'oauth-nonce',
    volcano_auth_redirect_url: 'https://app.example.com/auth/callback',
  });
  const replaceState = jest.fn();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      document: {},
      location: {
        href: 'https://app.example.com/auth/callback?code=one-time&state=oauth-nonce',
        hash: '',
        pathname: '/auth/callback',
        search: '?code=one-time&state=oauth-nonce',
      },
      history: { state: null, replaceState },
      localStorage,
      sessionStorage,
    },
  });

  const fetchMock = jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(
      jsonResponse({
        access_token: 'cookie-session-access',
        token_type: 'bearer',
        expires_in: 3600,
        user,
      }),
    )
    .mockResolvedValueOnce(jsonResponse({ user }));

  const client = new VolcanoAuth({ apiUrl: 'https://api.example.com', anonKey: 'ak-test' });
  const initialized = await client.initialize();
  const current = await client.auth.getSession();

  expect(initialized.error).toBeNull();
  expect(initialized.user).toEqual(user);
  expect(current.data.session).toEqual({
    access_token: 'cookie-session-access',
    refresh_token: null,
    user,
  });
  expect(localStorage.getItem('volcano_refresh_token')).toBeNull();
  expect(localStorage.getItem('volcano_access_token')).toBe('cookie-session-access');
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(replaceState).toHaveBeenCalledWith(null, '', '/auth/callback');
});
