const FUNCTION_HOST_LABEL_REGEX = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function sanitizeFunctionIdentifierForHost(identifier: unknown): string | null {
  if (typeof identifier !== 'string') {
    return null;
  }

  const trimmed = identifier.trim();
  if (trimmed === '') {
    return null;
  }

  // DNS host labels are case-insensitive; preserve exact behavior by requiring lowercase.
  if (trimmed !== trimmed.toLowerCase()) {
    return null;
  }

  if (!FUNCTION_HOST_LABEL_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
}

export function functionInvokeUrl(
  apiUrl: string,
  identifier: unknown,
  resolvedUrl: unknown,
): string {
  const hostLabel = sanitizeFunctionIdentifierForHost(identifier);
  if (hostLabel === null) {
    throw new Error('functionId must be DNS-safe: lowercase letters, numbers, hyphens, 1-63 chars');
  }

  // Only resolve can name a function's invocation domain. Local deployments
  // without one use the API route.
  return (
    validInvokeUrl(resolvedUrl, apiUrl) ??
    `${apiUrl}/functions/${encodeURIComponent(hostLabel)}/invoke`
  );
}

// The URL carries the caller's bearer token. Plaintext is accepted only when
// the API itself is plaintext, so a resolve response cannot downgrade a
// credential that is otherwise protected in transit.
export function validInvokeUrl(value: unknown, apiUrl: string): string | null {
  const parsed = invocationUrl(value);
  if (parsed === null) {
    return null;
  }
  if (parsed.protocol === 'https:') {
    return parsed.href;
  }
  return parsed.protocol === 'http:' && isPlaintextUrl(apiUrl) ? parsed.href : null;
}

function invocationUrl(value: unknown): URL | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(value);
    return parsed.hostname === '' ? null : parsed;
  } catch {
    return null;
  }
}

function isPlaintextUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'http:';
  } catch {
    return false;
  }
}
