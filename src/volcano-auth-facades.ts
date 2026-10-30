import { DurableApprovalsFacade } from './durable-approvals-facade.ts';
import { DurableMessagesFacade } from './durable-messages-facade.ts';
import type { Auth, Durable, DurableApprovals, DurableMessages } from './sdk-public-types.ts';
import type { VolcanoAuth } from './volcano-auth.ts';

function durableApprovals(facade: DurableApprovalsFacade): DurableApprovals {
  return {
    list: facade.list.bind(facade),
    get: facade.get.bind(facade),
    stats: facade.stats.bind(facade),
    approve: facade.approve.bind(facade),
    deny: facade.deny.bind(facade),
  };
}

function durableMessages(facade: DurableMessagesFacade): DurableMessages {
  return {
    send: facade.send.bind(facade),
    list: facade.list.bind(facade),
    subscribe: facade.subscribe.bind(facade),
  };
}

export function durableApi(client: VolcanoAuth): Durable {
  const facade = client._durableFacade;
  return {
    start: client.startDurableExecution.bind(client),
    get: client.getDurableExecution.bind(client),
    getFromApplication: facade.getFromApplication.bind(facade),
    list: client.listDurableExecutions.bind(client),
    stop: client.stopDurableExecution.bind(client),
    stopFromApplication: facade.stopFromApplication.bind(facade),
    approvals: durableApprovals(new DurableApprovalsFacade(client)),
    messages: durableMessages(new DurableMessagesFacade(client)),
  };
}

// Auth declares the provider shortcuts void, but they have always returned the redirect URL.
function providerRedirect(start: () => string): () => void {
  // oxlint-disable-next-line typescript/strict-void-return -- JavaScript callers still receive the redirect URL.
  return start;
}

export function authApi(client: VolcanoAuth): Auth {
  return {
    // oxlint-disable-next-line typescript/no-deprecated -- Auth publishes this alias until the next major release.
    signUpAnonymous: client.signUpAnonymous.bind(client),
    // oxlint-disable-next-line typescript/no-deprecated -- Auth publishes this alias until the next major release.
    forgotPassword: client.forgotPassword.bind(client),
    signUp: client.signUp.bind(client),
    signIn: client.signIn.bind(client),
    getSession: client.getSession.bind(client),
    setSession: client.setSession.bind(client),
    signOut: client.signOut.bind(client),
    getUser: client.getUser.bind(client),
    updateUser: client.updateUser.bind(client),
    refreshSession: client.refreshSession.bind(client),
    onAuthStateChange: client.onAuthStateChange.bind(client),
    user: () => client.currentUser,
    // Anonymous user methods
    signInAnonymously: client.signInAnonymously.bind(client),
    convertAnonymous: client.convertAnonymous.bind(client),
    // Email confirmation methods
    confirmEmail: client.confirmEmail.bind(client),
    resendConfirmation: client.resendConfirmation.bind(client),
    // Password recovery methods
    resetPasswordForEmail: client.resetPasswordForEmail.bind(client),
    resetPassword: client.resetPassword.bind(client),
    // Email change methods
    requestEmailChange: client.requestEmailChange.bind(client),
    confirmEmailChange: client.confirmEmailChange.bind(client),
    cancelEmailChange: client.cancelEmailChange.bind(client),
    // Managed hosted auth pages
    getHostedAuthUrl: client.getHostedAuthUrl.bind(client),
    signInWithHostedAuth: client.signInWithHostedAuth.bind(client),
    // OAuth methods
    signInWithOAuth: client.signInWithOAuth.bind(client),
    signInWithGoogle: providerRedirect(client.signInWithGoogle.bind(client)),
    signInWithGitHub: providerRedirect(client.signInWithGitHub.bind(client)),
    signInWithMicrosoft: providerRedirect(client.signInWithMicrosoft.bind(client)),
    signInWithApple: providerRedirect(client.signInWithApple.bind(client)),
    linkOAuthProvider: client.linkOAuthProvider.bind(client),
    unlinkOAuthProvider: client.unlinkOAuthProvider.bind(client),
    getLinkedOAuthProviders: client.getLinkedOAuthProviders.bind(client),
    refreshOAuthToken: client.refreshOAuthToken.bind(client),
    getOAuthProviderToken: client.getOAuthProviderToken.bind(client),
    callOAuthAPI: client.callOAuthAPI.bind(client),
    // Session management methods
    getSessions: client.getSessions.bind(client),
    deleteSession: client.deleteSession.bind(client),
    deleteAllOtherSessions: client.deleteAllOtherSessions.bind(client),
  };
}
