import { getHeaderValue, type HeaderResponse } from './response-headers.ts';
import { retryAfterSeconds } from './volcano-fetch.ts';

type RequestError = Error & {
  status: number;
  code?: string;
  retryAfter?: number;
};

export function errorResult(
  message: string | Error,
  extra: { count?: number } = {},
): { data: null; error: Error; count?: number } {
  const error = message instanceof Error ? message : new Error(message);
  return { data: null, error, ...extra };
}

export function apiRequestError(
  response: HeaderResponse & { status: number },
  data: unknown,
  message = errorMessage(data),
): RequestError {
  const error: RequestError = Object.assign(new Error(message), { status: response.status });
  const code = stringField(data, 'code');
  if (code !== undefined) {
    error.code = code;
  }
  const retrySeconds = retryAfterSeconds(getHeaderValue(response, 'retry-after'));
  if (retrySeconds !== undefined) {
    error.retryAfter = retrySeconds;
  }
  return error;
}

function errorMessage(data: unknown): string {
  return stringField(data, 'error') ?? 'Request failed';
}

function stringField(data: unknown, key: string): string | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const value = data[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
