import type { ProjectLockLease, ProjectLocks } from './index.js';
import { LeaseClock, type LockRequestStart, lockRequestStart } from './lock-clock.ts';

export { LeaseClock, lockRequestStart } from './lock-clock.ts';

const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const RENEWAL_REQUEST_BUDGET_MS = 1000;
const RENEWAL_SAFETY_MARGIN_MS = 1000;
const EXPIRY_MESSAGE = 'lock lease expired before renewal completed';
const UNSAFE_RENEWAL_MESSAGE = 'lock renewal returned no safe lease window';

interface LockSessionOptions {
  locks: Pick<ProjectLocks, 'renew' | 'release'>;
  key: string;
  ttl: number;
  lease: ProjectLockLease;
  startedAt: LockRequestStart;
  random: () => number;
}

export class LockSession {
  readonly locks: Pick<ProjectLocks, 'renew' | 'release'>;
  readonly key: string;
  readonly ttl: number;
  readonly lease: ProjectLockLease;
  readonly random: () => number;
  readonly clock: LeaseClock;
  readonly controller = new AbortController();
  renewalController: AbortController | null = null;
  failure: Error | null = null;
  stopped = false;
  expiryTimer: ReturnType<typeof setTimeout> | undefined;
  renewalTimer: ReturnType<typeof setTimeout> | undefined;
  wakeRenewal: (() => void) | null = null;

  constructor({ locks, key, ttl, lease, startedAt, random }: LockSessionOptions) {
    this.locks = locks;
    this.key = key;
    this.ttl = ttl;
    this.lease = lease;
    this.random = random;
    this.clock = new LeaseClock(ttl, startedAt);
  }

  async run<T>(
    callback: (context: { signal: AbortSignal; lease: ProjectLockLease }) => T | Promise<T>,
  ): Promise<{ data: T | null; error: Error | null }> {
    let data: T | null = null;
    let callbackError: Error | null = null;
    let releaseError: Error | null;
    try {
      await this.prepare();
      if (this.failure === null) {
        this.start();
        data = await callback({ signal: this.controller.signal, lease: this.lease });
      }
    } catch (error) {
      callbackError = toError(error);
    } finally {
      releaseError = await this.cleanup();
    }
    return { data, error: this.failure ?? callbackError ?? releaseError };
  }

  async prepare(): Promise<void> {
    if (this.renewalDelay() > 0) {
      return;
    }
    this.scheduleExpiry();
    await this.renewLease(false);
  }

  start(): void {
    this.scheduleExpiry();
    this.runRenewals().catch((error: unknown) => {
      this.markLost(toError(error));
    });
  }

  async runRenewals(): Promise<void> {
    while (this.isActive()) {
      await this.waitToRenew();
      if (!this.isActive()) {
        return;
      }
      await this.renew();
    }
  }

  private isActive(): boolean {
    return !this.stopped && this.failure === null;
  }

  renew(): Promise<void> {
    return this.renewLease(true);
  }

  private async renewLease(scheduleNext: boolean): Promise<void> {
    const startedAt = lockRequestStart();
    const controller = new AbortController();
    this.renewalController = controller;
    const renewed = await this.locks.renew(this.key, this.lease, {
      ttl: this.ttl,
      signal: controller.signal,
    });
    this.renewalController = null;
    if (this.acceptRenewal(renewed.error, startedAt) && scheduleNext) {
      this.scheduleExpiry();
    }
  }

  private acceptRenewal(error: Error | null, startedAt: LockRequestStart): boolean {
    if (this.stopped || this.failure !== null) {
      return false;
    }
    if (error !== null) {
      this.markLost(error);
      return false;
    }
    this.clock.reset(startedAt);
    if (this.renewalDelay() === 0) {
      this.markLost(new Error(UNSAFE_RENEWAL_MESSAGE));
      return false;
    }
    return true;
  }

  waitToRenew(): Promise<void> {
    return new Promise<void>((resolve) => {
      this.wakeRenewal = resolve;
      this.renewalTimer = setTimeout(resolve, Math.max(1, this.renewalDelay()));
    }).finally(() => {
      this.wakeRenewal = null;
      this.renewalTimer = undefined;
    });
  }

  renewalDelay(): number {
    const baseDelay = Math.min(this.clock.ttlMs / 3, MAX_TIMER_DELAY_MS);
    const remaining = this.clock.remaining();
    if (!Number.isFinite(remaining)) {
      return 0;
    }
    const latestDelay = Math.max(
      0,
      remaining - RENEWAL_SAFETY_MARGIN_MS - RENEWAL_REQUEST_BUDGET_MS,
    );
    const jitter = baseDelay * 0.1 * (this.random() * 2 - 1);
    return Math.min(Math.max(0, baseDelay + jitter), latestDelay);
  }

  scheduleExpiry(): void {
    clearTimeout(this.expiryTimer);
    const delay = Math.min(MAX_TIMER_DELAY_MS, this.clock.remaining());
    this.expiryTimer = setTimeout(
      () => {
        this.checkExpiry();
      },
      Math.max(1, delay),
    );
  }

  checkExpiry(): void {
    if (this.stopped || this.failure !== null) {
      return;
    }
    const remaining = this.clock.remaining();
    if (!Number.isFinite(remaining) || remaining === 0) {
      this.markLost(new Error(EXPIRY_MESSAGE));
      return;
    }
    this.scheduleExpiry();
  }

  markLost(error: Error): void {
    if (this.failure !== null || this.stopped) {
      return;
    }
    this.failure = error;
    this.renewalController?.abort(error);
    this.controller.abort(error);
    this.stopTimers();
  }

  async cleanup(): Promise<Error | null> {
    if (this.failure === null && this.clock.remaining() === 0) {
      this.markLost(new Error(EXPIRY_MESSAGE));
    }
    this.stopped = true;
    this.renewalController?.abort();
    this.stopTimers();
    try {
      const released = await this.locks.release(this.key, this.lease);
      return released.error;
    } catch (error) {
      return toError(error);
    }
  }

  stopTimers(): void {
    clearTimeout(this.expiryTimer);
    clearTimeout(this.renewalTimer);
    this.wakeRenewal?.();
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
