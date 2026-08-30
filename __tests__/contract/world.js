const { randomBytes } = require('node:crypto');

const { VolcanoClient } = require('../../src/index.js');
const { VolcanoRealtime } = require('../../src/realtime.js');

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
  world.lastOutcome = error
    ? { ok: false, category: classifyError(error) }
    : { ok: true, value: data };
  return world.lastOutcome;
}

class ContractWorld {
  constructor(fixture) {
    this.fixture = fixture;
    this.lastOutcome = null;
    this.previousSession = null;
    this.client = new VolcanoClient({
      apiUrl: fixture.api_url,
      anonKey: fixture.anon_key,
    });
    this.serviceClient = new VolcanoClient({
      apiUrl: fixture.api_url,
      anonKey: fixture.service_key,
      accessToken: fixture.service_key,
    });
    this.realtimeClients = [];
    this.cleanupCallbacks = [];

    const suffix = `js-${process.pid}-${randomBytes(5).toString('hex')}`;
    this.storagePath = `${fixture.storage_path}.${suffix}`;
    this.realtimeChannel = `${fixture.realtime_channel}-${suffix}`;
    this.lockKey = `${fixture.lock_key}-${suffix}`;
    this.storageBytes = Buffer.from(`volcano-sdk-contract-${suffix}`, 'utf8');
    this.realtimeMessage = { event: 'message', value: `volcano-sdk-contract-${suffix}` };
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

module.exports = { classifyError, ContractWorld, recordOutcome };
