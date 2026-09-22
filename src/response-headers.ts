interface HeaderMethods {
  get?: (name: string) => string | null;
  forEach?: (callback: (value: string, key: string) => void) => void;
  entries?: () => Iterable<readonly [string, string]>;
}

interface HeaderResponse {
  headers?: HeaderMethods | Readonly<Record<string, string>> | null;
}

export function responseHeadersToObject(
  response: HeaderResponse | null | undefined,
): Record<string, string> {
  const result: Record<string, string> = {};
  const headers = response?.headers;
  if (headers == null) {
    return result;
  }
  if (typeof headers.forEach === 'function') {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
  if (typeof headers.entries === 'function') {
    copyHeaderEntries(headers.entries(), result);
  }
  return result;
}

function copyHeaderEntries(
  entries: Iterable<readonly [string, string]>,
  target: Record<string, string>,
): void {
  for (const [key, value] of entries) {
    target[key] = value;
  }
}

export function getHeaderValue(
  response: HeaderResponse | null | undefined,
  headerName: string,
): unknown {
  const headers = response?.headers;
  if (headers == null) {
    return null;
  }
  if (typeof headers.get === 'function') {
    return headers.get(headerName);
  }
  return findHeaderValue(headers, headerName);
}

function findHeaderValue(headers: object, headerName: string): unknown {
  const lowerName = headerName.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lowerName) {
      const value: unknown = Reflect.get(headers, key);
      return value;
    }
  }
  return null;
}
