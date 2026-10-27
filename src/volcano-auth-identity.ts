import {
  cancelEmailChange as cancelAccountEmailChange,
  confirmEmail as confirmAccountEmail,
  confirmEmailChange as confirmAccountEmailChange,
  forgotPassword as forgotAccountPassword,
  requestEmailChange as requestAccountEmailChange,
  resendConfirmation as resendAccountConfirmation,
  resetPassword as resetAccountPassword,
  resetPasswordForEmail as resetAccountPasswordForEmail,
} from './auth-account.ts';
import {
  getHostedAuthUrl as createHostedAuthUrl,
  resolveOAuthRedirectTarget,
  resolveProjectIdForHostedAuth,
  signInWithHostedAuth as beginHostedAuth,
  signInWithOAuth as beginOAuth,
  signInWithProvider,
} from './auth-oauth-url.ts';
import {
  callOAuthAPI as callProviderAPI,
  getLinkedOAuthProviders as getAccountLinkedProviders,
  getOAuthProviderToken as getAccountProviderToken,
  linkOAuthProvider as linkAccountProvider,
  refreshOAuthToken as refreshAccountProviderToken,
  unlinkOAuthProvider as unlinkAccountProvider,
} from './auth-provider.ts';
import {
  deleteAllOtherSessions as deleteAccountOtherSessions,
  deleteSession as deleteAccountSession,
  getSessions as getAccountSessions,
} from './auth-user-sessions.ts';
import { VolcanoAuthSession } from './volcano-auth-session.ts';

export class VolcanoAuthIdentity extends VolcanoAuthSession {
  /** @internal */
  async confirmEmail(token: string): ReturnType<typeof confirmAccountEmail> {
    return confirmAccountEmail(this, token);
  }

  /** @internal */
  async resendConfirmation(email: string): ReturnType<typeof resendAccountConfirmation> {
    return resendAccountConfirmation(this, email);
  }

  /** @internal */
  async forgotPassword(email: string): ReturnType<typeof forgotAccountPassword> {
    return forgotAccountPassword(this, email);
  }

  /** @internal */
  async resetPasswordForEmail(email: string): ReturnType<typeof resetAccountPasswordForEmail> {
    return resetAccountPasswordForEmail(this, email);
  }

  /** @internal */
  async resetPassword(options: Parameters<typeof resetAccountPassword>[1]): ReturnType<typeof resetAccountPassword> {
    return resetAccountPassword(this, options);
  }

  /** @internal */
  async requestEmailChange(newEmail: string): ReturnType<typeof requestAccountEmailChange> {
    return requestAccountEmailChange(this, newEmail);
  }

  /** @internal */
  async confirmEmailChange(emailChangeToken: string): ReturnType<typeof confirmAccountEmailChange> {
    return confirmAccountEmailChange(this, emailChangeToken);
  }

  /** @internal */
  async cancelEmailChange(): ReturnType<typeof cancelAccountEmailChange> {
    return cancelAccountEmailChange(this);
  }

  /** @internal */
  signInWithOAuth(
    provider: Parameters<typeof beginOAuth>[1],
    options: Parameters<typeof beginOAuth>[2] = {},
  ): ReturnType<typeof beginOAuth> {
    return beginOAuth(this, provider, options);
  }

  /** @internal */
  _resolveOAuthRedirectTarget(redirectTo: string | undefined): ReturnType<typeof resolveOAuthRedirectTarget> {
    return resolveOAuthRedirectTarget(redirectTo);
  }

  /** @internal */
  getHostedAuthUrl(options: Parameters<typeof createHostedAuthUrl>[1] = {}): ReturnType<typeof createHostedAuthUrl> {
    return createHostedAuthUrl(this, options);
  }

  /** @internal */
  signInWithHostedAuth(options: Parameters<typeof beginHostedAuth>[1] = {}): ReturnType<typeof beginHostedAuth> {
    return beginHostedAuth(this, options);
  }

  /** @internal */
  _resolveProjectIdForHostedAuth(
    explicitProjectId: string | undefined,
  ): ReturnType<typeof resolveProjectIdForHostedAuth> {
    return resolveProjectIdForHostedAuth(this, explicitProjectId);
  }

  /** @internal */
  signInWithGoogle(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'google');
  }
  /** @internal */
  signInWithGitHub(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'github');
  }
  /** @internal */
  signInWithMicrosoft(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'microsoft');
  }
  /** @internal */
  signInWithApple(): ReturnType<typeof signInWithProvider> {
    return signInWithProvider(this, 'apple');
  }

  /** @internal */
  async linkOAuthProvider(provider: string): ReturnType<typeof linkAccountProvider> {
    return linkAccountProvider(this, provider);
  }

  /** @internal */
  async unlinkOAuthProvider(provider: string): ReturnType<typeof unlinkAccountProvider> {
    return unlinkAccountProvider(this, provider);
  }

  /** @internal */
  async getLinkedOAuthProviders(): ReturnType<typeof getAccountLinkedProviders> {
    return getAccountLinkedProviders(this);
  }

  /** @internal */
  async refreshOAuthToken(provider: string): ReturnType<typeof refreshAccountProviderToken> {
    return refreshAccountProviderToken(this, provider);
  }

  /** @internal */
  async getOAuthProviderToken(provider: string): ReturnType<typeof getAccountProviderToken> {
    return getAccountProviderToken(this, provider);
  }

  /** @internal */
  async callOAuthAPI(
    provider: string,
    params: Parameters<typeof callProviderAPI>[2],
  ): ReturnType<typeof callProviderAPI> {
    return callProviderAPI(this, provider, params);
  }

  /** @internal */
  async getSessions(options: Parameters<typeof getAccountSessions>[1] = {}): ReturnType<typeof getAccountSessions> {
    return getAccountSessions(this, options);
  }

  /** @internal */
  async deleteSession(sessionId: string): ReturnType<typeof deleteAccountSession> {
    return deleteAccountSession(this, sessionId);
  }

  /** @internal */
  async deleteAllOtherSessions(): ReturnType<typeof deleteAccountOtherSessions> {
    return deleteAccountOtherSessions(this);
  }
}
