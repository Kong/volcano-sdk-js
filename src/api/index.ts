import { assertBrowserSafeCredentials } from '../credential-safety';
import { type Client, createClient } from '../generated/api/client';
import type { Auth } from '../generated/api/core/auth.gen';
import { trackResponseLifecycle } from '../response-lifecycle';
import { normalizeBaseUrl } from '../url';
import { CLIENT_INFO } from '../version';

export * from '../generated/api';

export interface ApiCredentials {
  accessToken?: string;
  anonKey?: string;
  serviceRoleKey?: string;
  userToken?: string;
}

export type ApiClientConfig = ApiCredentials & {
  baseUrl?: string;
  fetch?: typeof fetch;
  headers?: HeadersInit;
  timeoutMs?: number;
};

export type ApiClient = Client & {
  setCredentials(credentials: Partial<ApiCredentials>): void;
};

const DEFAULT_API_URL = 'https://api.volcano.dev';
const DEFAULT_TIMEOUT_MS = 60_000;

type ResponseLike = Response & {
  json?: () => Promise<unknown>;
};

const normalizeResponse = (response: ResponseLike): Response => {
  if (typeof response.text === 'function' && typeof response.headers?.get === 'function') {
    return response;
  }

  const normalized = Object.create(response) as ResponseLike;
  const headers =
    response.headers && typeof response.headers.get === 'function'
      ? response.headers
      : new Headers(response.headers);
  if (typeof response.json === 'function' && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  Object.defineProperty(normalized, 'headers', {
    value: headers,
  });
  if (typeof response.text !== 'function' && typeof response.json === 'function') {
    Object.defineProperty(normalized, 'text', {
      value: async () => JSON.stringify(await response.json!()),
    });
  }
  return normalized;
};

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
    const request =
      input instanceof Request && init === undefined ? input : new Request(input, init);
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

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) {
        return;
      }
      cleanedUp = true;
      clearTimeout(timeout);
      request.signal.removeEventListener('abort', abortFromRequest);
    };

    try {
      const response = await fetchImplementation(
        new Request(request, { signal: controller.signal }),
      );
      return trackResponseLifecycle(normalizeResponse(response as ResponseLike), cleanup);
    } catch (error) {
      cleanup();
      throw error;
    }
  };
};

export const createApiClient = (config: ApiClientConfig = {}): ApiClient => {
  const {
    accessToken,
    anonKey,
    baseUrl: configuredBaseUrl = DEFAULT_API_URL,
    fetch: configuredFetch = globalThis.fetch,
    headers: configuredHeaders,
    serviceRoleKey,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    userToken,
  } = config;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('timeoutMs must be a positive finite number');
  }
  if (typeof configuredFetch !== 'function') {
    throw new TypeError('fetch must be provided when globalThis.fetch is unavailable');
  }
  assertBrowserSafeCredentials(accessToken, anonKey, serviceRoleKey, userToken);

  const baseUrl = normalizeBaseUrl(configuredBaseUrl);
  const headers = new Headers(configuredHeaders);
  if (!headers.has('X-Client-Info')) {
    headers.set('X-Client-Info', CLIENT_INFO);
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
    headers,
    responseStyle: 'fields',
    throwOnError: false,
  }) as ApiClient;

  client.interceptors.request.use((request, options) => {
    if (options.parseAs !== 'auto' || request.method !== 'GET') {
      return request;
    }
    const isPublicDownload = options.url === '/public/{projectId}/{bucketName}/{path}';
    const isStorageDownload =
      options.url === '/storage/{bucketName}/{path}' && !request.headers.has('X-Upload-Session');
    if (isPublicDownload || isStorageDownload) {
      options.parseAs = 'blob';
    }
    return request;
  });

  client.setCredentials = (nextCredentials) => {
    const prospectiveCredentials = { ...credentials, ...nextCredentials };
    assertBrowserSafeCredentials(
      prospectiveCredentials.accessToken,
      prospectiveCredentials.anonKey,
      prospectiveCredentials.serviceRoleKey,
      prospectiveCredentials.userToken,
    );
    Object.assign(credentials, nextCredentials);
  };

  return client;
};

export type {
  Client as GeneratedApiClient,
  Config as GeneratedApiClientConfig,
  RequestResult as GeneratedApiResult,
} from '../generated/api/client';
