export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function requiredString(value: unknown, field: string): string {
  if (!isRecord(value) || typeof value[field] !== 'string') {
    throw new Error(`Expected ${field} in integration response`);
  }
  return value[field];
}

export function integrationUrl(name: string, fallback: string): string {
  const configured = process.env[name];
  return configured === undefined || configured === '' ? fallback : configured;
}

function requestHeaders(options: RequestInit, token?: string): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token !== undefined && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

function errorText(value: unknown): string {
  if (!isRecord(value)) {
    return 'Unknown error';
  }
  const error = value['error'];
  return typeof error === 'string' && error !== '' ? error : 'Unknown error';
}

async function jsonResponse(response: Response, label: string): Promise<unknown> {
  if (!response.ok) {
    const error: unknown = await response.json().catch(() => ({}));
    throw new Error(`${label} API error: ${response.status.toString()} - ${errorText(error)}`);
  }
  if (response.status === 204) {
    return null;
  }
  const body: unknown = await response.json();
  return body;
}

export async function managementFetch(
  baseUrl: string,
  path: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: requestHeaders(options),
  });
  return jsonResponse(response, 'Management');
}

export async function platformFetch(
  baseUrl: string,
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: requestHeaders(options, token),
  });
  return jsonResponse(response, 'Platform');
}
