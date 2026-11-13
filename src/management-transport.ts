import { fetchWithTimeout } from './fetch-lifecycle.ts';
import type { GitRequestOptions, ManagementClientOptions } from './management-types.ts';
import type { VolcanoRequestInit } from './volcano-fetch.ts';

const invalidBaseCharacters = new Set(['?', '#', String.fromCodePoint(127)]);

function invalidBaseSpelling(value: string): boolean {
  for (const character of value) {
    if (character <= ' ' || invalidBaseCharacters.has(character)) {
      return true;
    }
  }
  return false;
}

function timeoutValue(value = 60000): number {
  if (!Number.isInteger(value) || value < 1 || value > 2147483647) {
    throw new Error('timeoutMs must be an integer from 1 to 2147483647');
  }
  return value;
}

function apiBase(value = 'https://api.volcano.dev'): URL {
  if (typeof value !== 'string' || invalidBaseSpelling(value)) {
    throw new Error('apiUrl must not contain whitespace, controls, a query or a fragment');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('apiUrl must be an absolute HTTP or HTTPS URL');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username !== '' ||
    url.password !== '' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new Error('apiUrl requires HTTP or HTTPS without credentials, query or fragment');
  }
  url.pathname = url.pathname.replace(/\/+$/u, '');
  return url;
}

export class ManagementTransport {
  readonly #token: string;
  readonly #base: URL;
  readonly #timeout: number;

  constructor(options: ManagementClientOptions) {
    if (typeof options.token !== 'string' || !/^[\u0021-\u007E]+$/u.test(options.token)) {
      throw new Error('An explicit nonempty management token is required');
    }
    this.#token = options.token;
    this.#base = apiBase(options.apiUrl);
    this.#timeout = timeoutValue(options.timeoutMs);
  }

  options(options: GitRequestOptions): VolcanoRequestInit {
    return {
      volcanoClient: this,
      volcanoAuthorization: 'session',
      volcanoTimeoutMs: timeoutValue(options.timeoutMs ?? this.#timeout),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    };
  }

  async _generatedFetch(
    path: string,
    options: RequestInit,
    authorization: 'anon' | 'session',
    timeoutMs?: number,
  ): Promise<Response> {
    if (authorization !== 'session' || !path.startsWith('/git/')) {
      throw new Error('Invalid management request');
    }
    options.signal?.throwIfAborted();
    const prefix = this.#base.pathname.replace(/\/+$/u, '');
    const url = new URL(`${prefix}${path}`, this.#base.origin);
    if (url.origin !== this.#base.origin || !url.pathname.startsWith(`${prefix}/git/`) || url.hash !== '') {
      throw new Error('Invalid management request URL');
    }
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${this.#token}`);
    return fetchWithTimeout(
      url.toString(),
      {
        ...options,
        headers,
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-store',
      },
      timeoutValue(timeoutMs ?? this.#timeout),
      async (response, signal) => {
        const bytes = await response.arrayBuffer();
        signal.throwIfAborted();
        return new Response([204, 205, 304].includes(response.status) ? null : bytes, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      },
    );
  }

  safeError(value: unknown): Error {
    const redact = (text: string): string => text.replaceAll(this.#token, '[redacted]');
    const error = new Error(redact(value instanceof Error ? value.message : 'Management request failed'));
    if (typeof value === 'object' && value !== null) {
      if (
        'status' in value &&
        typeof value.status === 'number' &&
        Number.isInteger(value.status) &&
        value.status >= 100 &&
        value.status <= 599
      ) {
        Object.assign(error, { status: value.status });
      }
      if ('code' in value && typeof value.code === 'string') {
        Object.assign(error, { code: redact(value.code) });
      }
      if ('retryAfter' in value && typeof value.retryAfter === 'number' && Number.isFinite(value.retryAfter)) {
        Object.assign(error, { retryAfter: value.retryAfter });
      }
    }
    return error;
  }
}
