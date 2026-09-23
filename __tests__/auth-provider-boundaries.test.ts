import { expect, test } from '@jest/globals';
import {
  type AuthProviderHost,
  callOAuthAPI,
  getLinkedOAuthProviders,
  getOAuthProviderToken,
  linkOAuthProvider,
  refreshOAuthToken,
  unlinkOAuthProvider,
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

test('provider methods route to their distinct endpoints with exact method and body', async () => {
  const data = {
    providers: ['github'],
    message: 'ready',
    provider: 'github',
    expires_in: 120,
    data: { repository: 'volcano' },
  };
  const calls: { path: string; options: RequestInit | undefined }[] = [];
  const host: AuthProviderHost = {
    _isAuthContextCurrent: () => true,
    _authFetchWithContext(path, options) {
      calls.push({ path, options: typeof options === 'function' ? options() : options });
      return Promise.resolve({ result: { ok: true, status: 200, data, error: null }, context });
    },
  };

  expect(await linkOAuthProvider(host, 'github')).toEqual({ data, error: null });
  expect(await unlinkOAuthProvider(host, 'github')).toEqual({ error: null });
  expect(await getLinkedOAuthProviders(host)).toEqual({ providers: ['github'], error: null });
  expect(await refreshOAuthToken(host, 'github')).toEqual({
    message: 'ready',
    provider: 'github',
    expiresIn: 120,
    error: null,
  });
  expect(await getOAuthProviderToken(host, 'github')).toEqual({
    message: 'ready',
    provider: 'github',
    expiresIn: 120,
    error: null,
  });
  expect(
    await callOAuthAPI(host, 'github', {
      endpoint: '/repositories',
      method: 'POST',
      body: { owner: 'volcano' },
    }),
  ).toEqual({ data: { repository: 'volcano' }, error: null });
  expect(await callOAuthAPI(host, 'github', { endpoint: '/profile' })).toEqual({
    data: { repository: 'volcano' },
    error: null,
  });
  expect(calls).toEqual([
    { path: '/auth/oauth/github/link', options: { method: 'POST' } },
    { path: '/auth/oauth/github/unlink', options: { method: 'DELETE' } },
    { path: '/auth/oauth/providers', options: undefined },
    { path: '/auth/oauth/github/refresh-token', options: { method: 'POST' } },
    { path: '/auth/oauth/github/token', options: undefined },
    {
      path: '/auth/oauth/github/call-api',
      options: {
        method: 'POST',
        body: JSON.stringify({
          endpoint: '/repositories',
          method: 'POST',
          body: { owner: 'volcano' },
        }),
      },
    },
    {
      path: '/auth/oauth/github/call-api',
      options: {
        method: 'POST',
        body: JSON.stringify({ endpoint: '/profile', method: 'GET', body: null }),
      },
    },
  ]);
});
