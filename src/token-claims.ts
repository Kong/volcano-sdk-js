/** Decode with the available browser or Node implementation. */
export function decodeBase64Url(value: string): string {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
  if (typeof atob === 'function') {
    return atob(base64);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  throw new Error('No base64 decoder available');
}

export function extractRequiredProjectIdFromToken(
  token: unknown,
  tokenName = 'accessToken',
): string {
  if (typeof token !== 'string' || token === '') {
    throw new Error('No active session');
  }
  const encoded = encodedPayload(token);
  if (encoded === null) {
    throw new Error(`${tokenName} must be a JWT with project_id claim`);
  }
  const payload = projectPayload(encoded, tokenName);
  return requiredProjectId(payload, tokenName);
}

// Session claims constrain refresh continuity; they do not authenticate identity.
export function extractSessionIdFromToken(token: unknown): string | null {
  if (typeof token !== 'string') {
    return null;
  }
  const parsed = parseSessionPayload(token);
  return parsed === null ? null : normalizedSessionId(parsed.payload);
}

function parseSessionPayload(token: string): { payload: unknown } | null {
  const parts = token.split('.');
  if (!hasThreeSegments(parts)) {
    return null;
  }
  try {
    return { payload: JSON.parse(decodeBase64Url(parts[1])) };
  } catch {
    return null;
  }
}

function encodedPayload(token: string): string | null {
  const parts = token.split('.');
  return hasThreeSegments(parts) ? parts[1] : null;
}

function hasThreeSegments(parts: string[]): parts is [string, string, string] {
  return parts.length === 3;
}

function projectPayload(encoded: string, tokenName: string): unknown {
  try {
    return JSON.parse(decodeBase64Url(encoded));
  } catch {
    throw new Error(`${tokenName} must be a valid JWT with project_id claim`);
  }
}

function claim(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  return Reflect.get(payload, name);
}

function requiredProjectId(payload: unknown, tokenName: string): string {
  const projectId = claim(payload, 'project_id');
  if (typeof projectId !== 'string' || projectId.trim() === '') {
    throw new Error(`${tokenName} missing project_id claim`);
  }
  return projectId.trim();
}

function normalizedSessionId(payload: unknown): string | null {
  const sessionId = claim(payload, 'session_id');
  return typeof sessionId === 'string' &&
    /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(sessionId)
    ? sessionId.toLowerCase()
    : null;
}
