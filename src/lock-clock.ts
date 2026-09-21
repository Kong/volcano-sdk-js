const MAX_LEASE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;

export interface LockRequestStart {
  monotonic: number;
  wall: number;
}

export function lockRequestStart(): LockRequestStart {
  return { monotonic: performance.now(), wall: Date.now() };
}

export class LeaseClock {
  readonly ttlMs: number;
  readonly absoluteMonotonicDeadline: number;
  readonly absoluteWallDeadline: number;
  monotonicDeadline: number;
  wallDeadline: number;

  constructor(ttl: number, startedAt: LockRequestStart) {
    this.ttlMs = ttl * 1000;
    this.absoluteMonotonicDeadline = startedAt.monotonic + MAX_LEASE_LIFETIME_MS;
    this.absoluteWallDeadline = startedAt.wall + MAX_LEASE_LIFETIME_MS;
    [this.monotonicDeadline, this.wallDeadline] = this.deadlines(startedAt);
  }

  reset(startedAt: LockRequestStart): void {
    [this.monotonicDeadline, this.wallDeadline] = this.deadlines(startedAt);
  }

  remaining(): number {
    // Date.now catches suspension on platforms where performance.now pauses.
    // A forward clock correction may shorten a lease; failing closed is safer
    // than allowing guarded work to outlive its server-side ownership.
    return Math.max(
      0,
      Math.min(this.monotonicDeadline - performance.now(), this.wallDeadline - Date.now()),
    );
  }

  private deadlines(startedAt: LockRequestStart): [number, number] {
    return [
      Math.min(startedAt.monotonic + this.ttlMs, this.absoluteMonotonicDeadline),
      Math.min(startedAt.wall + this.ttlMs, this.absoluteWallDeadline),
    ];
  }
}
