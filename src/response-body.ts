import { getHeaderValue, type HeaderResponse } from './response-headers.ts';

interface BodyResponse extends HeaderResponse {
  text?: () => Promise<string>;
  json?: () => Promise<unknown>;
}

export async function parseResponseBody(
  response: BodyResponse | null | undefined,
): Promise<unknown> {
  if (response == null) {
    return null;
  }
  if (typeof response.text !== 'function') {
    return parseJsonResponse(response);
  }

  const bodyText = await response.text();
  if (bodyText === '') {
    return null;
  }
  return parseBodyText(bodyText, responseContentType(response));
}

async function parseJsonResponse(response: BodyResponse): Promise<unknown> {
  if (typeof response.json !== 'function') {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function responseContentType(response: HeaderResponse): string {
  const value = getHeaderValue(response, 'content-type');
  if (!Boolean(value)) {
    return '';
  }
  if (typeof value !== 'string') {
    throw new TypeError('Content-Type header must be a string');
  }
  return value.toLowerCase();
}

function parseBodyText(body: string, contentType: string): unknown {
  const shouldParseJson =
    contentType.includes('application/json') || body.startsWith('{') || body.startsWith('[');
  if (!shouldParseJson) {
    return body;
  }
  try {
    const value: unknown = JSON.parse(body);
    return value;
  } catch {
    return body;
  }
}
