const { readFileSync } = require('node:fs');
const path = require('node:path');

const { autoBindSteps, loadFeatures } = require('jest-cucumber');

const { VolcanoClient } = require('../../src/index.js');
const { ContractWorld, recordOutcome } = require('./world.js');

function absoluteEnvironmentPath(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return value;
}

const featuresPath = absoluteEnvironmentPath('VOLCANO_SDK_CONTRACT_FEATURES');
const fixturePath = absoluteEnvironmentPath('VOLCANO_SDK_CONTRACT_FIXTURE');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
const features = loadFeatures(path.join(featuresPath, '*.feature'));

let activeWorld;

function startScenario(context) {
  activeWorld = new ContractWorld(fixture);
  context.world = activeWorld;
  return activeWorld;
}

async function authenticate(world) {
  await world.authenticate();
  world.client.database(world.fixture.database_name);
}

afterEach(async () => {
  const world = activeWorld;
  activeWorld = undefined;
  await world?.cleanup();
});

autoBindSteps(features, [
  ({ given, when, then, context }) => {
    given('the confirmed contract user', () => {
      startScenario(context);
    });

    when("the client signs in with the contract user's credentials", async () => {
      const result = await context.world.client.auth.signIn({
        email: context.world.fixture.user_email,
        password: context.world.fixture.user_password,
      });
      recordOutcome(context.world, result, result.error);
    });

    then('the SDK operation succeeds', () => {
      expect(context.world.lastOutcome).toMatchObject({ ok: true });
    });

    then('the current session belongs to the contract user', () => {
      expect(context.world.lastOutcome.value.user.id).toBe(context.world.fixture.user_id);
      expect(context.world.client.currentUser.id).toBe(context.world.fixture.user_id);
    });

    then('the current session exposes access and refresh tokens', () => {
      const session = context.world.lastOutcome.value.session;
      expect(session.access_token).toEqual(expect.any(String));
      expect(session.access_token).not.toHaveLength(0);
      expect(session.refresh_token).toEqual(expect.any(String));
      expect(session.refresh_token).not.toHaveLength(0);
      expect(context.world.client.accessToken).toBe(session.access_token);
      expect(context.world.client.refreshToken).toBe(session.refresh_token);
    });

    given('a unique unconfirmed contract user', () => {
      const world = startScenario(context);
      expect(world.uniqueEmail).toMatch(/@example\.com$/);
    });

    when("the client signs up with the new user's credentials", async () => {
      const result = await context.world.client.auth.signUp({
        email: context.world.uniqueEmail,
        password: context.world.uniquePassword,
      });
      recordOutcome(context.world, result, result.error);
    });

    then('sign-up is acknowledged without a session', () => {
      expect(context.world.lastOutcome.value.session).toBeNull();
    });

    then('the current session is empty', () => {
      expect(context.world.client.accessToken).toBeNull();
      expect(context.world.client.refreshToken).toBeNull();
      expect(context.world.client.currentUser).toBeNull();
    });

    given('the client is signed in as the confirmed contract user', async () => {
      const world = startScenario(context);
      await world.authenticate();
    });

    when('the client retrieves the current user', async () => {
      const result = await context.world.client.auth.getUser();
      recordOutcome(context.world, result, result.error);
    });

    then('the current user belongs to the contract user', () => {
      expect(context.world.client.currentUser.id).toBe(context.world.fixture.user_id);
    });

    when("the client updates the current user's metadata", async () => {
      const result = await context.world.client.auth.updateUser({
        metadata: { contract_marker: context.world.metadataMarker },
      });
      recordOutcome(context.world, result, result.error);
    });

    then('the current user contains the updated metadata', () => {
      expect(context.world.client.currentUser.user_metadata.contract_marker).toBe(
        context.world.metadataMarker,
      );
    });

    when('the client refreshes the current session', async () => {
      context.world.previousAccessToken = context.world.client.accessToken;
      context.world.previousRefreshToken = context.world.client.refreshToken;
      const result = await context.world.client.auth.refreshSession();
      recordOutcome(context.world, result, result.error);
    });

    then('the current session exposes rotated access and refresh tokens', () => {
      expect(context.world.client.accessToken).toEqual(expect.any(String));
      expect(context.world.client.refreshToken).toEqual(expect.any(String));
      expect(context.world.client.accessToken).not.toBe(context.world.previousAccessToken);
      expect(context.world.client.refreshToken).not.toBe(context.world.previousRefreshToken);
    });

    when('the client refreshes with an invalid refresh token', async () => {
      context.world.client = new VolcanoClient({
        apiUrl: context.world.fixture.api_url,
        anonKey: context.world.fixture.anon_key,
        accessToken: context.world.client.accessToken,
        refreshToken: 'invalid-contract-refresh-token',
      });
      const result = await context.world.client.auth.refreshSession();
      recordOutcome(context.world, result, result.error);
    });

    then('the SDK operation fails', () => {
      expect(context.world.lastOutcome).toMatchObject({ ok: false });
    });

    when('the client signs out', async () => {
      const result = await context.world.client.auth.signOut();
      recordOutcome(context.world, result, result.error);
    });

    when('the client subscribes to auth-state changes', () => {
      context.world.unsubscribeAuth = context.world.client.auth.onAuthStateChange((user) => {
        context.world.listenerEvents.push(user?.id ?? null);
      });
    });

    then('the listener immediately observes the current user', () => {
      expect(context.world.listenerEvents).toEqual([context.world.fixture.user_id]);
    });

    then('the listener observes the signed-out state', () => {
      expect(context.world.listenerEvents.at(-1)).toBeNull();
    });

    when('the client unsubscribes from auth-state changes', () => {
      context.world.unsubscribeAuth();
      context.world.listenerEventCount = context.world.listenerEvents.length;
    });

    then('the listener receives no additional events', () => {
      expect(context.world.listenerEvents).toHaveLength(context.world.listenerEventCount);
    });

    given('a unique anonymous contract user', () => {
      const world = startScenario(context);
      expect(world.uniqueEmail).toMatch(/@example\.com$/);
    });

    when('the client signs up anonymously', async () => {
      const result = await context.world.client.auth.signUpAnonymous();
      if (!result.error) {
        context.world.anonymousUserId = result.user.id;
      }
      recordOutcome(context.world, result, result.error);
    });

    then('the current session belongs to the anonymous user', () => {
      expect(context.world.client.currentUser.id).toBe(context.world.anonymousUserId);
      expect(context.world.client.accessToken).toEqual(expect.any(String));
    });

    when('the client converts the anonymous user with credentials', async () => {
      const result = await context.world.client.auth.convertAnonymous({
        email: context.world.uniqueEmail,
        password: context.world.uniquePassword,
      });
      recordOutcome(context.world, result, result.error);
    });

    then('the converted user keeps the anonymous user identity', () => {
      expect(context.world.client.currentUser.id).toBe(context.world.anonymousUserId);
    });

    given(
      'the client is signed in as the confirmed contract user on multiple sessions',
      async () => {
        const world = startScenario(context);
        await world.authenticate();
        world.secondaryClient = new VolcanoClient({
          apiUrl: world.fixture.api_url,
          anonKey: world.fixture.anon_key,
        });
        const result = await world.secondaryClient.auth.signIn({
          email: world.fixture.user_email,
          password: world.fixture.user_password,
        });
        if (result.error) {
          throw result.error;
        }
      },
    );

    when("the client lists the current user's sessions", async () => {
      const result = await context.world.client.auth.getSessions();
      recordOutcome(context.world, result, result.error);
    });

    then('the session list contains the current session', () => {
      expect(context.world.lastOutcome.value.sessions.some((session) => session.is_current)).toBe(
        true,
      );
    });

    when('the client deletes another current-user session', async () => {
      const listed = await context.world.client.auth.getSessions();
      if (listed.error) {
        recordOutcome(context.world, listed, listed.error);
        return;
      }
      const other = listed.sessions.find((session) => !session.is_current);
      if (!other) {
        throw new Error('Another session is missing');
      }
      context.world.deletedSessionId = other.id;
      const deleted = await context.world.client.auth.deleteSession(other.id);
      if (deleted.error) {
        recordOutcome(context.world, deleted, deleted.error);
        return;
      }
      const result = await context.world.client.auth.getSessions();
      recordOutcome(context.world, result, result.error);
    });

    then('the deleted session is absent from the session list', () => {
      expect(
        context.world.lastOutcome.value.sessions.some(
          (session) => session.id === context.world.deletedSessionId,
        ),
      ).toBe(false);
    });

    when('the client deletes all current-user sessions', async () => {
      const deleted = await context.world.client.auth.deleteAllOtherSessions();
      if (deleted.error) {
        recordOutcome(context.world, deleted, deleted.error);
        return;
      }
      const result = await context.world.client.auth.signOut();
      recordOutcome(context.world, result, result.error);
    });

    given('an authenticated client', async () => {
      const world = startScenario(context);
      await authenticate(world);
    });

    when('the client selects the contract table where "slug" equals the fixture slug', async () => {
      const result = await context.world.client
        .from(context.world.fixture.table_name)
        .select('*')
        .eq('slug', context.world.fixture.fixture_row.slug);
      recordOutcome(context.world, result.data, result.error);
    });

    then('exactly the fixture row is returned', () => {
      expect(context.world.lastOutcome.value).toEqual([context.world.fixture.fixture_row]);
    });

    when('the client uploads and downloads the contract object', async () => {
      const bucket = context.world.client.storage.from(context.world.fixture.bucket_name);
      const upload = await bucket.upload(
        context.world.storagePath,
        new Blob([context.world.storageBytes], { type: 'application/octet-stream' }),
      );
      if (upload.error) {
        recordOutcome(context.world, null, upload.error);
        return;
      }
      context.world.cleanupCallbacks.push(async () => {
        const removed = await bucket.remove([context.world.storagePath]);
        if (removed.error) {
          throw removed.error;
        }
      });
      const download = await bucket.download(context.world.storagePath);
      if (download.error) {
        recordOutcome(context.world, null, download.error);
        return;
      }
      const bytes = Buffer.from(await download.data.arrayBuffer());
      recordOutcome(context.world, { bytes, path: upload.data.name }, null);
    });

    then('the downloaded bytes equal the uploaded bytes', () => {
      expect(context.world.lastOutcome.value.bytes).toEqual(context.world.storageBytes);
    });

    then('the stored object path equals the contract path', () => {
      expect(context.world.lastOutcome.value.path).toBe(context.world.storagePath);
    });

    given('a service-role client', () => {
      startScenario(context);
    });

    when('the client acquires and releases the contract lock', async () => {
      const acquired = await context.world.serviceClient.locks.acquire(context.world.lockKey, {
        ttl: 10,
      });
      if (acquired.error || !acquired.acquired) {
        recordOutcome(context.world, null, acquired.error || new Error('Lock was not acquired'));
        return;
      }
      const cleanup = context.world.registerLockCleanup(context.world.lockKey, acquired.lease);
      const released = await context.world.serviceClient.locks.release(
        context.world.lockKey,
        acquired.lease,
      );
      if (released.error) {
        recordOutcome(context.world, null, released.error);
        return;
      }
      context.world.cleanupCallbacks = context.world.cleanupCallbacks.filter(
        (callback) => callback !== cleanup,
      );
      const state = await context.world.serviceClient.locks.get(context.world.lockKey);
      recordOutcome(context.world, { lease: acquired.lease, state: state.state }, state.error);
    });

    then('the released lease is no longer held', () => {
      expect(context.world.lastOutcome.value.state.held).toBe(false);
    });

    given('two authenticated realtime clients', async () => {
      const world = startScenario(context);
      await world.createRealtimeClients();
    });

    when('one client subscribes and the other publishes the contract message', async () => {
      let timeout;
      const received = new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('Realtime message timed out')), 10000);
        context.world.subscriber.on('message', resolve);
      });
      try {
        await context.world.publisher.send(context.world.realtimeMessage);
        recordOutcome(context.world, await received, null);
      } catch (error) {
        recordOutcome(context.world, null, error);
      } finally {
        clearTimeout(timeout);
      }
    });

    then('the subscriber receives the contract message within 10 seconds', () => {
      expect(context.world.lastOutcome.value).toEqual(context.world.realtimeMessage);
    });
  },
]);
