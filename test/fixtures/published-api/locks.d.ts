export interface ProjectLockLease {
  key: string;
  token: string;
  expiresAt: string | null;
  fencingToken: number | null;
}
export interface ProjectLockRequestOptions {
  requestId?: string;
}
export interface ProjectLockOptions extends ProjectLockRequestOptions {
  ttl: number;
}
export interface ProjectLockAcquireOptions extends ProjectLockOptions {
  token?: string;
}
export interface ProjectLockRenewOptions extends ProjectLockOptions {
  signal?: AbortSignal;
}
export interface ProjectLockState {
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
  ): Promise<{
    lease: ProjectLockLease;
    error: ProjectLockError | null;
  }>;
  release(
    key: string,
    lease: ProjectLockLease,
    options?: ProjectLockRequestOptions,
  ): Promise<{
    error: ProjectLockError | null;
  }>;
  get(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{
    state: ProjectLockState | null;
    error: ProjectLockError | null;
  }>;
  forceRelease(
    key: string,
    options?: ProjectLockRequestOptions,
  ): Promise<{
    error: ProjectLockError | null;
  }>;
  withLock<T>(
    key: string,
    options: ProjectLockAcquireOptions,
    callback: (context: { signal: AbortSignal; lease: ProjectLockLease }) => Promise<T> | T,
  ): Promise<ProjectLockResult<T>>;
}
