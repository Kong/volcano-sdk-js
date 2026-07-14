import { type Client, createClient } from '../generated/api/client';
import type { Auth } from '../generated/api/core/auth.gen';

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
      input instanceof Request && init === undefined ? input.clone() : new Request(input, init);
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
      const response = await fetchImplementation(
        new Request(request, { signal: controller.signal }),
      );
      return normalizeResponse(response as ResponseLike);
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
