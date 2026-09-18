const { randomUUID } = require('node:crypto');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const { autoBindSteps, loadFeatures } = require('jest-cucumber');

const { VolcanoClient } = require('../../src/index.js');
const { ContractWorld, recordOutcome } = require('./world.js');
const { verifyBroadcastPause } = require('./broadcast-pause.js');
const { LogContract } = require('./logs.js');
const { verifyPresenceMembership } = require('./presence-membership.js');
const { verifyPostgresChanges } = require('./postgres-changes.js');

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
const ACCESS_TOKEN_CLOCK_TICK_MS = 1_100;
const REJECTED_ACCESS_TOKEN = 'sdk-contract-rejected-access-token';

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

function registerDatabaseCleanup(world, operation) {
  world.cleanupCallbacks.push(async () => {
    const result = await operation();
    if (result.error) {
      throw result.error;
    }
  });
}

function queryFixture(world) {
  return world.client.from(world.fixture.query_table_name).select('slug').order('rank');
}

async function recordQuerySet(world, queries) {
  const rows = new Map();
  for (const [name, query] of Object.entries(queries)) {
    const result = await query;
    if (result.error) {
      recordOutcome(world, null, result.error);
      return;
    }
    rows.set(name, result.data);
  }
  recordOutcome(world, Object.fromEntries(rows), null);
}

function storageData(result) {
  if (result.error) throw result.error;
  return result.data;
}

function storageBucket(world) {
  return world.client.storage.from(world.fixture.bucket_name);
}

async function cleanStorageObject(world) {
  const bucket = storageBucket(world);
  const objects = storageData(await bucket.list(world.storagePath));
  if (objects.some(({ name }) => name === world.storagePath)) {
    storageData(await bucket.remove([world.storagePath]));
  }
}

async function partialUpload(world) {
  const bucket = storageBucket(world);
  const bytes = Buffer.concat([Buffer.alloc(5 * 1024 * 1024, 'x'), world.storageBytes]);
  const session = storageData(
    await bucket.createUploadSession(world.storagePath, {
      totalSize: bytes.length,
      partSize: 5 * 1024 * 1024,
      contentType: 'application/octet-stream',
    }),
  );
  world.cleanupCallbacks.push(async () => {
    const result = await bucket.abortUploadSession(world.storagePath, session.session_id);
    if (result.error && result.error.status !== 404) throw result.error;
  });
  world.cleanupCallbacks.push(() => cleanStorageObject(world));
  const part = storageData(
    await bucket.uploadPart(
      world.storagePath,
      session.session_id,
      1,
      new Blob([bytes.subarray(0, session.part_size)]),
    ),
  );
  return { session, part, bytes };
}

async function recordStorage(world, operation) {
  try {
    recordOutcome(world, await operation(), null);
  } catch (error) {
    recordOutcome(world, null, error);
  }
}

afterEach(async () => {
  const world = activeWorld;
  activeWorld = undefined;
  await world?.cleanup();
});

