import { jest } from '@jest/globals';

const fetchMock = jest.mocked(globalThis.fetch);

interface ResponseFixture {
  ok?: boolean;
  status?: number;
  json?: () => Promise<unknown>;
  blob?: () => Promise<Blob>;
  headers?: Pick<Headers, 'get'>;
}

function responseStatus(input: ResponseFixture): number {
  return input.status ?? (input.ok === false ? 400 : 200);
}

function responseHeaders(input: ResponseFixture): Headers {
  const headers = new Headers();
  if (input.json !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  return headers;
}

export function responseFixture(input: ResponseFixture): Response {
  const response = new Response(null, {
    status: responseStatus(input),
    headers: responseHeaders(input),
  });
  if (input.json !== undefined) {
    jest.spyOn(response, 'json').mockImplementation(input.json);
  }
  if (input.blob !== undefined) {
    jest.spyOn(response, 'blob').mockImplementation(input.blob);
  }
  if (input.headers !== undefined) {
    jest.spyOn(response.headers, 'get').mockImplementation(input.headers.get);
  }
  return response;
}

function requestAt(index: number): RequestInit {
  const call = fetchMock.mock.calls[index];
  if (call?.[1] === undefined) {
    throw new TypeError(`Expected fetch call ${String(index)}`);
  }
  return call[1];
}

export function formAt(index: number): FormData {
  const body = requestAt(index).body;
  if (!(body instanceof FormData)) {
    throw new TypeError(`Expected FormData in fetch call ${String(index)}`);
  }
  return body;
}

export function textBodyAt(index: number): string {
  const body = requestAt(index).body;
  if (typeof body !== 'string') {
    throw new TypeError(`Expected text body in fetch call ${String(index)}`);
  }
  return body;
}

export function headerAt(index: number, name: string): string | null {
  return new Headers(requestAt(index).headers).get(name);
}
