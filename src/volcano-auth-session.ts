import { fetchWithAuthRetry } from './auth-fetch-retry.ts';
import { anonFetch, authFetchUrl, authFetchWithContext } from './auth-http.ts';
import {
  completeOAuthExchange,
  consumeOAuthCodeFromUrl,
  consumeSessionFromUrl,
  replaceSessionFromUrl,
} from './auth-redirect.ts';
import {
  type AuthContext,
  fetchSessionRefresh,
  performSessionRefresh,
  refreshSession,
  refreshSessionForContext,
  revokeAccessSession,
  signOut,
  signOutCaptured,
} from './auth-session-lifecycle.ts';
import { fetchWithTimeout } from './fetch-lifecycle.ts';
import { VolcanoAuthState } from './volcano-auth-state.ts';

export class VolcanoAuthSession extends VolcanoAuthState {
  /** @internal */
  async _authFetch(
    path: string | (() => string),
    options: RequestInit | (() => RequestInit) = {},
  ): Promise<Awaited<ReturnType<typeof authFetchWithContext>>['result']> {
    const { result } = await this._authFetchWithContext(path, options);
    return result;
  }

  /** @internal */
  async _authFetchWithContext(
    path: string | (() => string),
    options: RequestInit | (() => RequestInit) = {},
  ): ReturnType<typeof authFetchWithContext> {
    return await authFetchWithContext(this, path, options);
  }

  /** @internal */
  async _authFetchUrl(url: string, fetchOptions: RequestInit = {}): ReturnType<typeof authFetchUrl> {
    return await authFetchUrl(this, url, fetchOptions);
  }

  /** @internal */
  async _generatedFetch(
    path: string,
    options: RequestInit,
    authorization: 'anon' | 'session',
    timeoutMs = this.timeout,
  ): Promise<Response> {
    const url = `${this.apiUrl}${path}`;
    if (authorization === 'anon') {
      const headers = new Headers(options.headers);
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${this.anonKey}`);
      }
      return await fetchWithTimeout(
        url,
        {
          ...options,
          headers,
        },
        timeoutMs,
      );
    }

    return await fetchWithAuthRetry(this, url, options, timeoutMs);
  }

  /** @internal */
  async _anonFetch(path: string, options: RequestInit = {}): ReturnType<typeof anonFetch> {
    return await anonFetch(this, path, options);
  }

  /** @internal */
  async signOut(): ReturnType<typeof signOut> {
    return await signOut(this);
  }

  /** @internal */
  async _signOutCaptured(
    context: Parameters<typeof signOutCaptured>[1],
    refreshing: Parameters<typeof signOutCaptured>[2],
  ): ReturnType<typeof signOutCaptured> {
    return await signOutCaptured(this, context, refreshing);
  }

  /** @internal */
  async _revokeAccessSession(
    context: Parameters<typeof revokeAccessSession>[1],
    sessionId: string,
    preceding: Parameters<typeof revokeAccessSession>[3],
  ): ReturnType<typeof revokeAccessSession> {
    return await revokeAccessSession(this, context, sessionId, preceding);
  }

  /** @internal */
  async refreshSession(): ReturnType<typeof refreshSession> {
    return await refreshSession(this);
  }

  /** @internal */
  async _refreshSessionForContext(context: AuthContext): ReturnType<typeof refreshSessionForContext> {
    return await refreshSessionForContext(this, context);
  }

  /** @internal */
  async _fetchSessionRefresh(context: AuthContext): ReturnType<typeof fetchSessionRefresh> {
    return await fetchSessionRefresh(this, context);
  }

  /** @internal */
  async _performSessionRefresh(context: AuthContext): ReturnType<typeof performSessionRefresh> {
    return await performSessionRefresh(this, context);
  }

  /** @internal */
  _consumeOAuthCodeFromUrl(): ReturnType<typeof consumeOAuthCodeFromUrl> {
    return consumeOAuthCodeFromUrl(this);
  }

  /** @internal */
  _completeOAuthExchange(): ReturnType<typeof completeOAuthExchange> {
    return completeOAuthExchange(this);
  }

  /**
   * Adopt a session handed off by the managed hosted auth pages. After a
   * successful managed login/signup the user is redirected to the configured
   * URL with the tokens in the URL fragment:
   *   https://app/callback#access_token=...&refresh_token=...&token_type=bearer&expires_in=...
   * When present, the tokens are stored like any other session and removed from
   * the URL. Returns true if a session was adopted. Browser-only and idempotent.
   */
  /** @internal */
  _consumeSessionFromUrl(): ReturnType<typeof consumeSessionFromUrl> {
    return consumeSessionFromUrl(this);
  }

  /** @internal */
  _replaceSessionFromUrl(accessToken: string, refreshToken: string | null): void {
    replaceSessionFromUrl(this, accessToken, refreshToken);
  }
}