autoBindSteps(features, [
  ({ given, when, then, context }) => {
    given('a read-only project logs client', () => {
      const world = startScenario(context);
      world.logsContract = new LogContract(world);
    });
    when('the contract function emits three unique structured log events', async () => {
      await context.world.logsContract.emit(3);
    });
    when('the contract function emits one unique structured log event', async () => {
      await context.world.logsContract.emit(1);
    });
    when('the client searches and paginates those events within 240 seconds', async () => {
      const world = context.world;
      try {
        recordOutcome(world, await world.logsContract.search(), null);
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });
    when('the client reads matching log activity within 120 seconds', async () => {
      const world = context.world;
      try {
        recordOutcome(world, await world.logsContract.activity(), null);
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });
    then('all three structured events retain their metadata without duplicates', () => {
      context.world.logsContract.verifyEvents(context.world.lastOutcome.value);
    });
    then('activity counts exactly that event in its function and level buckets', () => {
      context.world.logsContract.verifyActivity(context.world.lastOutcome.value);
    });
    when('one presence client joins and leaves while the other remains subscribed', async () => {
      const world = context.world;
      recordOutcome(world, await verifyPresenceMembership(world), null);
    });
    then(
      'both rosters identify the contract user and the original handler observes membership changes',
      () => {
        expect(context.world.lastOutcome.value).toEqual([1, 2, 1]);
      },
    );
    when('the clients observe an inserted and updated contract row', async () => {
      const world = context.world;
      recordOutcome(world, await verifyPostgresChanges(world), null);
    });
    then('automatic and lightweight notifications retain metadata and row identity', () => {
      expect(context.world.lastOutcome.value).toEqual(['INSERT', 'UPDATE']);
    });
    given('the client replaces its access token with a rejected token', async () => {
      const { data, error } = await context.world.client.auth.getSession();
      if (error) throw error;
      const parts = data.session.access_token.split('.');
      expect(parts).toHaveLength(3);
      const adopted = await context.world.client.auth.setSession({
        ...data.session,
        access_token: `${parts[0]}.${parts[1]}.sdk-contract-rejected-signature`,
      });
      if (adopted.error) throw adopted.error;
      context.world.previousSession = adopted.data.session;
    });

    for (const operation of [
      'database read',
      'storage operation',
      'profile read',
      'session list',
      'function invocation',
    ]) {
      then(`the ${operation} replaces the rejected token for the same user`, async () => {
        const { data, error } = await context.world.client.auth.getSession();
        expect(error).toBeNull();
        expect(data.session.access_token).toBeTruthy();
        expect(data.session.access_token).not.toBe(context.world.previousSession.access_token);
        expect(data.session.refresh_token).toBeTruthy();
        expect(data.session.user.id).toBe(context.world.fixture.user_id);
      });
    }

    when(
      'one client pauses delivery for 1 second and then resumes with the same handler',
      async () => {
        try {
          recordOutcome(context.world, await verifyBroadcastPause(context.world), null);
        } catch (error) {
          recordOutcome(context.world, null, error);
        }
      },
    );

    when('the client lists its server sessions', async () => {
      const world = context.world;
      const result = await world.client.auth.getSessions({ page: 1, limit: 100 });
      recordOutcome(world, result, result.error);
    });

    then('the session list contains the current session for the contract user', () => {
      const world = context.world;
      const page = world.lastOutcome.value;
      expect(page.page).toBe(1);
      expect(page.sessions.length).toBeGreaterThan(0);
      expect(page.total).toBeGreaterThanOrEqual(page.sessions.length);
      expect(page.sessions.every((session) => session.user_id === world.fixture.user_id)).toBe(
        true,
      );
      expect(page.sessions.filter((session) => session.is_current)).toHaveLength(1);
    });

    when('the client loads its server-validated profile', async () => {
      const result = await context.world.client.auth.getUser();
      recordOutcome(context.world, result.user, result.error);
    });

    then('the returned and cached profiles belong to the contract user', () => {
      expect(context.world.lastOutcome.value.id).toBe(context.world.fixture.user_id);
      expect(context.world.client.currentUser.id).toBe(context.world.fixture.user_id);
    });

    given('the confirmed contract user', () => {
      startScenario(context);
    });

    given('the client listens for auth state changes', () => {
      const { world } = context;
      const unsubscribe = world.client.auth.onAuthStateChange((user) => {
        world.authStateUsers.push(user);
      });
      world.cleanupCallbacks.push(unsubscribe);
    });

    when("the client signs in with the contract user's credentials", async () => {
      const result = await context.world.client.auth.signIn({
        email: context.world.fixture.user_email,
        password: context.world.fixture.user_password,
      });
      recordOutcome(context.world, result, result.error);
    });

    when('the client reads the current session', async () => {
      const result = await context.world.client.auth.getSession();
      const session = result.data.session;
      recordOutcome(context.world, { session, user: session?.user ?? null }, result.error);
    });

    when('a fresh client adopts the current session', async () => {
      const source = await context.world.client.auth.getSession();
      const target = new VolcanoClient({
        apiUrl: context.world.fixture.api_url,
        anonKey: context.world.fixture.anon_key,
      });
      const result = await target.auth.setSession(source.data.session);
      const session = result.data.session;
      context.world.client = target;
      recordOutcome(context.world, { session, user: session?.user ?? null }, result.error);
    });

    when('the client refreshes the current session', async () => {
      const before = await context.world.client.auth.getSession();
      context.world.previousSession = before.data.session;
      await new Promise((resolve) => setTimeout(resolve, ACCESS_TOKEN_CLOCK_TICK_MS));
      const refreshed = await context.world.client.auth.refreshSession();
      if (refreshed.error) {
        recordOutcome(context.world, null, refreshed.error);
        return;
      }
      context.world.refreshedSession = refreshed.session;
      const current = await context.world.client.auth.getSession();
      const session = current.data.session;
      recordOutcome(context.world, { session, user: session?.user ?? null }, current.error);
    });

    when(
      'a fresh client tries to refresh a supplied profile without a session identifier',
      async () => {
        const world = context.world;
        const source = await world.client.auth.getSession();
        if (source.error) throw source.error;
        const target = new VolcanoClient({
          apiUrl: world.fixture.api_url,
          anonKey: world.fixture.anon_key,
        });
        const supplied = { ...source.data.session, access_token: REJECTED_ACCESS_TOKEN };
        const adopted = await target.auth.setSession(supplied);
        if (adopted.error) throw adopted.error;
        const result = await target.auth.refreshSession();
        recordOutcome(world, result.session, result.error);
        expect((await target.auth.getSession()).data.session).toEqual(supplied);
      },
    );

    when('a fresh client starts with only the current access token', async () => {
      const world = context.world;
      const source = world.client;
      const current = await source.auth.getSession();
      if (current.error) throw current.error;
      world.previousSession = current.data.session;
      world.bootstrapCleanup = async () => {
        const result = await source.auth.signOut();
        if (result.error) throw result.error;
      };
      world.cleanupCallbacks.push(world.bootstrapCleanup);
      world.client = new VolcanoClient({
        apiUrl: world.fixture.api_url,
        anonKey: world.fixture.anon_key,
        accessToken: world.previousSession.access_token,
      });
      const result = await world.client.auth.getSession();
      recordOutcome(world, result.data.session, result.error);
    });

    then('the token-only session has no cached user', async () => {
      const result = await context.world.client.auth.getSession();
      expect(result.error).toBeNull();
      expect(result.data.session.user).toBeNull();
    });

    when('a fresh client starts with a rejected access token', async () => {
      const world = context.world;
      world.client = new VolcanoClient({
        apiUrl: world.fixture.api_url,
        anonKey: world.fixture.anon_key,
        accessToken: REJECTED_ACCESS_TOKEN,
      });
      const result = await world.client.auth.getSession();
      world.previousSession = result.data.session;
      recordOutcome(world, result.data.session, result.error);
    });

    then('the session retains only the supplied access token', async () => {
      const world = context.world;
      const result = await world.client.auth.getSession();
      expect(result.error).toBeNull();
      expect(result.data.session.access_token).toBe(world.previousSession.access_token);
      expect(result.data.session.refresh_token).toBeNull();
    });

    then('the refreshed session becomes current', () => {
      expect(context.world.refreshedSession).not.toBe(context.world.previousSession);
      expect(context.world.refreshedSession.access_token).not.toBe(
        context.world.previousSession.access_token,
      );
      expect(context.world.lastOutcome.value.session).toMatchObject({
        access_token: context.world.refreshedSession.access_token,
        refresh_token: context.world.refreshedSession.refresh_token,
      });
    });

    when('the client signs out', async () => {
      const current = await context.world.client.auth.getSession();
      context.world.signedOutSession = current.data.session;
      const result = await context.world.client.auth.signOut();
      recordOutcome(context.world, null, result.error);
      if (!result.error && context.world.bootstrapCleanup) {
        const world = context.world;
        world.cleanupCallbacks = world.cleanupCallbacks.filter(
          (callback) => callback !== world.bootstrapCleanup,
        );
        world.bootstrapCleanup = null;
      }
    });

    then('the current session is empty', async () => {
      const current = await context.world.client.auth.getSession();
      expect(current).toEqual({ data: { session: null }, error: null });
    });

    when('a fresh client loads a profile with the signed-out access token', async () => {
      const world = context.world;
      const target = new VolcanoClient({
        apiUrl: world.fixture.api_url,
        anonKey: world.fixture.anon_key,
        accessToken: world.signedOutSession.access_token,
      });
      const result = await target.auth.getUser();
      recordOutcome(world, result.user, result.error);
    });

    when('a fresh client tries to refresh the signed-out session', async () => {
      const target = new VolcanoClient({
        apiUrl: context.world.fixture.api_url,
        anonKey: context.world.fixture.anon_key,
      });
      await target.auth.setSession(context.world.signedOutSession);
      context.world.client = target;
      const result = await target.auth.refreshSession();
      recordOutcome(context.world, null, result.error);
    });

    then('the SDK operation fails with an authentication error', () => {
      expect(context.world.lastOutcome).toEqual({
        ok: false,
        category: 'authentication error',
      });
    });

    then('the SDK operation succeeds', () => {
      expect(context.world.lastOutcome).toMatchObject({ ok: true });
    });

    then('the SDK operation fails', () => {
      expect(context.world.lastOutcome).toMatchObject({ ok: false });
    });

    then('the current session belongs to the contract user', () => {
      expect(context.world.lastOutcome.value.user.id).toBe(context.world.fixture.user_id);
      expect(context.world.client.currentUser.id).toBe(context.world.fixture.user_id);
    });

    then('the auth-state listener observes the signed-in contract user', () => {
      expect(context.world.authStateUsers).toContainEqual(
        expect.objectContaining({ id: context.world.fixture.user_id }),
      );
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

    when('the client selects a projected page of query fixture members', async () => {
      const { world } = context;
      const result = await world.client
        .from(world.fixture.query_table_name)
        .select('slug,rank')
        .in('slug', ['alpha', 'beta', 'gamma', 'delta'])
        .order('enabled')
        .order('rank', { ascending: false })
        .offset(1)
        .limit(2);
      recordOutcome(world, result.data, result.error);
    });

    then('the projected page contains only beta and gamma in that order', () => {
      expect(context.world.lastOutcome.value).toEqual([
        { slug: 'beta', rank: 20 },
        { slug: 'gamma', rank: 30 },
      ]);
    });

    when('the client selects query fixture rows with each comparison filter', async () => {
      const { world } = context;
      await recordQuerySet(world, {
        neq: queryFixture(world).neq('rank', 20),
        gt: queryFixture(world).gt('rank', 20),
        gte: queryFixture(world).gte('rank', 20),
        lt: queryFixture(world).lt('rank', 30),
        lte: queryFixture(world).lte('rank', 30),
      });
    });

    then('each comparison returns exactly the matching query fixture rows', () => {
      const expected = {
        neq: ['alpha', 'gamma', 'delta', 'epsilon'],
        gt: ['gamma', 'delta', 'epsilon'],
        gte: ['beta', 'gamma', 'delta', 'epsilon'],
        lt: ['alpha', 'beta'],
        lte: ['alpha', 'beta', 'gamma'],
      };
      expect(context.world.lastOutcome.value).toEqual(
        Object.fromEntries(
          Object.entries(expected).map(([name, slugs]) => [name, slugs.map((slug) => ({ slug }))]),
        ),
      );
    });

    when(
      'the client selects query fixture rows with case-sensitive and insensitive patterns',
      async () => {
        const { world } = context;
        await recordQuerySet(world, {
          like: queryFixture(world).like('label', 'Case_%'),
          ilike: queryFixture(world).ilike('label', 'case_%'),
        });
      },
    );

    then('each pattern returns exactly the matching query fixture rows', () => {
      expect(context.world.lastOutcome.value).toEqual({
        like: [{ slug: 'alpha' }, { slug: 'epsilon' }],
        ilike: [{ slug: 'alpha' }, { slug: 'beta' }, { slug: 'epsilon' }],
      });
    });

    when('the client selects query fixture rows with null and boolean filters', async () => {
      const { world } = context;
      await recordQuerySet(world, {
        null: queryFixture(world).is('label', null),
        enabled: queryFixture(world).is('enabled', true),
        disabled: queryFixture(world).is('enabled', false),
      });
    });

    then('each identity filter returns exactly the matching query fixture rows', () => {
      expect(context.world.lastOutcome.value).toEqual({
        null: [{ slug: 'gamma' }],
        enabled: [{ slug: 'alpha' }, { slug: 'gamma' }, { slug: 'epsilon' }],
        disabled: [{ slug: 'beta' }, { slug: 'delta' }],
      });
    });

    when('the client inserts its contract row', async () => {
      const row = context.world.fixture.mutation_rows.insert;
      registerDatabaseCleanup(context.world, () =>
        context.world.client.delete(context.world.fixture.table_name).eq('slug', row.slug),
      );
      const result = await context.world.client.insert(context.world.fixture.table_name, row);
      recordOutcome(context.world, result.data, result.error);
    });

    then('exactly the inserted contract row is returned', () => {
      const row = context.world.fixture.mutation_rows.insert;
      expect(context.world.lastOutcome.value).toEqual([row]);
    });

    when('the client updates its contract row', async () => {
      const row = context.world.fixture.mutation_rows.update;
      registerDatabaseCleanup(context.world, () =>
        context.world.client
          .update(context.world.fixture.table_name, { value: row.before.value })
          .eq('slug', row.before.slug),
      );
      const result = await context.world.client
        .update(context.world.fixture.table_name, { value: row.after.value })
        .eq('slug', row.before.slug);
      recordOutcome(context.world, result.data, result.error);
    });

    then('exactly the updated contract row is returned', () => {
      const row = context.world.fixture.mutation_rows.update.after;
      expect(context.world.lastOutcome.value).toEqual([row]);
    });

    when('the client deletes its contract row', async () => {
      const row = context.world.fixture.mutation_rows.delete;
      registerDatabaseCleanup(context.world, async () => {
        const removed = await context.world.client
          .delete(context.world.fixture.table_name)
          .eq('slug', row.slug);
        return removed.error
          ? removed
          : context.world.client.insert(context.world.fixture.table_name, row);
      });
      const result = await context.world.client
        .delete(context.world.fixture.table_name)
        .eq('slug', row.slug);
      recordOutcome(context.world, result.data, result.error);
    });

    then('exactly the deleted contract row is returned', () => {
      const row = context.world.fixture.mutation_rows.delete;
      expect(context.world.lastOutcome.value).toEqual([row]);
    });

    when('the client updates a missing contract row', async () => {
      const { world } = context;
      const result = await world.client
        .update(world.fixture.table_name, { value: 'must-not-be-written' })
        .eq('slug', `${world.fixture.fixture_row.slug}-missing`);
      recordOutcome(world, result.data, result.error);
    });

    when('the client deletes a missing contract row', async () => {
      const { world } = context;
      const result = await world.client
        .delete(world.fixture.table_name)
        .eq('slug', `${world.fixture.fixture_row.slug}-missing`);
      recordOutcome(world, result.data, result.error);
    });

    then('the mutation returns an empty row list', () => {
      expect(context.world.lastOutcome.value).toEqual([]);
    });

    then('the existing contract row is unchanged', async () => {
      const { world } = context;
      const result = await world.client
        .from(world.fixture.table_name)
        .select('*')
        .eq('slug', world.fixture.fixture_row.slug);
      expect(result.error).toBeNull();
      expect(result.data).toEqual([world.fixture.fixture_row]);
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

    when(
      'the client uploads the contract object as text/plain and reads its stored metadata',
      async () => {
        const { world } = context;
        const bucket = world.client.storage.from(world.fixture.bucket_name);
        try {
          const upload = await bucket.upload(world.storagePath, new Blob([world.storageBytes]), {
            contentType: 'text/plain',
          });
          if (upload.error) throw upload.error;
          world.cleanupCallbacks.push(async () => {
            const removed = await bucket.remove([world.storagePath]);
            if (removed.error) throw removed.error;
          });
          const listed = await bucket.list(world.storagePath);
          if (listed.error) throw listed.error;
          const downloaded = await bucket.download(world.storagePath);
          if (downloaded.error) throw downloaded.error;
          recordOutcome(
            world,
            {
              path: upload.data.name,
              bytes: Buffer.from(await downloaded.data.arrayBuffer()),
              contentType: upload.data.mime_type,
              listed: listed.data.map(({ name, mime_type }) => ({ name, mime_type })),
            },
            null,
          );
        } catch (error) {
          recordOutcome(world, null, error);
        }
      },
    );

    then('the uploaded and listed object content types are text/plain', () => {
      const { world } = context;
      expect(world.lastOutcome.value.contentType).toBe('text/plain');
      expect(world.lastOutcome.value.listed).toEqual([
        { name: world.storagePath, mime_type: 'text/plain' },
      ]);
    });

    when('the client uploads the contract object and downloads bytes 2 through 7', async () => {
      const { world } = context;
      const bucket = world.client.storage.from(world.fixture.bucket_name);
      try {
        const upload = await bucket.upload(world.storagePath, new Blob([world.storageBytes]));
        if (upload.error) throw upload.error;
        world.cleanupCallbacks.push(async () => {
          const removed = await bucket.remove([world.storagePath]);
          if (removed.error) throw removed.error;
        });
        const download = await bucket.download(world.storagePath, { range: 'bytes=2-7' });
        if (download.error) throw download.error;
        recordOutcome(
          world,
          { bytes: Buffer.from(await download.data.arrayBuffer()), path: upload.data.name },
          null,
        );
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });

    then('the downloaded bytes equal uploaded bytes 2 through 7 inclusive', () => {
      expect(context.world.lastOutcome.value.bytes).toEqual(
        context.world.storageBytes.subarray(2, 8),
      );
    });

    when('the client copies, moves, and removes a copy of the contract object', async () => {
      const { world } = context;
      const bucket = world.client.storage.from(world.fixture.bucket_name);
      const source = world.storagePath;
      const copied = `${source}.copy`;
      const moved = `${source}.moved`;
      world.cleanupCallbacks.push(async () => {
        const listed = await bucket.list(source);
        if (listed.error) throw listed.error;
        const paths = listed.data
          .map(({ name }) => name)
          .filter((name) => [source, copied, moved].includes(name));
        const removed = await bucket.remove(paths);
        if (removed.error) throw removed.error;
      });
      try {
        const upload = await bucket.upload(source, new Blob([world.storageBytes]));
        if (upload.error) throw upload.error;
        const copy = await bucket.copy(source, copied);
        if (copy.error) throw copy.error;
        const originalDownload = await bucket.download(source);
        if (originalDownload.error) throw originalDownload.error;
        const copiedDownload = await bucket.download(copied);
        if (copiedDownload.error) throw copiedDownload.error;
        const move = await bucket.move(copied, moved);
        if (move.error) throw move.error;
        const movedDownload = await bucket.download(moved);
        if (movedDownload.error) throw movedDownload.error;
        const afterMove = await bucket.list(source);
        if (afterMove.error) throw afterMove.error;
        const removed = await bucket.remove([moved]);
        if (removed.error) throw removed.error;
        const afterRemove = await bucket.list(source);
        if (afterRemove.error) throw afterRemove.error;
        const remainingDownload = await bucket.download(source);
        if (remainingDownload.error) throw remainingDownload.error;
        recordOutcome(
          world,
          {
            bytes: await Promise.all(
              [originalDownload, copiedDownload, movedDownload, remainingDownload].map(
                async (result) => Buffer.from(await result.data.arrayBuffer()),
              ),
            ),
            afterMove: afterMove.data.map(({ name }) => name).sort(),
            afterRemove: afterRemove.data.map(({ name }) => name).sort(),
          },
          null,
        );
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });

    then('the original, copied, and moved bytes equal the uploaded bytes', () => {
      for (const bytes of context.world.lastOutcome.value.bytes) {
        expect(bytes).toEqual(context.world.storageBytes);
      }
    });

    then('moving the copy leaves only the original and moved paths', () => {
      const source = context.world.storagePath;
      expect(context.world.lastOutcome.value.afterMove).toEqual([source, `${source}.moved`].sort());
    });

    then('removing the moved object leaves the original unchanged', () => {
      expect(context.world.lastOutcome.value.afterRemove).toEqual([context.world.storagePath]);
      expect(context.world.lastOutcome.value.bytes[3]).toEqual(context.world.storageBytes);
    });

    when('the client uploads one part and resumes the contract upload', async () => {
      const { world } = context;
      await recordStorage(world, async () => {
        const value = await partialUpload(world);
        const bucket = storageBucket(world);
        const { session } = value;
        value.progress = storageData(
          await bucket.getUploadSession(world.storagePath, session.session_id),
        );
        storageData(
          await bucket.uploadPart(
            world.storagePath,
            session.session_id,
            2,
            new Blob([value.bytes.subarray(session.part_size)]),
          ),
        );
        value.object = storageData(
          await bucket.completeUploadSession(world.storagePath, session.session_id),
        ).object;
        value.download = Buffer.from(
          await storageData(await bucket.download(world.storagePath)).arrayBuffer(),
        );
        return value;
      });
    });

    then('upload progress describes exactly the first uploaded part', () => {
      const { world } = context;
      const { progress, session, part, bytes } = world.lastOutcome.value;
      expect(progress).toMatchObject({
        session_id: session.session_id,
        path: world.storagePath,
        content_type: 'application/octet-stream',
        status: 'uploading',
        total_size: bytes.length,
        part_size: 5 * 1024 * 1024,
        total_parts: 2,
        parts_uploaded: 1,
        bytes_uploaded: 5 * 1024 * 1024,
      });
      expect(session).toMatchObject({ part_size: 5 * 1024 * 1024, total_parts: 2 });
      expect(part).toMatchObject({ part_number: 1, size: session.part_size });
      expect(part.etag).toBeTruthy();
      expect(progress.parts).toHaveLength(1);
      expect(progress.parts[0]).toMatchObject(part);
    });

    then('the completed multipart object preserves its path, type, and bytes', () => {
      const { world } = context;
      const value = world.lastOutcome.value;
      expect(value.object).toMatchObject({
        name: world.storagePath,
        mime_type: 'application/octet-stream',
        size: value.bytes.length,
      });
      expect(value.download).toEqual(value.bytes);
    });

    when('the client uploads one part and aborts the contract upload', async () => {
      const { world } = context;
      await recordStorage(world, async () => {
        const { session } = await partialUpload(world);
        const bucket = storageBucket(world);
        storageData(await bucket.abortUploadSession(world.storagePath, session.session_id));
        const status = await bucket.getUploadSession(world.storagePath, session.session_id);
        const object = await bucket.download(world.storagePath);
        return { session: status.error?.status, object: object.error?.status };
      });
    });

    then('the aborted session and unfinished object are not found', () => {
      expect(context.world.lastOutcome.value).toEqual({ session: 404, object: 404 });
    });

    when('the client makes the contract object public and private again', async () => {
      const { world } = context;
      await recordStorage(world, async () => {
        const bucket = storageBucket(world);
        world.cleanupCallbacks.push(() => cleanStorageObject(world));
        storageData(await bucket.upload(world.storagePath, new Blob([world.storageBytes])));
        const { publicUrl } = storageData(bucket.getPublicUrl(world.storagePath));
        const anonymousRead = () => fetch(publicUrl, { signal: AbortSignal.timeout(10_000) });
        const before = await anonymousRead();
        const beforeBytes = Buffer.from(await before.arrayBuffer());
        const publicObject = storageData(await bucket.updateVisibility(world.storagePath, true));
        const visible = await anonymousRead();
        const bytes = Buffer.from(await visible.arrayBuffer());
        const privateObject = storageData(await bucket.updateVisibility(world.storagePath, false));
        const after = await anonymousRead();
        const afterBytes = Buffer.from(await after.arrayBuffer());
        return {
          statuses: [before.status, visible.status, after.status],
          bytes,
          visibility: [publicObject.is_public, privateObject.is_public],
          privateBytes: [beforeBytes, afterBytes],
        };
      });
    });

    then('anonymous reads return the original bytes only while the object is public', () => {
      const { privateBytes, ...visible } = context.world.lastOutcome.value;
      for (const bytes of privateBytes) {
        expect(bytes.includes(context.world.storageBytes)).toBe(false);
      }
      expect(visible).toEqual({
        statuses: [404, 200, 404],
        bytes: context.world.storageBytes,
        visibility: [true, false],
      });
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

    when('the client recovers the contract lock with caller-owned tokens', async () => {
      const world = context.world;
      const locks = world.serviceClient.locks;
      const options = { ttl: 30, token: randomUUID(), requestId: randomUUID() };
      const acquired = await locks.acquire(world.lockKey, options);
      if (!acquired.acquired || acquired.error)
        throw acquired.error || new Error('Lock not acquired');
      const cleanup = world.registerLockCleanup(world.lockKey, acquired.lease);
      const recovered = await locks.acquire(world.lockKey, options);
      if (!recovered.acquired || recovered.error)
        throw recovered.error || new Error('Lock not recovered');
      const held = await locks.get(world.lockKey, { requestId: randomUUID() });
      if (held.error) throw held.error;
      const renewed = await locks.renew(world.lockKey, recovered.lease, {
        ttl: 60,
        requestId: randomUUID(),
      });
      if (renewed.error) throw renewed.error;
      const released = await locks.release(world.lockKey, renewed.lease, {
        requestId: randomUUID(),
      });
      if (released.error) throw released.error;
      const available = await locks.get(world.lockKey, { requestId: randomUUID() });
      recordOutcome(
        world,
        {
          token: options.token,
          cleanup,
          acquired: acquired.lease,
          recovered: recovered.lease,
          held: held.state,
          renewed: renewed.lease,
          available: available.state,
        },
        available.error,
      );
    });

    then('recovery and renewal preserve the held lease until release', () => {
      const value = context.world.lastOutcome.value;
      expect(value.held.held).toBe(true);
      expect(value.available.held).toBe(false);
      const world = context.world;
      world.cleanupCallbacks = world.cleanupCallbacks.filter(
        (callback) => callback !== value.cleanup,
      );
      expect(value.acquired.token).toBe(value.token);
      expect(value.acquired.token).toBe(value.recovered.token);
      expect(value.acquired.token).toBe(value.renewed.token);
      expect(value.acquired.fencingToken).not.toBeNull();
      expect([
        value.recovered.fencingToken,
        value.held.fencingToken,
        value.renewed.fencingToken,
      ]).toEqual(Array(3).fill(value.acquired.fencingToken));
    });

    when('the client acquires and force releases the contract lock', async () => {
      const world = context.world;
      const acquired = await world.serviceClient.locks.acquire(world.lockKey, { ttl: 30 });
      if (!acquired.acquired || acquired.error)
        throw acquired.error || new Error('Lock not acquired');
      const cleanup = world.registerLockCleanup(world.lockKey, acquired.lease);
      const released = await world.serviceClient.locks.forceRelease(world.lockKey, {
        requestId: randomUUID(),
      });
      if (released.error) throw released.error;
      const available = await world.serviceClient.locks.get(world.lockKey);
      recordOutcome(
        world,
        { lease: acquired.lease, cleanup, available: available.state },
        available.error,
      );
    });

    then('the force-released lock is available', () => {
      const world = context.world;
      const value = world.lastOutcome.value;
      expect(value.available.held).toBe(false);
      world.cleanupCallbacks = world.cleanupCallbacks.filter(
        (callback) => callback !== value.cleanup,
      );
    });

    when('the client reacquires the force-released contract lock', async () => {
      const world = context.world;
      const original = world.lastOutcome.value.lease;
      const acquired = await world.serviceClient.locks.acquire(world.lockKey, { ttl: 30 });
      if (!acquired.acquired || acquired.error)
        throw acquired.error || new Error('Lock not acquired');
      world.registerLockCleanup(world.lockKey, acquired.lease);
      recordOutcome(world, { original, replacement: acquired.lease }, null);
    });

    then('the replacement owner receives a higher fencing token', () => {
      const { original, replacement } = context.world.lastOutcome.value;
      expect(replacement.token).not.toBe(original.token);
      expect(original.fencingToken).not.toBeNull();
      expect(replacement.fencingToken).toBeGreaterThan(original.fencingToken);
    });

    when('the authenticated client invokes the contract function by name', async () => {
      const result = await context.world.client.functions.invoke(context.world.functionName, {
        value: 'contract',
      });
      recordOutcome(context.world, result, result.error);
    });

    when('the client invokes the contract function by name', async () => {
      const result = await context.world.serviceClient.functions.invoke(
        context.world.functionName,
        { value: 'contract' },
      );
      recordOutcome(context.world, result, result.error);
    });

    // The function is reachable only at the endpoint the platform resolved, on
    // a domain the API URL does not name, so an echo coming back is what proves
    // the SDK sent the request there rather than somewhere it guessed.
    then('the function echoes the payload', () => {
      const response = context.world.lastOutcome.value;
      expect(response.status).toBe(200);
      expect(response.data).toEqual({ echoed: 'contract' });
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
