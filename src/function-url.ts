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
