import { jest } from '@jest/globals';

function uninitializedResolver(): never {
  throw new Error('Promise executor did not initialize');
}

export function reply(status: number, data: unknown = {}, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  if (status !== 204) {
    responseHeaders.set('Content-Type', 'application/json');
  }
  return new Response(status === 204 ? null : JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = uninitializedResolver;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export function signal(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = uninitializedResolver;
  const promise = new Promise<void>((settle) => {
    resolve = () => {
      settle();
    };
  });
  return { promise, resolve };
}

export function fetchCall(index: number): Parameters<typeof fetch> {
  const call = jest.mocked(globalThis.fetch).mock.calls[index];
  if (call === undefined) {
    throw new Error(`Missing fetch call ${String(index)}`);
  }
  return call;
}

export function fetchPath(input: RequestInfo | URL): string {
  return new URL(fetchUrl(input)).pathname;
}

export function fetchUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

export function fetchBody(index: number): string {
  return bodyText(fetchCall(index)[1]);
}

export function bodyText(options: RequestInit | undefined): string {
  const body = options?.body;
  if (typeof body !== 'string') {
    throw new TypeError('Fetch request has no string body');
  }
  return body;
}

export function jsonField(options: RequestInit | undefined, field: string): unknown {
  const parsed: unknown = JSON.parse(bodyText(options));
  if (typeof parsed !== 'object' || parsed === null || !(field in parsed)) {
    throw new Error(`Fetch request has no ${field} field`);
  }
  const value: unknown = Reflect.get(parsed, field);
  return value;
}

export async function resultError(result: Promise<{ error: unknown }>): Promise<unknown> {
  const response = await result;
  return response.error;
}
