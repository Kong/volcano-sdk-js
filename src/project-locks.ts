import type { RequestResult } from './auth-request.ts';
import type {
  ProjectLockAcquireOptions,
  ProjectLockAcquireResult,
  ProjectLockError,
  ProjectLockLease,
  ProjectLockRenewOptions,
  ProjectLockRequestOptions,
  ProjectLockResult,
  ProjectLocks,
  ProjectLockState,
} from './index.js';
import { secureRandomUnit } from './lock-random.ts';
import { lockRequestStart, LockSession } from './lock-session.ts';
import { validateLease, validateLockKey, validateLockOptions } from './lock-validation.ts';

export interface LockClient {
  readonly accessToken: string | null;
  readonly _transport: {
    acquireProjectLock(
      key: string,
      request: { ttl_seconds: number },
      options: unknown,
    ): Promise<{ data: unknown }>;
    releaseProjectLock(key: string, options: unknown): Promise<unknown>;
  };
  _completeOAuthExchange(): Promise<unknown>;
  _generatedOptions(mode: 'anon' | 'session', headers?: Record<string, string>): unknown;
  _authFetch(
    path: string,
    options: {
      method: 'GET' | 'PATCH' | 'DELETE';
      headers: Record<string, string>;
      body?: string;
      signal?: AbortSignal;
    },
  ): Promise<RequestResult>;
}

const CONTENTION_CODES = new Set(['lock_held', 'lock_ownership_lost']);

export class ProjectLocksApi implements ProjectLocks {
  constructor(private readonly client: LockClient) {}

  async acquire(
    key: string,
    options: ProjectLockAcquireOptions,
  ): Promise<ProjectLockAcquireResult> {
    const ttl = validateLockOptions(key, options);
    const token = lockId(options.token);
    const requestId = lockId(options.requestId);
    const lease: ProjectLockLease = { key, token, expiresAt: null, fencingToken: null };
    await this.client._completeOAuthExchange();
    const requestOptions = this.client._generatedOptions('anon', {
      Authorization: `Bearer ${String(this.client.accessToken)}`,
      'X-Volcano-Lock-Token': token,
      'X-Volcano-Request-Id': requestId,
    });
    const attempted = await this.tryAcquire(key, ttl, requestOptions);
    if (attempted.response !== null) {
      const fields = leaseFields(attempted.response.data);
      lease.expiresAt = fields.expiresAt;
      lease.fencingToken = fields.fencingToken;
      return { acquired: true, lease, error: null };
    }
    if (isContention(attempted.error)) {
      return { acquired: false, lease: null, error: null };
    }
    return { acquired: false, lease, error: attempted.error };
  }

