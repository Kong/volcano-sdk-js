import { randomBytes } from 'node:crypto';
import {
  type AuthResponse,
  type CurrentSession,
  type DurableExecution,
  type ProjectLockLease,
  VolcanoClient,
} from '../../src/index.js';
import { type RealtimeChannel, VolcanoRealtime } from '../../src/realtime.ts';

export interface ContractFixture {
  [key: string]: unknown;
  api_url: string;
  anon_key: string;
  service_key: string;
  platform_token: string;
  project_id: string;
  user_id: string;
  user_email: string;
  user_password: string;
  storage_path: string;
  realtime_channel: string;
  lock_key: string;
  function_name: string;
  durable_function_name: string;
  database_name: string;
  realtime_table_name: string;
  bucket_name: string;
  function_id: string;
  logs_access_token: string;
}

interface CredentialClient {
  accessToken?: string | null;
  refreshToken?: string | null;
}

export interface DiagnosticWorld {
  fixture: Record<string, unknown>;
  lastOutcome?: { ok: true; value: unknown } | { ok: false; category: string } | null;
  lastFailure?: FailureSummary | null;
  previousSession?: unknown;
  refreshedSession?: unknown;
  signedOutSession?: unknown;
  client?: CredentialClient;
  serviceClient?: CredentialClient;
  ownerClient?: CredentialClient;
}

