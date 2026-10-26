import { reply } from '../auth-concurrency-fixtures.ts';

export const NONCE = 'rp-nonce-abc123';

// Simulate signInWithHostedAuth()/signInWithOAuth() having stored the
// one-time nonce in sessionStorage before the redirect.
export function seedNonce(nonce = NONCE): void {
  window.sessionStorage.setItem('volcano_auth_state', nonce);
}

export function resetRedirectState(): void {
  window.history.replaceState(null, '', '/');
  window.sessionStorage.clear();
}

export function callbackRedirectURL(): string {
  return `${window.location.origin}/auth/callback`;
}

/** Stores the OAuth context a sign-in left behind and navigates to its callback URL. */
export function seedOAuthCallback(path: string, state = 'oauth-nonce', redirectUrl = callbackRedirectURL()): void {
  window.sessionStorage.setItem('volcano_auth_state', state);
  window.sessionStorage.setItem('volcano_auth_redirect_url', redirectUrl);
  window.history.replaceState(null, '', path);
}

function oauthUser(): { id: string; email: string; status: string } {
  return { id: 'oauth-user', email: 'oauth@example.com', status: 'active' };
}

export function oauthSessionReply(): Response {
  return reply(200, {
    access_token: 'oauth-access',
    refresh_token: 'oauth-refresh',
    user: oauthUser(),
    expires_in: 3600,
  });
}

export function oauthUserReply(): Response {
  return reply(200, { user: oauthUser() });
}
