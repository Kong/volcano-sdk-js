import { expect, test } from '@jest/globals';
import {
  type AuthProviderHost,
  getLinkedOAuthProviders,
  getOAuthProviderToken,
  linkOAuthProvider,
} from '../src/auth-provider.ts';
import { AuthSessionOperations } from '../src/auth-session.ts';
import type { AuthContext, RefreshResult, SignOutResult } from '../src/auth-session-lifecycle.ts';

const context: AuthContext = {
  generation: 1,
  operations: new AuthSessionOperations<RefreshResult, SignOutResult>(),
  userId: 'user-1',
  accessToken: 'access',
  refreshToken: 'refresh',
};

function hostWith(data: unknown): AuthProviderHost {
  return {
    _isAuthContextCurrent: () => true,
    _authFetchWithContext: () =>
      Promise.resolve({ result: { ok: true, status: 200, data, error: null }, context }),
  };
}

test.each([
  null,
  {},
  { authorization_url: 42 },
  Object.assign([], { authorization_url: 'url' }),
  Object.assign(() => 0, { authorization_url: 'url' }),
])('rejects malformed successful OAuth link response: %p', async (data) => {
  await expect(linkOAuthProvider(hostWith(data), 'google')).rejects.toThrow(
    'OAuth link response must include an authorization URL',
  );
});

test('treats a null OAuth providers field as an empty collection', async () => {
  await expect(getLinkedOAuthProviders(hostWith({ providers: null }))).resolves.toEqual({
    providers: [],
    error: null,
  });
});

test.each([
  { providers: 'google' },
  { providers: [null] },
  { providers: [{ provider: 12 }] },
  { providers: [{ provider: 'google', linked_at: 12 }] },
  { providers: [{ provider: 'google', updated_at: false }] },
])('rejects malformed linked providers: %p', async (data) => {
  await expect(getLinkedOAuthProviders(hostWith(data))).rejects.toThrow(
    'OAuth providers response must contain valid providers',
  );
});

test.each([
  [[{ provider: 'google' }]],
  [[{ provider: 'custom-provider', linked_at: '2026-09-23T00:00:00Z' }]],
])('preserves valid linked provider wire shapes: %p', async (providers) => {
  await expect(getLinkedOAuthProviders(hostWith({ providers }))).resolves.toEqual({
    providers,
    error: null,
  });
});

test.each([
  [{ provider: 'google', expires_in: 120 }, 'message'],
  [{ message: 'ready', provider: 12, expires_in: 120 }, 'provider'],
])('rejects non-string OAuth token %s fields', async (data, name) => {
  await expect(getOAuthProviderToken(hostWith(data), 'google')).rejects.toThrow(
    `OAuth token ${name} must be a string`,
  );
});

test.each([undefined, null, 3.5, '120'])(
  'rejects non-integer OAuth token expiry: %p',
  async (expiresIn) => {
    const data = { message: 'ready', provider: 'google', expires_in: expiresIn };
    await expect(getOAuthProviderToken(hostWith(data), 'google')).rejects.toThrow(
      'OAuth token expires_in must be an integer',
    );
  },
);
