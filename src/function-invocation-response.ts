import { apiRequestError } from './api-errors.ts';
import { VolcanoSystemError } from './errors.ts';
import { parseResponseBody } from './response-body.ts';
import {
  getHeaderValue,
  type HeaderResponse,
  responseHeadersToObject,
} from './response-headers.ts';

const FUNCTION_INVOKED_HEADER = 'x-volcano-function-invoked';

interface FunctionResponse extends HeaderResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

interface FunctionInvokeResult {
  data: unknown;
  status: number;
  headers: Record<string, string>;
  version: string | null;
  error: Error | null;
}

// This marker is set only after the platform invokes user code. A function's
// own 404 or 401 must not trigger a retry that repeats its side effects.
export function functionWasDispatched(response: HeaderResponse): boolean {
  return Boolean(getHeaderValue(response, FUNCTION_INVOKED_HEADER));
}

export async function functionInvokeResult(
  response: FunctionResponse,
  dispatched: boolean,
): Promise<FunctionInvokeResult> {
  const versionHeader = getHeaderValue(response, 'x-volcano-version');
  const data = await parseResponseBody(response);
  const headers = responseHeadersToObject(response);
  const version =
    typeof versionHeader === 'string' && versionHeader.length > 0 ? versionHeader : null;

  if (!response.ok && !dispatched) {
    const message = platformErrorMessage(data, response.status);
    return {
      data: null,
      status: response.status,
      headers,
      version,
      error: new VolcanoSystemError(message, apiRequestError(response, data, message)),
    };
  }

  return { data, status: response.status, headers, version, error: null };
}

function platformErrorMessage(data: unknown, status: number): string {
  if (typeof data === 'object' && data !== null && 'error' in data && Boolean(data.error)) {
    return String(data.error);
  }
  return `Invoke request failed with status ${String(status)}`;
}
