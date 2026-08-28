const { randomBytes } = require('node:crypto');

const { VolcanoClient } = require('../../src/index.js');
const { VolcanoRealtime } = require('../../src/realtime.js');

const ERROR_CATEGORIES = new Map([
  [400, 'validation error'],
  [401, 'authentication error'],
  [403, 'authentication error'],
  [404, 'not found'],
  [409, 'conflict'],
  [422, 'validation error'],
  [429, 'rate limited'],
]);

function classifyError(error) {
  const status = error?.status ?? error?.response?.status;
  return (
    ERROR_CATEGORIES.get(status) ??
    (Math.trunc(status / 100) === 5 ? 'server error' : 'transport error')
  );
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
    this.uniqueEmail = `${suffix}@example.com`;
    this.uniquePassword = `Sdk-${suffix}!123`;
    this.metadataMarker = `updated-${suffix}`;
    this.storagePath = `${fixture.storage_path}.${suffix}`;
    this.realtimeChannel = `${fixture.realtime_channel}-${suffix}`;
    this.lockKey = `${fixture.lock_key}-${suffix}`;
    this.storageBytes = Buffer.from(`volcano-sdk-contract-${suffix}`, 'utf8');
    this.realtimeMessage = { event: 'message', value: `volcano-sdk-contract-${suffix}` };
    this.secondaryClient = null;
    this.listenerEvents = [];
    this.listenerEventCount = 0;
    this.unsubscribeAuth = null;
    this.previousAccessToken = null;
    this.previousRefreshToken = null;
    this.anonymousUserId = null;
    this.deletedSessionId = null;
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

  async createCredentialedUser() {
    const anonymous = await this.client.auth.signUpAnonymous();
    if (anonymous.error) {
      throw anonymous.error;
    }
    const converted = await this.client.auth.convertAnonymous({
      email: this.uniqueEmail,
      password: this.uniquePassword,
    });
    if (converted.error) {
      throw converted.error;
    }
    return converted;
  }

  async createSecondarySession() {
    if (!this.secondaryClient) {
      this.secondaryClient = new VolcanoClient({
        apiUrl: this.fixture.api_url,
        anonKey: this.fixture.anon_key,
      });
    }
    const result = await this.secondaryClient.auth.signIn({
      email: this.uniqueEmail,
      password: this.uniquePassword,
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

module.exports = { ContractWorld, recordOutcome };