interface FailureSummary {
  category: string;
  status: number | null;
  code: string | null;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function statusOf(error: unknown): unknown {
  if (!isRecord(error)) {
    return undefined;
  }
  const response = error['response'];
  return error['status'] ?? (isRecord(response) ? response['status'] : undefined);
}

const TERMINAL_DURABLE_STATUSES = ['succeeded', 'failed', 'timed_out', 'stopped', 'unknown'];

// A durable execution is started asynchronously and observed through a status
// read, so it settles in seconds. Bounded, so a scenario reports a timeout
// instead of hanging the lane.
const DURABLE_POLL_INTERVAL_MS = 5_000;
const DURABLE_POLL_TIMEOUT_MS = 300_000;
const MAX_DIAGNOSTIC_INPUT_LENGTH = 16_384;
const MAX_DIAGNOSTIC_ENCODING_DEPTH = 8;

function classifyError(error: unknown): string {
  const status = statusOf(error);
  if (typeof status !== 'number') {
    return 'transport error';
  }
  if (status >= 500 && status <= 599) {
    return 'server error';
  }
  const categories: Record<number, string> = {
    400: 'validation error',
    401: 'authentication error',
    403: 'authentication error',
    404: 'not found',
    409: 'conflict',
    422: 'validation error',
    429: 'rate limited',
  };
  return categories[status] ?? 'transport error';
}

function recordOutcome(
  world: DiagnosticWorld,
  data: unknown,
  error: unknown,
): DiagnosticWorld['lastOutcome'] {
  world.lastFailure = error === null || error === undefined ? null : failureSummary(world, error);
  world.lastOutcome =
    error === null || error === undefined
      ? { ok: true, value: data }
      : { ok: false, category: classifyError(error) };
  return world.lastOutcome;
}

function stringLeaves(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (!isRecord(value)) {
    return [];
  }
  return Object.values(value).flatMap((item) => stringLeaves(item));
}

function normalizeDiagnosticEncoding(value: string): string | null {
  if (value.length > MAX_DIAGNOSTIC_INPUT_LENGTH) {
    return null;
  }
  for (let depth = 0; depth < MAX_DIAGNOSTIC_ENCODING_DEPTH; depth += 1) {
    const normalized = value
      .replaceAll(/(?:%[\da-f]{2})+/gi, (encoded) =>
        Buffer.from(
          encoded
            .split('%')
            .slice(1)
            .map((hex) => Number.parseInt(hex, 16)),
        ).toString('utf8'),
      )
      .replaceAll('+', ' ');
    if (normalized === value) {
      return normalized;
    }
    value = normalized;
  }
  return null;
}

function diagnosticText(world: DiagnosticWorld, value: string): string {
  if (value.length > MAX_DIAGNOSTIC_INPUT_LENGTH) {
    return '[diagnostic omitted: oversized input]';
  }
  // Keep each original word's boundary so decoded spaces cannot split a URL's query.
  value = value
    .split(/(\s+)/)
    .map((part) =>
      (normalizeDiagnosticEncoding(part) ?? '[redacted]').replaceAll(
        /(?:https?|wss?|postgres(?:ql)?|redis):\/\/[\s\S]*/gi,
        '[URL]',
      ),
    )
    .join('')
    .replaceAll(/Bearer\s+\S+/gi, 'Bearer [redacted]');
  const credentials = [
    ...stringLeaves(world.fixture),
    ...stringLeaves(world.previousSession),
    ...stringLeaves(world.refreshedSession),
    ...stringLeaves(world.signedOutSession),
    ...[world.client, world.serviceClient, world.ownerClient].flatMap((client) => [
      client?.accessToken,
      client?.refreshToken,
    ]),
  ]
    .filter(
      (credential): credential is string =>
        typeof credential === 'string' && credential.length >= 4,
    )
    .map((credential) => normalizeDiagnosticEncoding(credential))
    .filter((credential) => credential !== null)
    .sort((left, right) => right.length - left.length);
  for (const credential of credentials) {
    value = value.replaceAll(credential, '[redacted]');
  }
  return value.slice(0, 1000);
}

function validHttpStatus(status: unknown): number | null {
  return typeof status === 'number' && Number.isInteger(status) && status >= 100 && status <= 599
    ? status
    : null;
}

function errorField(error: unknown, field: string): unknown {
  return isRecord(error) ? error[field] : undefined;
}

function failureSummary(world: DiagnosticWorld, error: unknown): FailureSummary {
  const status = statusOf(error);
  const code = errorField(error, 'code');
  const message = errorField(error, 'message');
  return {
    category: classifyError(error),
    status: validHttpStatus(status),
    code: typeof code === 'string' ? diagnosticText(world, code) : null,
    message: diagnosticText(world, typeof message === 'string' ? message : 'Unknown SDK error'),
  };
}

async function drainCallbacks(
  callbacks: readonly (() => Promise<unknown>)[],
  failures: unknown[],
): Promise<void> {
  for (const callback of [...callbacks].reverse()) {
    try {
      await callback();
    } catch (error) {
      failures.push(error);
    }
  }
}

function disconnectClients(clients: readonly VolcanoRealtime[], failures: unknown[]): void {
  for (const client of clients) {
    try {
      client.disconnect();
    } catch (error) {
      failures.push(error);
    }
  }
}

function requireSuccessfulOutcome(world: DiagnosticWorld): unknown {
  if (world.lastOutcome?.ok !== true) {
    throw new Error(
      `SDK operation failed: ${JSON.stringify(world.lastFailure ?? { category: 'missing outcome' })}`,
    );
  }
  return world.lastOutcome.value;
}

class ContractWorld {
  readonly fixture: ContractFixture;
  lastOutcome: DiagnosticWorld['lastOutcome'] = null;
  lastFailure: FailureSummary | null = null;
  previousSession: CurrentSession | null = null;
  refreshedSession: CurrentSession | null = null;
  signedOutSession: CurrentSession | null = null;
  authStateUsers: unknown[] = [];
  client: VolcanoClient;
  readonly serviceClient: VolcanoClient;
  readonly ownerClient: VolcanoClient;
  realtimeClients: VolcanoRealtime[] = [];
  cleanupCallbacks: (() => Promise<unknown>)[] = [];
  startedExecution: DurableExecution | null = null;
  storagePath: string;
  realtimeChannel: string;
  lockKey: string;
  functionName: string;
  storageBytes: Buffer;
  realtimeMessage: { event: string; value: string };
  durableExecutionName: string;
  durablePayload: { value: string };
  subscriber: RealtimeChannel | null = null;
  publisher: RealtimeChannel | null = null;

