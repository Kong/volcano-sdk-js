const { randomBytes } = require('node:crypto');

const { VolcanoClient } = require('../../src/index.js');
const { VolcanoRealtime } = require('../../src/realtime.ts');

const TERMINAL_DURABLE_STATUSES = ['succeeded', 'failed', 'timed_out', 'stopped', 'unknown'];

// A durable execution is started asynchronously and observed through a status
// read, so it settles in seconds. Bounded, so a scenario reports a timeout
// instead of hanging the lane.
const DURABLE_POLL_INTERVAL_MS = 5_000;
const DURABLE_POLL_TIMEOUT_MS = 300_000;
const MAX_DIAGNOSTIC_INPUT_LENGTH = 16_384;
const MAX_DIAGNOSTIC_ENCODING_DEPTH = 8;

function classifyError(error) {
  const status = error?.status ?? error?.response?.status;
  if (status === 401 || status === 403) {
    return 'authentication error';
  }
  if (status === 400 || status === 422) {
    return 'validation error';
  }
  if (status === 404) {
    return 'not found';
  }
  if (status === 409) {
    return 'conflict';
  }
  if (status === 429) {
    return 'rate limited';
  }
  if (status >= 500 && status <= 599) {
    return 'server error';
  }
  return 'transport error';
}

function recordOutcome(world, data, error) {
  world.lastFailure = error ? failureSummary(world, error) : null;
  world.lastOutcome = error
    ? { ok: false, category: classifyError(error) }
    : { ok: true, value: data };
  return world.lastOutcome;
}

function stringLeaves(value) {
  if (typeof value === 'string') return [value];
  if (value === null || typeof value !== 'object') return [];
  return Object.values(value).flatMap(stringLeaves);
}

function normalizeDiagnosticEncoding(value) {
  if (value.length > MAX_DIAGNOSTIC_INPUT_LENGTH) return null;
  for (let depth = 0; depth < MAX_DIAGNOSTIC_ENCODING_DEPTH; depth += 1) {
    const normalized = value
      .replace(/(?:%[\da-f]{2})+/gi, (encoded) =>
        Buffer.from(
          encoded
            .split('%')
            .slice(1)
            .map((hex) => Number.parseInt(hex, 16)),
        ).toString('utf8'),
      )
      .replaceAll('+', ' ');
    if (normalized === value) return normalized;
    value = normalized;
  }
  return null;
}

function diagnosticText(world, value) {
  if (value.length > MAX_DIAGNOSTIC_INPUT_LENGTH) return '[diagnostic omitted: oversized input]';
  // Keep each original word's boundary so decoded spaces cannot split a URL's query.
  value = value
    .split(/(\s+)/)
    .map((part) =>
      (normalizeDiagnosticEncoding(part) ?? '[redacted]').replace(
        /(?:https?|wss?|postgres(?:ql)?|redis):\/\/[\s\S]*/gi,
        '[URL]',
      ),
    )
    .join('')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]');
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
    .filter((credential) => typeof credential === 'string' && credential.length >= 4)
    .map(normalizeDiagnosticEncoding)
    .filter((credential) => credential !== null)
    .sort((left, right) => right.length - left.length);
  for (const credential of credentials) {
    value = value.replaceAll(credential, '[redacted]');
  }
  return value.slice(0, 1000);
}

function failureSummary(world, error) {
  const status = error?.status ?? error?.response?.status;
  return {
    category: classifyError(error),
    status: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
    code: typeof error?.code === 'string' ? diagnosticText(world, error.code) : null,
    message: diagnosticText(
      world,
      typeof error?.message === 'string' ? error.message : 'Unknown SDK error',
    ),
  };
}

function requireSuccessfulOutcome(world) {
  if (world.lastOutcome?.ok !== true) {
    throw new Error(
      `SDK operation failed: ${JSON.stringify(world.lastFailure ?? { category: 'missing outcome' })}`,
    );
  }
  return world.lastOutcome.value;
}

class ContractWorld {
  constructor(fixture) {
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

    const suffix = `js-${process.pid}-${randomBytes(5).toString('hex')}`;
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

  async startDurableExecution() {
    const { data, error } = await this.serviceClient.durable.start(
      this.fixture.durable_function_name,
      this.durablePayload,
      { executionName: this.durableExecutionName },
    );
    if (error) {
      throw error;
    }
    this.startedExecution = data;
    return data;
  }

  /**
   * Polls an execution to a terminal status under the owner's credential, which
   * is also the read that reconciles the stored status against the platform's.
   */
  async followDurableExecution(executionId) {
    const deadline = Date.now() + DURABLE_POLL_TIMEOUT_MS;
    for (;;) {
      const { data, error } = await this.ownerClient.durable.get(
        this.fixture.project_id,
        this.fixture.durable_function_name,
        executionId,
      );
      if (error) {
        throw error;
      }
      if (TERMINAL_DURABLE_STATUSES.includes(data.status)) {
        return data;
      }
      if (Date.now() >= deadline) {
        throw new Error(
          `Durable execution ${executionId} was still ${data.status} after ${DURABLE_POLL_TIMEOUT_MS}ms`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, DURABLE_POLL_INTERVAL_MS));
    }
  }

  async authenticate() {
    const result = await this.client.auth.signIn({
      email: this.fixture.user_email,
      password: this.fixture.user_password,
    });
    if (result.error) {
      throw result.error;
    }
    return result;
  }

  async createRealtimeClients() {
    const signedIn = await this.authenticate();
    const config = {
      apiUrl: this.fixture.api_url,
      anonKey: this.fixture.anon_key,
      accessToken: signedIn.session.access_token,
    };
    this.realtimeClients = [new VolcanoRealtime(config), new VolcanoRealtime(config)];
    await Promise.all(this.realtimeClients.map((client) => client.connect()));
    this.subscriber = this.realtimeClients[0].channel(this.realtimeChannel);
    this.publisher = this.realtimeClients[1].channel(this.realtimeChannel);
    await Promise.all([this.subscriber.subscribe(), this.publisher.subscribe()]);
  }

  registerLockCleanup(key, lease) {
    const cleanup = async () => {
      const released = await this.serviceClient.locks.release(key, lease);
      if (released.error) {
        throw released.error;
      }
    };
    this.cleanupCallbacks.push(cleanup);
    return cleanup;
  }

  async cleanup() {
    const failures = [];
    for (const callback of this.cleanupCallbacks.slice().reverse()) {
      try {
        await callback();
      } catch (error) {
        failures.push(error);
      }
    }
    for (const client of this.realtimeClients) {
      try {
        client.disconnect();
      } catch (error) {
        failures.push(error);
      }
    }
    this.cleanupCallbacks = [];
    this.realtimeClients = [];
    if (failures.length > 0) {
      throw new AggregateError(failures, 'JavaScript contract cleanup failed');
    }
  }
}

module.exports = {
  ContractWorld,
  recordOutcome,
  requireSuccessfulOutcome,
  TERMINAL_DURABLE_STATUSES,
};
