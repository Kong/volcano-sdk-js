const MAX_TIMER_DELAY_MS = 24 * 60 * 60 * 1000;
const MAX_LEASE_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
const RENEWAL_REQUEST_BUDGET_MS = 1000;
const RENEWAL_SAFETY_MARGIN_MS = 1000;
const EXPIRY_MESSAGE = 'lock lease expired before renewal completed';
const UNSAFE_RENEWAL_MESSAGE = 'lock renewal returned no safe lease window';

export function lockRequestStart() {
  return { monotonic: performance.now(), wall: Date.now() };
}

export class LeaseClock {
  constructor(ttl, startedAt) {
    this.ttlMs = ttl * 1000;
    this.absoluteMonotonicDeadline = startedAt.monotonic + MAX_LEASE_LIFETIME_MS;
    this.absoluteWallDeadline = startedAt.wall + MAX_LEASE_LIFETIME_MS;
    this.reset(startedAt);
  }

  reset(startedAt) {
    this.monotonicDeadline = Math.min(
      startedAt.monotonic + this.ttlMs,
      this.absoluteMonotonicDeadline,
    );
    this.wallDeadline = Math.min(startedAt.wall + this.ttlMs, this.absoluteWallDeadline);
  }

  remaining() {
    return Math.max(
      0,
      Math.min(this.monotonicDeadline - performance.now(), this.wallDeadline - Date.now()),
    );
  }
}

export class LockSession {
  constructor({ locks, key, ttl, lease, startedAt, random }) {
    this.locks = locks;
    this.key = key;
    this.ttl = ttl;
    this.lease = lease;
    this.random = random;
    this.clock = new LeaseClock(ttl, startedAt);
    this.controller = new AbortController();
    this.renewalController = null;
    this.failure = null;
    this.stopped = false;
    this.expiryTimer = null;
    this.renewalTimer = null;
    this.wakeRenewal = null;
  }

  async run(callback) {
    let data = null;
    let callbackError = null;
    let releaseError;
    try {
      await this.prepare();
      if (!this.failure) {
        this.start();
        data = await callback({ signal: this.controller.signal, lease: this.lease });
      }
    } catch (error) {
      callbackError = toError(error);
    } finally {
      releaseError = await this.cleanup();
    }
    return { data, error: this.failure || callbackError || releaseError };
  }

  async prepare() {
    if (this.renewalDelay() > 0) {
      return;
    }
    this.scheduleExpiry();
    const startedAt = lockRequestStart();
    const controller = new AbortController();
    this.renewalController = controller;
    const renewed = await this.locks.renew(this.key, this.lease, {
      ttl: this.ttl,
      signal: controller.signal,
    });
    this.renewalController = null;
    if (this.failure || this.stopped) {
      return;
    }
    if (renewed.error) {
      this.markLost(renewed.error);
      return;
    }
    this.clock.reset(startedAt);
    if (this.renewalDelay() === 0) {
      this.markLost(new Error(UNSAFE_RENEWAL_MESSAGE));
    }
  }

  start() {
    this.scheduleExpiry();
    this.runRenewals().catch((error) => this.markLost(toError(error)));
  }

  async runRenewals() {
    while (!this.stopped && !this.failure) {
      await this.waitToRenew();
      if (this.stopped || this.failure) {
        return;
      }
      await this.renew();
    }
  }

  async renew() {
    const startedAt = lockRequestStart();
    const controller = new AbortController();
    this.renewalController = controller;
    const renewed = await this.locks.renew(this.key, this.lease, {
      ttl: this.ttl,
      signal: controller.signal,
    });
    this.renewalController = null;
    if (this.stopped || this.failure) {
      return;
    }
    if (renewed.error) {
      this.markLost(renewed.error);
      return;
    }
    this.clock.reset(startedAt);
    if (this.renewalDelay() === 0) {
      this.markLost(new Error(UNSAFE_RENEWAL_MESSAGE));
      return;
    }
    this.scheduleExpiry();
  }

  waitToRenew() {
    return new Promise((resolve) => {
      this.wakeRenewal = resolve;
      this.renewalTimer = setTimeout(resolve, Math.max(1, this.renewalDelay()));
    }).finally(() => {
      this.wakeRenewal = null;
      this.renewalTimer = null;
    });
  }

  renewalDelay() {
    const baseDelay = Math.min(this.clock.ttlMs / 3, MAX_TIMER_DELAY_MS);
    const latestDelay = Math.max(
      0,
      this.clock.remaining() - RENEWAL_SAFETY_MARGIN_MS - RENEWAL_REQUEST_BUDGET_MS,
    );
    const jitter = baseDelay * 0.1 * (this.random() * 2 - 1);
    return Math.min(Math.max(0, baseDelay + jitter), latestDelay);
  }

  scheduleExpiry() {
    clearTimeout(this.expiryTimer);
    const delay = Math.min(MAX_TIMER_DELAY_MS, this.clock.remaining());
    this.expiryTimer = setTimeout(() => this.checkExpiry(), Math.max(1, delay));
  }

  checkExpiry() {
    if (this.stopped || this.failure) {
      return;
    }
    if (this.clock.remaining() === 0) {
      this.markLost(new Error(EXPIRY_MESSAGE));
      return;
    }
    this.scheduleExpiry();
  }

  markLost(error) {
    if (this.failure || this.stopped) {
      return;
    }
    this.failure = error;
    this.renewalController?.abort(error);
    this.controller.abort(error);
    this.stopTimers();
  }

  async cleanup() {
    if (!this.failure && this.clock.remaining() === 0) {
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

  stopTimers() {
    clearTimeout(this.expiryTimer);
    clearTimeout(this.renewalTimer);
    this.wakeRenewal?.();
  }
}

function toError(error) {
  return error instanceof Error ? error : new Error(String(error));
}
