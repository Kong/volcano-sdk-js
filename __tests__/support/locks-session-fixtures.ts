import { jest } from '@jest/globals';
import type { ProjectLockLease, ProjectLocks } from '../../src/index.ts';
import { LockSession } from '../../src/lock-session.ts';

export const lease: ProjectLockLease = {
  key: 'job',
  token: 'owner',
  expiresAt: null,
  fencingToken: 1,
};

function uninitializedResolver(): never {
  throw new Error('Promise executor did not initialize');
}

export function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve: (value: T) => void = uninitializedResolver;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

export function setup(
  ttl = 6,
  elapsed = 0,
  random = (): number => 0.5,
): {
  session: LockSession;
  renew: ReturnType<typeof jest.fn<ProjectLocks['renew']>>;
  release: ReturnType<typeof jest.fn<ProjectLocks['release']>>;
} {
  let renewalAttempts = 0;
  const renew = jest.fn<ProjectLocks['renew']>().mockImplementation(() => {
    renewalAttempts += 1;
    if (renewalAttempts > 20) {
      throw new Error('Renewal loop exceeded the test bound');
    }
    return Promise.resolve({ lease, error: null });
  });
  const release = jest.fn<ProjectLocks['release']>().mockResolvedValue({ error: null });
  const session = new LockSession({
    locks: { renew, release },
    key: lease.key,
    ttl,
    lease,
    startedAt: { monotonic: -elapsed, wall: -elapsed },
    random,
  });
  return { session, renew, release };
}