  private async tryAcquire(
    key: string,
    ttl: number,
    requestOptions: unknown,
  ): Promise<
    { response: { data: unknown }; error: null } | { response: null; error: ProjectLockError }
  > {
    let requestError: ProjectLockError = new Error('Lock acquisition failed');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await this.client._transport.acquireProjectLock(
          encodeURIComponent(key),
          { ttl_seconds: ttl },
          requestOptions,
        );
        return { response, error: null };
      } catch (error) {
        requestError = error instanceof Error ? error : new Error('Lock acquisition failed');
        if (!retryable(requestError)) {
          break;
        }
      }
    }
    return { response: null, error: requestError };
  }

  async renew(
    key: string,
    lease: ProjectLockLease,
    options: ProjectLockRenewOptions,
  ): Promise<{ lease: ProjectLockLease; error: ProjectLockError | null }> {
    const ttl = validateLockOptions(key, options);
    validateLease(key, lease);
    const result = await this.client._authFetch(`/locks/${encodeURIComponent(key)}/lease`, {
      method: 'PATCH',
      headers: {
        'X-Volcano-Lock-Token': lease.token,
        'X-Volcano-Request-Id': lockId(options.requestId),
      },
      body: JSON.stringify({ ttl_seconds: ttl }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
    if (result.ok !== true) {
      return { lease, error: result.error };
    }
    const fields = leaseFields(result.data);
    lease.expiresAt = fields.expiresAt;
    lease.fencingToken = fields.fencingToken ?? lease.fencingToken;
    return { lease, error: null };
  }

  async release(
    key: string,
    lease: ProjectLockLease,
    options: ProjectLockRequestOptions = {},
  ): Promise<{ error: ProjectLockError | null }> {
    validateLockKey(key);
    validateLease(key, lease);
    try {
      await this.client._transport.releaseProjectLock(
        encodeURIComponent(key),
        this.client._generatedOptions('session', {
          'X-Volcano-Lock-Token': lease.token,
          'X-Volcano-Request-Id': lockId(options.requestId),
        }),
      );
      return { error: null };
    } catch (error) {
      return { error: error instanceof Error ? error : new Error('Lock release failed') };
    }
  }

  async get(
    key: string,
    options: ProjectLockRequestOptions = {},
  ): Promise<{ state: ProjectLockState | null; error: ProjectLockError | null }> {
    validateLockKey(key);
    const result = await this.client._authFetch(`/locks/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: { 'X-Volcano-Request-Id': lockId(options.requestId) },
    });
    if (result.ok !== true) {
      return { state: null, error: result.error };
    }
    return { state: stateFields(result.data), error: null };
  }

  async forceRelease(
    key: string,
    options: ProjectLockRequestOptions = {},
  ): Promise<{ error: ProjectLockError | null }> {
    validateLockKey(key);
    const result = await this.client._authFetch(`/locks/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'X-Volcano-Request-Id': lockId(options.requestId) },
    });
    return { error: result.error };
  }

  async withLock<T>(
    key: string,
    options: ProjectLockAcquireOptions,
    callback: (context: { signal: AbortSignal; lease: ProjectLockLease }) => Promise<T> | T,
  ): Promise<ProjectLockResult<T>> {
    if (typeof callback !== 'function') {
      throw new TypeError('callback must be a function');
    }
    const ttl = validateLockOptions(key, options);
    const startedAt = lockRequestStart();
    const acquired = await this.acquire(key, options);
    if (!acquired.acquired || acquired.lease === null || acquired.error !== null) {
      return { acquired: acquired.acquired, data: null, error: acquired.error };
    }
    const session = new LockSession({
      locks: this,
      key,
      ttl,
      lease: acquired.lease,
      startedAt,
      random: secureRandomUnit,
    });
    return { acquired: true, ...(await session.run(callback)) };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function lockId(value: unknown): string {
  return typeof value !== 'string' || value.length === 0 ? crypto.randomUUID() : value;
}

function leaseFields(value: unknown): { expiresAt: string; fencingToken: number | null } {
  if (!isRecord(value)) {
    throw new TypeError('Lock response has no expiration');
  }
  const expiresAt = value['expires_at'];
  if (typeof expiresAt !== 'string') {
    throw new TypeError('Lock response has no expiration');
  }
  return {
    expiresAt,
    fencingToken: optionalNumber(
      value['fencing_token'],
      'Lock response has an invalid fencing token',
    ),
  };
}

function stateFields(value: unknown): ProjectLockState {
  if (!isRecord(value)) {
    throw new TypeError('Lock state response is not an object');
  }
  return {
    held: value['held'] === true,
    expiresAt: optionalString(value['expires_at'], 'Lock state has an invalid expiration'),
    fencingToken: optionalNumber(value['fencing_token'], 'Lock state has an invalid fencing token'),
  };
}

function optionalString(value: unknown, message: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new TypeError(message);
  }
  return value;
}

function optionalNumber(value: unknown, message: string): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'number') {
    throw new TypeError(message);
  }
  return value;
}

function errorStatus(error: Error): number | null {
  if (!('status' in error)) {
    return null;
  }
  return typeof error.status === 'number' ? error.status : null;
}

function retryable(error: Error): boolean {
  const status = errorStatus(error);
  return status === null || status === 503;
}

function isContention(error: Error): boolean {
  if (errorStatus(error) !== 409 || !('info' in error) || !isRecord(error.info)) {
    return false;
  }
  const code = error.info['code'];
  return typeof code === 'string' && CONTENTION_CODES.has(code);
}
