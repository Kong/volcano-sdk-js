import { type Client, createClient } from '../generated/api/client';
import type { Auth } from '../generated/api/core/auth.gen';

export {
  authCancelEmailChange,
  authConfirmEmail,
  authConfirmEmailChange,
  authConvertAnonymous,
  authDeleteAllMySessions,
  authDeleteMySession,
  authForgotPassword,
  authGetMySessions,
  authGetUser,
  authLinkOAuthProvider,
  authListOAuthProviders,
  authLogout,
  authRefresh,
  authRequestEmailChange,
  authResendConfirmation,
  authResetPassword,
  authSignin,
  authSignup,
  authSignupAnonymous,
  authUnlinkOAuthProvider,
  authUpdateUser,
  callOAuthProviderApi,
  copyStorageObject,
  getOAuthProviderToken,
  getProjectLogActivity,
  listStorageObjects,
  moveStorageObject,
  queryDatabaseDelete,
  queryDatabaseInsert,
  queryDatabaseSelect,
  queryDatabaseUpdate,
  refreshOAuthProviderToken,
  resolveFunctionForInvocation,
  searchProjectLogs,
} from '../generated/api/sdk.gen';

export interface ApiCredentials {
  accessToken?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  userToken?: string;
}

export type ApiClientConfig = ApiCredentials & {
  baseUrl?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
};

export type ApiClient = Client & {
  setCredentials(credentials: Partial<ApiCredentials>): void;
};

const DEFAULT_API_URL = 'https://api.volcano.dev';
const DEFAULT_TIMEOUT_MS = 60_000;

const credentialForScheme = (credentials: ApiCredentials, auth: Auth): string | undefined => {
  switch (auth.key) {
    case 'AnonKey': {
      return credentials.anonKey;
    }
    case 'AuthUserAccessToken': {
      return credentials.accessToken;
    }
    case 'ServiceRoleKey': {
      return credentials.serviceRoleKey;
    }
    case 'UserToken': {
      return credentials.userToken;
    }
    default: {
      return undefined;
    }
  }
};

const createTimeoutFetch = (fetchImplementation: typeof fetch, timeoutMs: number): typeof fetch => {
  return async (input, init) => {
    const request = input instanceof Request ? input.clone() : new Request(input, init);
    const controller = new AbortController();
    const abortFromRequest = () => controller.abort(request.signal.reason);

    if (request.signal.aborted) {
      abortFromRequest();
    } else {
      request.signal.addEventListener('abort', abortFromRequest, { once: true });
    }

    const timeout = setTimeout(() => {
      controller.abort(new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError'));
    }, timeoutMs);

    try {
      return await fetchImplementation(new Request(request, { signal: controller.signal }));
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abortFromRequest);
    }
  };
};

export const createApiClient = (config: ApiClientConfig = {}): ApiClient => {
  const {
    accessToken,
    anonKey,
    baseUrl = DEFAULT_API_URL,
    fetch: configuredFetch = globalThis.fetch,
    serviceRoleKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userToken,
  } = config;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive finite number');
  }

  const credentials: ApiCredentials = {
    accessToken,
    anonKey,
    serviceRoleKey,
    userToken,
  };

  const client = createClient({
    auth: (auth) => credentialForScheme(credentials, auth),
    baseUrl,
    fetch: createTimeoutFetch(configuredFetch, timeoutMs),
    responseStyle: 'fields',
    throwOnError: false,
  }) as ApiClient;

  client.setCredentials = (nextCredentials) => {
    Object.assign(credentials, nextCredentials);
  };

  return client;
};

export type {
  Client as GeneratedApiClient,
  Config as GeneratedApiClientConfig,
  RequestResult as GeneratedApiResult,
} from '../generated/api/client';
