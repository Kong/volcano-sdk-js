import type { VolcanoAuthConfig } from './sdk-public-types.ts';
import type { VolcanoAuthSession } from './volcano-auth-session.ts';

const STORAGE_KEY_ACCESS_TOKEN = 'volcano_access_token';
const STORAGE_KEY_REFRESH_TOKEN = 'volcano_refresh_token';

export function initializeCredentials(client: VolcanoAuthSession, config: VolcanoAuthConfig): void {
  if (typeof config.accessToken === 'string' && config.accessToken !== '') {
    client.accessToken = config.accessToken;
    client.refreshToken = config.refreshToken === '' ? null : (config.refreshToken ?? null);
    return;
  }
  client.accessToken = client._getStorageItem(STORAGE_KEY_ACCESS_TOKEN);
  client.refreshToken = client._getStorageItem(STORAGE_KEY_REFRESH_TOKEN);
  client._pendingUrlAuthNotify = client._consumeSessionFromUrl();
}

export function beginOAuthCallback(client: VolcanoAuthSession, config: VolcanoAuthConfig): void {
  if (typeof config.accessToken === 'string' && config.accessToken !== '') {
    return;
  }
  if (!client._hasOAuthCallbackInUrl()) {
    return;
  }
  client._oauthExchangePromise = client._consumeOAuthCodeFromUrl();
  // Completion owns errors and clears the pending promise even before another auth call.
  void client._completeOAuthExchange();
}

export function hasInitialSession(client: VolcanoAuthSession): boolean {
  return (
    hasStoredSession(client) ||
    client._hasSessionInUrl() ||
    client._oauthExchangePromise !== null ||
    client._oauthExchangeError !== null
  );
}

function hasStoredSession(client: VolcanoAuthSession): boolean {
  return (
    (client.accessToken !== null && client.accessToken !== '') ||
    (client.refreshToken !== null && client.refreshToken !== '')
  );
}
