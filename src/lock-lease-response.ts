import type { ProjectLockLease } from './index.js';

const INVALID_LEASE_RESPONSE = 'Expected a complete lock response';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function validExpiry(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|\+00:00)$/.test(
      value,
    )
  ) {
    return false;
  }
  const parsed = Date.parse(value);
  return (
    Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value.slice(0, 10)
  );
}

function validFencingToken(value: unknown): value is number | null | undefined {
  if (value === null || value === undefined) {
    return true;
  }
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function validLeasePayload(
  value: unknown,
): value is { expires_at: string; fencing_token?: number | null } {
  return (
    isRecord(value) && validExpiry(value['expires_at']) && validFencingToken(value['fencing_token'])
  );
}

function matchesCurrentFencingToken(
  current: number | null,
  next: number | null | undefined,
): boolean {
  if (next === null || next === undefined) {
    return current !== null;
  }
  return current === null || next === current;
}

export function applyLockLeaseResponse(lease: ProjectLockLease, payload: unknown): void {
  if (!validLeasePayload(payload)) {
    throw new TypeError(INVALID_LEASE_RESPONSE);
  }
  const fencingToken = payload.fencing_token;
  if (!matchesCurrentFencingToken(lease.fencingToken, fencingToken)) {
    throw new TypeError(INVALID_LEASE_RESPONSE);
  }
  lease.expiresAt = payload.expires_at;
  if (fencingToken !== null && fencingToken !== undefined) {
    lease.fencingToken = fencingToken;
  }
}
