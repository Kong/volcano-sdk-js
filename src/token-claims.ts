/** Decode with the available browser or Node implementation. */
export function decodeBase64Url(value: string): string {
  const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  const base64 = normalized + padding;
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
  if (typeof token !== 'string' || token === '') {
    return null;
  }
  const encoded = encodedPayload(token);
  if (encoded === null) {
    return null;
  }
  try {
    const payload: unknown = JSON.parse(decodeBase64Url(encoded));
    return normalizedSessionId(payload);
  } catch {
    return null;
  }
}

function encodedPayload(token: string): string | null {
  const [, payload, signature, ...extra] = token.split('.');
  if (payload === undefined || signature === undefined || extra.length > 0) {
    return null;
  }
  return payload;
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
