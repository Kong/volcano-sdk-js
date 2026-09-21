import { decodeBase64Url } from './token-claims.ts';

type RecoveryIdentity =
  | { kind: 'user'; projectId: string; subject: string }
  | { kind: 'credential'; token: unknown };

function decodeTokenPayload(token: unknown): unknown {
  if (typeof token !== 'string') {
    return null;
  }
  const [, encoded, ...remaining] = token.split('.');
  if (encoded === undefined || remaining.length !== 1) {
    return null;
  }
  try {
    return JSON.parse(decodeBase64Url(encoded));
  } catch {
    return null;
  }
}

function claim(payload: unknown, name: string): unknown {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }
  return Reflect.get(payload, name);
}

// These claims scope local state; the server authenticates credentials.
export function recoveryIdentity(token: unknown): RecoveryIdentity {
  const payload = decodeTokenPayload(token);
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
