type GeneratedAuthorization = 'anon' | 'session';

interface GeneratedTransportClient {
  _generatedFetch(
    path: string,
    options: RequestInit,
    authorization: GeneratedAuthorization,
    timeoutMs?: number,
  ): Promise<Response>;
}

export interface VolcanoRequestInit extends RequestInit {
  volcanoAuthorization?: GeneratedAuthorization;
  volcanoClient?: GeneratedTransportClient;
  volcanoResponseType?: 'blob';
  volcanoTimeoutMs?: number;
}

async function readBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get('content-type')?.toLowerCase();
  if (isJsonContentType(contentType) || typeof response.blob !== 'function') {
    return response.json();
  }
  if (isTextContentType(contentType)) {
    return response.text();
  }
  return response.blob();
}

function isJsonContentType(contentType: string | undefined): boolean {
  return contentType?.includes('json') === true;
}

function isTextContentType(contentType: string | undefined): boolean {
  return contentType?.startsWith('text/') === true;
}

async function responseData(response: Response, responseType?: 'blob'): Promise<unknown> {
  if ([204, 205, 304].includes(response.status)) {
    return undefined;
  }

  if (response.ok && responseType === 'blob') {
    return response.blob();
  }

  return readBody(response);
}

function responseError(response: Response, data: unknown): Error {
  const message = errorMessage(response.status, data);
  const error = Object.assign(new Error(message), { info: data, status: response.status });
  if (hasErrorCode(data)) {
    Object.assign(error, { code: data.code });
  }
  const retryAfter = retryAfterSeconds(response.headers.get('retry-after'));
  if (retryAfter !== undefined) {
    Object.assign(error, { retryAfter });
  }
  return error;
}

function hasErrorCode(data: unknown): data is { code: unknown } {
  return typeof data === 'object' && data !== null && 'code' in data;
}

function errorMessage(status: number, data: unknown): string {
  if (typeof data === 'object' && data !== null && 'error' in data) {
    return String(data.error);
  }
  return `Request failed with status ${String(status)}`;
}

export async function volcanoFetch<T>(path: string, options: VolcanoRequestInit): Promise<T> {
  const { volcanoAuthorization, volcanoClient, volcanoResponseType, volcanoTimeoutMs, ...request } = options;
  if (volcanoClient === undefined || volcanoAuthorization === undefined) {
    throw new Error('Generated transport requires a Volcano client and authorization mode');
  }
  const response = await volcanoClient._generatedFetch(path, request, volcanoAuthorization, volcanoTimeoutMs);
  const data = await responseData(response, volcanoResponseType);

  if (!response.ok) {
    throw responseError(response, data);
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Orval's generated callers name the response type.
  return { data, status: response.status, headers: response.headers } as T;
}

/** Seconds from a Retry-After header value, or undefined when it has no leading integer. */
export function retryAfterSeconds(header: unknown): number | undefined {
  if (typeof header !== 'string') {
    return undefined;
  }
  // oxlint-disable-next-line unicorn/prefer-number-coercion -- Retry-After keeps parseInt's leading-integer parsing.
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) ? seconds : undefined;
}
