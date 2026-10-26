export interface ProjectLockLease {
  key: string;
  token: string;
  expiresAt: string | null;
  /**
   * Rises whenever the lock changes hands and stays put across renewals. Pass it
   * to the resource you are protecting and reject writes carrying a lower token
   * than the highest already seen.
   */
  fencingToken: number | null;
}

export interface ProjectLockRequestOptions {
  /**
   * UUID recorded alongside the server's log line for this call. Reusing one
   * marks a retry as the same logical operation; it never deduplicates, so the
   * retry still spends the project's request budget.
   */
  requestId?: string;
}

export interface ProjectLockOptions extends ProjectLockRequestOptions {
  /** Lease duration in seconds, from 5 through 7,776,000 (90 days). */
  ttl: number;
}

export interface ProjectLockAcquireOptions extends ProjectLockOptions {
  /** Reuse only to retry an ambiguous acquire with the same ownership token. */
  token?: string;
}

export interface ProjectLockRenewOptions extends ProjectLockOptions {
  /** Cancels the in-flight renewal request. */
  signal?: AbortSignal;
}

export interface ProjectLockState {
  /** False means an acquire would succeed now. */
  held: boolean;
  expiresAt: string | null;
  fencingToken: number | null;
}

export interface ProjectLockAcquireResult {
  acquired: boolean;
  lease: ProjectLockLease | null;
  error: ProjectLockError | null;
}

export interface ProjectLockError extends Error {
  status?: number;
  code?: string;
  retryAfter?: number;
}

export interface ProjectLockResult<T = unknown> {
  acquired: boolean;
  data: T | null;
  error: ProjectLockError | null;
}

export interface ProjectLocks {
  acquire(key: string, options: ProjectLockAcquireOptions): Promise<ProjectLockAcquireResult>;
  renew(
    key: string,
    lease: ProjectLockLease,
    options: ProjectLockRenewOptions,
  ): Promise<{ lease: ProjectLockLease; error: ProjectLockError | null }>;
  release(
    key: string,
    lease: ProjectLockLease,
    options?: ProjectLockRequestOptions,
  ): Promise<{ error: ProjectLockError | null }>;
  get(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{ state: ProjectLockState | null; error: ProjectLockError | null }>;
  /** Drops the lease whatever token holds it. Safe only behind a fencing token. */
  forceRelease(key: string, options?: ProjectLockRequestOptions): Promise<{ error: ProjectLockError | null }>;
  withLock<T>(
    key: string,
    options: ProjectLockAcquireOptions,
    callback: (context: { signal: AbortSignal; lease: ProjectLockLease }) => Promise<T> | T,
  ): Promise<ProjectLockResult<T>>;
}