  constructor(fixture: ContractFixture) {
    this.fixture = fixture;
    this.lastOutcome = null;
    this.lastFailure = null;
    this.previousSession = null;
    this.refreshedSession = null;
    this.signedOutSession = null;
    this.authStateUsers = [];
    this.client = new VolcanoClient({
      apiUrl: fixture.api_url,
      anonKey: fixture.anon_key,
    });
    this.serviceClient = new VolcanoClient({
      apiUrl: fixture.api_url,
      anonKey: fixture.service_key,
      accessToken: fixture.service_key,
    });
    // Reading or stopping an execution is owner-scoped, so its client carries
    // the project's own token as its session. Neither key above can reach those
    // routes.
    this.ownerClient = new VolcanoClient({
      apiUrl: fixture.api_url,
      anonKey: fixture.anon_key,
      accessToken: fixture.platform_token,
    });
    this.realtimeClients = [];
    this.cleanupCallbacks = [];
    this.startedExecution = null;

    const suffix = `js-${String(process.pid)}-${randomBytes(5).toString('hex')}`;
    this.storagePath = `${fixture.storage_path}.${suffix}`;
    this.realtimeChannel = `${fixture.realtime_channel}-${suffix}`;
    this.lockKey = `${fixture.lock_key}-${suffix}`;
    // No suffix: the fixture deploys one function and every language shares it,
    // where the names above are per-scenario resources.
    this.functionName = fixture.function_name;
    this.storageBytes = Buffer.from(`volcano-sdk-contract-${suffix}`, 'utf8');
    this.realtimeMessage = { event: 'message', value: `volcano-sdk-contract-${suffix}` };
    this.durableExecutionName = `${fixture.durable_function_name}-${suffix}`;
    this.durablePayload = { value: `volcano-sdk-contract-${suffix}` };
  }

  async startDurableExecution(): Promise<DurableExecution> {
    const { data, error } = await this.serviceClient.durable.start(
      this.fixture.durable_function_name,
      this.durablePayload,
      { executionName: this.durableExecutionName },
    );
    if (error !== null) {
      throw error;
    }
    if (data === null) {
      throw new Error('Durable execution response was empty');
    }
    this.startedExecution = data;
    return data;
  }

  /**
   * Polls an execution to a terminal status under the owner's credential, which
   * is also the read that reconciles the stored status against the platform's.
   */
  async followDurableExecution(executionId: string): Promise<DurableExecution> {
    const deadline = Date.now() + DURABLE_POLL_TIMEOUT_MS;
    for (;;) {
      const data = await this.readDurableExecution(executionId);
      if (TERMINAL_DURABLE_STATUSES.includes(data.status)) {
        return data;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Durable execution ${executionId} was still ${data.status} after ${String(DURABLE_POLL_TIMEOUT_MS)}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, DURABLE_POLL_INTERVAL_MS));
    }
  }

  private async readDurableExecution(executionId: string): Promise<DurableExecution> {
    const { data, error } = await this.ownerClient.durable.get(
      this.fixture.project_id,
      this.fixture.durable_function_name,
      executionId,
    );
    if (error !== null) {
      throw error;
    }
    if (data === null) {
      throw new Error('Durable execution response was empty');
    }
    return data;
  }

  async authenticate(): Promise<AuthResponse> {
    const result = await this.client.auth.signIn({
      email: this.fixture.user_email,
      password: this.fixture.user_password,
    });
    if (result.error !== null) {
      throw result.error;
    }
    if (result.session === null) {
      throw new Error('Sign-in response was missing a session');
    }
    return result;
  }

  async createRealtimeClients(): Promise<void> {
    const signedIn = await this.authenticate();
    const session = signedIn.session;
    if (session === null) {
      throw new Error('Sign-in response was missing a session');
    }
    const config = {
      apiUrl: this.fixture.api_url,
      anonKey: this.fixture.anon_key,
      accessToken: session.access_token,
    };
    this.realtimeClients = [new VolcanoRealtime(config), new VolcanoRealtime(config)];
    await Promise.all(this.realtimeClients.map((client) => client.connect()));
    const [subscriber, publisher] = this.realtimeClients;
    if (subscriber === undefined || publisher === undefined) {
      throw new Error('Realtime clients were not created');
    }
    this.subscriber = subscriber.channel(this.realtimeChannel);
    this.publisher = publisher.channel(this.realtimeChannel);
    await Promise.all([this.subscriber.subscribe(), this.publisher.subscribe()]);
  }

  registerLockCleanup(key: string, lease: ProjectLockLease): () => Promise<void> {
    const cleanup = async () => {
      const released = await this.serviceClient.locks.release(key, lease);
      if (released.error !== null) {
        throw released.error;
      }
    };
    this.cleanupCallbacks.push(cleanup);
    return cleanup;
  }

  async cleanup(): Promise<void> {
    const failures: unknown[] = [];
    await drainCallbacks(this.cleanupCallbacks, failures);
    disconnectClients(this.realtimeClients, failures);
    this.cleanupCallbacks = [];
    this.realtimeClients = [];
    if (failures.length > 0) {
      throw new AggregateError(failures, 'JavaScript contract cleanup failed');
    }
  }
}

export { ContractWorld, recordOutcome, requireSuccessfulOutcome, TERMINAL_DURABLE_STATUSES };
