import { decodeBase64Url } from './token-claims.ts';

type RecoveryIdentity =
  | { kind: 'user'; projectId: string; subject: string }
  | { kind: 'credential'; token: unknown };

function decodeTokenPayload(token: unknown): { payload: unknown } | null {
  if (typeof token !== 'string') {
    return null;
  }
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

function hasThreeSegments(parts: string[]): parts is [string, string, string] {
  return parts.length === 3;
}

function claim(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  return Reflect.get(payload, name);
}

function claimsFromToken(token: unknown): unknown {
  const decoded = decodeTokenPayload(token);
  return decoded === null ? null : decoded.payload;
}

// These claims scope local state; the server authenticates credentials.
export function recoveryIdentity(token: unknown): RecoveryIdentity {
  const payload = claimsFromToken(token);
  const projectId = claim(payload, 'project_id');
  const subject = claim(payload, 'sub');
  if (
    typeof projectId === 'string' &&
    projectId !== '' &&
    typeof subject === 'string' &&
    subject !== ''
  ) {
    return { kind: 'user', projectId, subject };
  }
  return { kind: 'credential', token };
}

export function sameRecoveryIdentity(left: RecoveryIdentity, right: RecoveryIdentity): boolean {
  if (left.kind === 'user') {
    return (
      right.kind === 'user' && left.projectId === right.projectId && left.subject === right.subject
    );
  }
  return right.kind === 'credential' && left.token === right.token;
}
