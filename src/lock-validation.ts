const MAX_LOCK_TTL_SECONDS = 90 * 24 * 60 * 60;

export function validateLockOptions(key: unknown, options: unknown): number {
  validateLockKey(key);
  const ttl = property(options, 'ttl');
  if (!validTtl(ttl)) {
    throw new RangeError('ttl must be an integer between 5 seconds and 90 days');
  }
  return ttl;
}

function validTtl(ttl: unknown): ttl is number {
  return (
    typeof ttl === 'number' && Number.isInteger(ttl) && ttl >= 5 && ttl <= MAX_LOCK_TTL_SECONDS
  );
}

export function validateLockKey(key: unknown): void {
  if (typeof key !== 'string' || !/^[a-z0-9][\w.:-]{0,127}$/i.test(key)) {
    throw new TypeError('lock key must match ^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$');
  }
}

export function validateLease(key: unknown, lease: unknown): void {
  if (property(lease, 'key') !== key || !validToken(property(lease, 'token'))) {
    throw new TypeError('lease must belong to the requested lock and include its token');
  }
}

function validToken(token: unknown): boolean {
  return typeof token === 'string' && token !== '';
}

function property(value: unknown, name: string): unknown {
  if ((typeof value !== 'object' || value === null) && typeof value !== 'function') {
    return undefined;
  }
  return Reflect.get(value, name);
}
