import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { autoBindSteps, loadFeatures } from 'jest-cucumber';
import {
  type CompleteSession,
  type CurrentSession,
  type ProjectLockAcquireResult,
  type ProjectLockLease,
  VolcanoClient,
} from '../../src/index.js';
import { verifyBroadcastPause } from './broadcast-pause.ts';
import { verifyPostgresChanges } from './postgres-changes.ts';
import { verifyPresenceMembership } from './presence-membership.ts';
import {
  type ContractFixture,
  ContractWorld,
  recordOutcome,
  requireSuccessfulOutcome,
  TERMINAL_DURABLE_STATUSES,
} from './world.ts';

function absoluteEnvironmentPath(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required`);
  }
  if (!path.isAbsolute(value)) {
    throw new Error(`${name} must be an absolute path`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContractRow(value: unknown): value is { slug: string; value: string } {
  return isRecord(value) && typeof value['slug'] === 'string' && typeof value['value'] === 'string';
}

function hasStringFields(value: Record<string, unknown>): boolean {
  const stringFields = [
    'api_url',
    'anon_key',
    'service_key',
    'platform_token',
    'project_id',
    'user_id',
    'user_email',
    'user_password',
    'storage_path',
    'realtime_channel',
    'lock_key',
    'function_name',
    'durable_function_name',
    'database_name',
    'realtime_table_name',
    'bucket_name',
    'function_id',
    'logs_access_token',
    'table_name',
    'query_table_name',
  ];
  return stringFields.every((field) => typeof value[field] === 'string');
}

function hasMutationRows(value: Record<string, unknown>): boolean {
  const rows = value['mutation_rows'];
  if (!isRecord(rows)) {
    return false;
  }
  const update = rows['update'];
  return (
    isContractRow(value['fixture_row']) &&
    isContractRow(rows['insert']) &&
    isContractRow(rows['delete']) &&
    isContractUpdate(update)
  );
}

function isContractUpdate(value: unknown): boolean {
  return isRecord(value) && isContractRow(value['before']) && isContractRow(value['after']);
}

function isContractFixture(value: unknown): value is ContractFixture {
  return isRecord(value) && hasStringFields(value) && hasMutationRows(value);
}

const featuresPath = absoluteEnvironmentPath('VOLCANO_SDK_CONTRACT_FEATURES');
const fixturePath = absoluteEnvironmentPath('VOLCANO_SDK_CONTRACT_FIXTURE');
const parsedFixture: unknown = JSON.parse(readFileSync(fixturePath, 'utf8'));
if (!isContractFixture(parsedFixture)) {
  throw new Error('SDK contract fixture is malformed');
}
const fixture = parsedFixture;
const features = loadFeatures(path.join(featuresPath, '*.feature'));
test('the shared contract suite discovers scenarios', () => {
  expect(features.length).toBeGreaterThan(0);
});
const ACCESS_TOKEN_CLOCK_TICK_MS = 1_100;
const REJECTED_ACCESS_TOKEN = 'sdk-contract-rejected-access-token';

interface ScenarioContext {
  world: ContractWorld;
}

type ContractQuery = ReturnType<VolcanoClient['from']>;
type QueryResult = Awaited<ReturnType<ContractQuery['execute']>>;
type StorageBucket = ReturnType<VolcanoClient['storage']['from']>;

function requireSession(session: CurrentSession | null): CurrentSession {
  if (session === null) {
    throw new Error('Current session was empty');
  }
  return session;
}

function requireCompleteSession(session: CurrentSession | null): CompleteSession {
  const current = requireSession(session);
  if (
    current.refresh_token === null ||
    current.refresh_token.length === 0 ||
    current.user === null
  ) {
    throw new Error('Current session is missing its refresh token or user');
  }
  return { ...current, refresh_token: current.refresh_token, user: current.user };
}

function requirePresent<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} was absent`);
  }
  return value;
}

function requireAcquiredLease(result: ProjectLockAcquireResult, label: string): ProjectLockLease {
  if (result.error !== null) {
    throw result.error;
  }
  if (!result.acquired) {
    throw new Error(`${label} was not acquired`);
  }
  return requirePresent(result.lease, label);
}

function requireNoError(result: { error: Error | null }): void {
  if (result.error !== null) {
    throw result.error;
  }
}

let activeWorld: ContractWorld | undefined;

function startScenario(context: ScenarioContext): ContractWorld {
  activeWorld = new ContractWorld(fixture);
  context.world = activeWorld;
  return activeWorld;
}

async function authenticate(world: ContractWorld): Promise<void> {
  await world.authenticate();
  world.client.database(world.fixture.database_name);
}

function registerDatabaseCleanup(
  world: ContractWorld,
  operation: () => PromiseLike<{ error: Error | null }>,
): void {
  world.cleanupCallbacks.push(async () => {
    const result = await operation();
    if (result.error !== null) {
      throw result.error;
    }
  });
}

function queryFixture(world: ContractWorld): ContractQuery {
  return world.client.from(world.fixture.query_table_name).select('slug').order('rank');
}

async function recordQuerySet(
  world: ContractWorld,
  queries: Record<string, PromiseLike<QueryResult>>,
): Promise<void> {
  const rows = new Map<string, QueryResult['data']>();
  for (const [name, query] of Object.entries(queries)) {
    const result = await query;
    if (result.error !== null) {
      recordOutcome(world, null, result.error);
      return;
    }
    rows.set(name, result.data);
  }
  recordOutcome(world, Object.fromEntries(rows), null);
}

function storageData<T>(result: { data: T | null; error: Error | null }): T {
  if (result.error !== null) {
    throw result.error;
  }
  if (result.data === null) {
    throw new Error('Storage response was empty');
  }
  return result.data;
}

function storageBucket(world: ContractWorld): StorageBucket {
  return world.client.storage.from(world.fixture.bucket_name);
}

async function cleanStorageObject(world: ContractWorld): Promise<void> {
  const bucket = storageBucket(world);
  const objects = storageData(await bucket.list(world.storagePath));
  if (objects.some(({ name }) => name === world.storagePath)) {
    storageData(await bucket.remove([world.storagePath]));
  }
}

async function partialUpload(world: ContractWorld) {
  const bucket = storageBucket(world);
  const bytes = Buffer.concat([Buffer.alloc(5 * 1024 * 1024, 'x'), world.storageBytes]);
  const session = storageData(
    await bucket.createUploadSession(world.storagePath, {
      totalSize: bytes.length,
      partSize: 5 * 1024 * 1024,
      contentType: 'application/octet-stream',
    }),
  );
  world.cleanupCallbacks.push(
    async () => {
      const result = await bucket.abortUploadSession(world.storagePath, session.session_id);
      if (result.error !== null && result.error.status !== 404) {
        throw result.error;
      }
    },
    () => cleanStorageObject(world),
  );
  const part = storageData(
    await bucket.uploadPart(
      world.storagePath,
      session.session_id,
      1,
      new Blob([Uint8Array.from(bytes.subarray(0, session.part_size))]),
    ),
  );
  return { session, part, bytes };
}

async function recordStorage(
  world: ContractWorld,
  operation: () => Promise<unknown>,
): Promise<void> {
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

autoBindSteps<ScenarioContext>(features, [
  ({ given, when, then, context }) => {
    given('a read-only project logs client', () => {
      startScenario(context);
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
        world.logsSearchResult = await world.logsContract.search();
        recordOutcome(world, world.logsSearchResult, null);
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });
    when('the client reads matching log activity within 120 seconds', async () => {
      const world = context.world;
      try {
        world.logsActivityResult = await world.logsContract.activity();
        recordOutcome(world, world.logsActivityResult, null);
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });
    then('all three structured events retain their metadata without duplicates', () => {
      requireSuccessfulOutcome(context.world);
      if (context.world.logsSearchResult === null) {
        throw new Error('Log search did not complete');
      }
      context.world.logsContract.verifyEvents(context.world.logsSearchResult);
    });
    then('activity counts exactly that event in its function and level buckets', () => {
      requireSuccessfulOutcome(context.world);
      if (context.world.logsActivityResult === null) {
        throw new Error('Log activity did not complete');
      }
      context.world.logsContract.verifyActivity(context.world.logsActivityResult);
    });
    when('one presence client joins and leaves while the other remains subscribed', async () => {
      const world = context.world;
      recordOutcome(world, await verifyPresenceMembership(world), null);
    });
    then(
      'both rosters identify the contract user and the original handler observes membership changes',
      () => {
        expect(requireSuccessfulOutcome(context.world)).toEqual([1, 2, 1]);
      },
    );
    when('the clients observe an inserted and updated contract row', async () => {
      const world = context.world;
      recordOutcome(world, await verifyPostgresChanges(world), null);
    });
    then('automatic and lightweight notifications retain metadata and row identity', () => {
      expect(requireSuccessfulOutcome(context.world)).toEqual(['INSERT', 'UPDATE']);
    });
    given('the client replaces its access token with a rejected token', async () => {
      const { data, error } = await context.world.client.auth.getSession();
      if (error !== null) {
        throw error;
      }
      const session = requireCompleteSession(data.session);
      const parts = session.access_token.split('.');
      expect(parts).toHaveLength(3);
      const adopted = await context.world.client.auth.setSession({
        ...session,
        access_token: `${requirePresent(parts[0], 'JWT header')}.${requirePresent(parts[1], 'JWT payload')}.sdk-contract-rejected-signature`,
      });
      if (adopted.error !== null) {
        throw adopted.error;
      }
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
        const session = requireCompleteSession(data.session);
        expect(session.access_token).toBeTruthy();
        expect(session.access_token).not.toBe(
          requireSession(context.world.previousSession).access_token,
        );
        expect(session.refresh_token).toBeTruthy();
        expect(session.user.id).toBe(context.world.fixture.user_id);
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
      world.sessionPage = result;
      recordOutcome(world, result, result.error);
    });

    then('the session list contains the current session for the contract user', () => {
      const world = context.world;
      requireSuccessfulOutcome(world);
      const page = world.sessionPage;
      if (page === null) {
        throw new Error('Session list did not complete');
      }
      if (page.sessions === null) {
        throw new Error('Session list was empty');
      }
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
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        id: context.world.fixture.user_id,
      });
      expect(context.world.client.currentUser).toMatchObject({ id: context.world.fixture.user_id });
    });

    given('the confirmed contract user', () => {
      startScenario(context);
    });

    given('the client listens for auth state changes', () => {
      const { world } = context;
      const unsubscribe = world.client.auth.onAuthStateChange((user) => {
        world.authStateUsers.push(user);
      });
      world.cleanupCallbacks.push(() => {
        unsubscribe();
        return Promise.resolve();
      });
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
      const result = await target.auth.setSession(requireCompleteSession(source.data.session));
      const session = result.data.session;
      context.world.client = target;
      recordOutcome(context.world, { session, user: session?.user ?? null }, result.error);
    });

    when('the client refreshes the current session', async () => {
      const before = await context.world.client.auth.getSession();
      context.world.previousSession = before.data.session;
      await new Promise((resolve) => setTimeout(resolve, ACCESS_TOKEN_CLOCK_TICK_MS));
      const refreshed = await context.world.client.auth.refreshSession();
      if (refreshed.error !== null) {
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
        if (source.error !== null) {
          throw source.error;
        }
        const target = new VolcanoClient({
          apiUrl: world.fixture.api_url,
          anonKey: world.fixture.anon_key,
        });
        const supplied = {
          ...requireCompleteSession(source.data.session),
          access_token: REJECTED_ACCESS_TOKEN,
        };
        const adopted = await target.auth.setSession(supplied);
        if (adopted.error !== null) {
          throw adopted.error;
        }
        const result = await target.auth.refreshSession();
        recordOutcome(world, result.session, result.error);
        const current = await target.auth.getSession();
        expect(current.data.session).toEqual(supplied);
      },
    );

    when('a fresh client starts with only the current access token', async () => {
      const world = context.world;
      const source = world.client;
      const current = await source.auth.getSession();
      if (current.error !== null) {
        throw current.error;
      }
      world.previousSession = current.data.session;
      world.bootstrapCleanup = async () => {
        const result = await source.auth.signOut();
        if (result.error !== null) {
          throw result.error;
        }
      };
      world.cleanupCallbacks.push(world.bootstrapCleanup);
      world.client = new VolcanoClient({
        apiUrl: world.fixture.api_url,
        anonKey: world.fixture.anon_key,
        accessToken: requireSession(world.previousSession).access_token,
      });
      const result = await world.client.auth.getSession();
      recordOutcome(world, result.data.session, result.error);
    });

    then('the token-only session has no cached user', async () => {
      const result = await context.world.client.auth.getSession();
      expect(result.error).toBeNull();
      expect(requireSession(result.data.session).user).toBeNull();
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
      expect(requireSession(result.data.session).access_token).toBe(
        requireSession(world.previousSession).access_token,
      );
      expect(requireSession(result.data.session).refresh_token).toBeNull();
    });

    then('the refreshed session becomes current', () => {
      const refreshed = context.world.refreshedSession;
      if (refreshed === null) {
        throw new Error('Session refresh did not complete');
      }
      expect(refreshed).not.toBe(context.world.previousSession);
      expect(refreshed.access_token).not.toBe(
        requireSession(context.world.previousSession).access_token,
      );
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        session: {
          access_token: refreshed.access_token,
          refresh_token: refreshed.refresh_token,
        },
      });
    });

    when('the client signs out', async () => {
      const current = await context.world.client.auth.getSession();
      context.world.signedOutSession = current.data.session;
      const result = await context.world.client.auth.signOut();
      recordOutcome(context.world, null, result.error);
      if (result.error === null && context.world.bootstrapCleanup !== null) {
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
        accessToken: requireSession(world.signedOutSession).access_token,
      });
      const result = await target.auth.getUser();
      recordOutcome(world, result.user, result.error);
    });

    when('a fresh client tries to refresh the signed-out session', async () => {
      const target = new VolcanoClient({
        apiUrl: context.world.fixture.api_url,
        anonKey: context.world.fixture.anon_key,
      });
      await target.auth.setSession(requireCompleteSession(context.world.signedOutSession));
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
      requireSuccessfulOutcome(context.world);
    });

    then('the SDK operation fails', () => {
      expect(context.world.lastOutcome).toMatchObject({ ok: false });
    });

    then('the current session belongs to the contract user', () => {
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        user: { id: context.world.fixture.user_id },
      });
      expect(context.world.client.currentUser).toMatchObject({ id: context.world.fixture.user_id });
    });

    then('the auth-state listener observes the signed-in contract user', () => {
      expect(context.world.authStateUsers).toContainEqual(
        expect.objectContaining({ id: context.world.fixture.user_id }),
      );
    });

    then('the current session exposes access and refresh tokens', () => {
      const outcome = requireSuccessfulOutcome(context.world);
      if (!isRecord(outcome) || !isRecord(outcome['session'])) {
        throw new Error('Session outcome was malformed');
      }
      const session = outcome['session'];
      expect(session['access_token']).toEqual(expect.any(String));
      expect(session['access_token']).not.toHaveLength(0);
      expect(session['refresh_token']).toEqual(expect.any(String));
      expect(session['refresh_token']).not.toHaveLength(0);
      expect(context.world.client.accessToken).toBe(session['access_token']);
      expect(context.world.client.refreshToken).toBe(session['refresh_token']);
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
      expect(requireSuccessfulOutcome(context.world)).toEqual([context.world.fixture.fixture_row]);
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
      expect(requireSuccessfulOutcome(context.world)).toEqual([
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
      expect(requireSuccessfulOutcome(context.world)).toEqual(
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
      expect(requireSuccessfulOutcome(context.world)).toEqual({
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
      expect(requireSuccessfulOutcome(context.world)).toEqual({
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
      expect(requireSuccessfulOutcome(context.world)).toEqual([row]);
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
      expect(requireSuccessfulOutcome(context.world)).toEqual([row]);
    });

    when('the client deletes its contract row', async () => {
      const row = context.world.fixture.mutation_rows.delete;
      registerDatabaseCleanup(context.world, async () => {
        const removed = await context.world.client
          .delete(context.world.fixture.table_name)
          .eq('slug', row.slug);
        return removed.error !== null
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
      expect(requireSuccessfulOutcome(context.world)).toEqual([row]);
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
      expect(requireSuccessfulOutcome(context.world)).toEqual([]);
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
        new Blob([Uint8Array.from(context.world.storageBytes)], {
          type: 'application/octet-stream',
        }),
      );
      if (upload.error !== null) {
        recordOutcome(context.world, null, upload.error);
        return;
      }
      context.world.cleanupCallbacks.push(async () => {
        const removed = await bucket.remove([context.world.storagePath]);
        if (removed.error !== null) {
          throw removed.error;
        }
      });
      const download = await bucket.download(context.world.storagePath);
      if (download.error !== null) {
        recordOutcome(context.world, null, download.error);
        return;
      }
      const bytes = Buffer.from(await storageData(download).arrayBuffer());
      recordOutcome(context.world, { bytes, path: storageData(upload).name }, null);
    });

    then('the downloaded bytes equal the uploaded bytes', () => {
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        bytes: context.world.storageBytes,
      });
    });

    when(
      'the client uploads the contract object as text/plain and reads its stored metadata',
      async () => {
        const { world } = context;
        const bucket = world.client.storage.from(world.fixture.bucket_name);
        try {
          const upload = await bucket.upload(
            world.storagePath,
            new Blob([Uint8Array.from(world.storageBytes)]),
            {
              contentType: 'text/plain',
            },
          );
          if (upload.error !== null) {
            throw upload.error;
          }
          world.cleanupCallbacks.push(async () => {
            const removed = await bucket.remove([world.storagePath]);
            if (removed.error !== null) {
              throw removed.error;
            }
          });
          const listed = await bucket.list(world.storagePath);
          if (listed.error !== null) {
            throw listed.error;
          }
          const downloaded = await bucket.download(world.storagePath);
          if (downloaded.error !== null) {
            throw downloaded.error;
          }
          recordOutcome(
            world,
            {
              path: storageData(upload).name,
              bytes: Buffer.from(await storageData(downloaded).arrayBuffer()),
              contentType: storageData(upload).mime_type,
              listed: storageData(listed).map(({ name, mime_type }) => ({ name, mime_type })),
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
      expect(requireSuccessfulOutcome(world)).toMatchObject({
        contentType: 'text/plain',
        listed: [{ name: world.storagePath, mime_type: 'text/plain' }],
      });
    });

    when('the client uploads the contract object and downloads bytes 2 through 7', async () => {
      const { world } = context;
      const bucket = world.client.storage.from(world.fixture.bucket_name);
      try {
        const upload = await bucket.upload(
          world.storagePath,
          new Blob([Uint8Array.from(world.storageBytes)]),
        );
        if (upload.error !== null) {
          throw upload.error;
        }
        world.cleanupCallbacks.push(async () => {
          const removed = await bucket.remove([world.storagePath]);
          if (removed.error !== null) {
            throw removed.error;
          }
        });
        const download = await bucket.download(world.storagePath, { range: 'bytes=2-7' });
        if (download.error !== null) {
          throw download.error;
        }
        recordOutcome(
          world,
          {
            bytes: Buffer.from(await storageData(download).arrayBuffer()),
            path: storageData(upload).name,
          },
          null,
        );
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });

    then('the downloaded bytes equal uploaded bytes 2 through 7 inclusive', () => {
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        bytes: context.world.storageBytes.subarray(2, 8),
      });
    });

    when('the client copies, moves, and removes a copy of the contract object', async () => {
      const { world } = context;
      const bucket = world.client.storage.from(world.fixture.bucket_name);
      const source = world.storagePath;
      const copied = `${source}.copy`;
      const moved = `${source}.moved`;
      world.cleanupCallbacks.push(async () => {
        const listed = await bucket.list(source);
        if (listed.error !== null) {
          throw listed.error;
        }
        const paths = storageData(listed)
          .map(({ name }) => name)
          .filter((name) => [source, copied, moved].includes(name));
        const removed = await bucket.remove(paths);
        if (removed.error !== null) {
          throw removed.error;
        }
      });
      try {
        storageData(await bucket.upload(source, new Blob([Uint8Array.from(world.storageBytes)])));
        storageData(await bucket.copy(source, copied));
        const originalDownload = storageData(await bucket.download(source));
        const copiedDownload = storageData(await bucket.download(copied));
        storageData(await bucket.move(copied, moved));
        const movedDownload = storageData(await bucket.download(moved));
        const afterMove = storageData(await bucket.list(source));
        storageData(await bucket.remove([moved]));
        const afterRemove = storageData(await bucket.list(source));
        const remainingDownload = storageData(await bucket.download(source));
        recordOutcome(
          world,
          {
            bytes: await Promise.all(
              [originalDownload, copiedDownload, movedDownload, remainingDownload].map(
                async (blob) => Buffer.from(await blob.arrayBuffer()),
              ),
            ),
            afterMove: afterMove
              .map(({ name }) => name)
              .sort((left, right) => left.localeCompare(right)),
            afterRemove: afterRemove
              .map(({ name }) => name)
              .sort((left, right) => left.localeCompare(right)),
          },
          null,
        );
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });

    then('the original, copied, and moved bytes equal the uploaded bytes', () => {
      const outcome = requireSuccessfulOutcome(context.world);
      if (!isRecord(outcome) || !Array.isArray(outcome['bytes'])) {
        throw new Error('Storage copy outcome was malformed');
      }
      for (const bytes of outcome['bytes']) {
        expect(bytes).toEqual(context.world.storageBytes);
      }
    });

    then('moving the copy leaves only the original and moved paths', () => {
      const source = context.world.storagePath;
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        afterMove: [source, `${source}.moved`].sort((left, right) => left.localeCompare(right)),
      });
    });

    then('removing the moved object leaves the original unchanged', () => {
      const outcome = requireSuccessfulOutcome(context.world);
      expect(outcome).toMatchObject({ afterRemove: [context.world.storagePath] });
      if (!isRecord(outcome) || !Array.isArray(outcome['bytes'])) {
        throw new Error('Storage move outcome was malformed');
      }
      expect(outcome['bytes'][3]).toEqual(context.world.storageBytes);
    });

    when('the client uploads one part and resumes the contract upload', async () => {
      const { world } = context;
      await recordStorage(world, async () => {
        const { session, part, bytes } = await partialUpload(world);
        const bucket = storageBucket(world);
        const progress = storageData(
          await bucket.getUploadSession(world.storagePath, session.session_id),
        );
        storageData(
          await bucket.uploadPart(
            world.storagePath,
            session.session_id,
            2,
            new Blob([Uint8Array.from(bytes.subarray(session.part_size))]),
          ),
        );
        const object = storageData(
          await bucket.completeUploadSession(world.storagePath, session.session_id),
        ).object;
        const download = Buffer.from(
          await storageData(await bucket.download(world.storagePath)).arrayBuffer(),
        );
        const value = { session, part, bytes, progress, object, download };
        world.multipartResult = value;
        return value;
      });
    });

    then('upload progress describes exactly the first uploaded part', () => {
      const { world } = context;
      requireSuccessfulOutcome(world);
      const { progress, session, part, bytes } = requirePresent(
        world.multipartResult,
        'Multipart result',
      );
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
      requireSuccessfulOutcome(world);
      const value = requirePresent(world.multipartResult, 'Multipart result');
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
        const aborted = await bucket.abortUploadSession(world.storagePath, session.session_id);
        if (aborted.error !== null) {
          throw aborted.error;
        }
        const status = await bucket.getUploadSession(world.storagePath, session.session_id);
        const object = await bucket.download(world.storagePath);
        return { session: status.error?.status, object: object.error?.status };
      });
    });

    then('the aborted session and unfinished object are not found', () => {
      expect(requireSuccessfulOutcome(context.world)).toEqual({ session: 404, object: 404 });
    });

    when('the client makes the contract object public and private again', async () => {
      const { world } = context;
      await recordStorage(world, async () => {
        const bucket = storageBucket(world);
        world.cleanupCallbacks.push(() => cleanStorageObject(world));
        storageData(
          await bucket.upload(world.storagePath, new Blob([Uint8Array.from(world.storageBytes)])),
        );
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
      const outcome = requireSuccessfulOutcome(context.world);
      if (!isRecord(outcome) || !Array.isArray(outcome['privateBytes'])) {
        throw new Error('Storage visibility outcome was malformed');
      }
      for (const bytes of outcome['privateBytes']) {
        if (!Buffer.isBuffer(bytes)) {
          throw new TypeError('Private response was not binary');
        }
        expect(bytes.includes(context.world.storageBytes)).toBe(false);
      }
      expect(outcome).toMatchObject({
        statuses: [404, 200, 404],
        bytes: context.world.storageBytes,
        visibility: [true, false],
      });
    });

    then('the stored object path equals the contract path', () => {
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({
        path: context.world.storagePath,
      });
    });

    given('a service-role client', () => {
      startScenario(context);
    });

    when('the client acquires and releases the contract lock', async () => {
      const acquired = await context.world.serviceClient.locks.acquire(context.world.lockKey, {
        ttl: 10,
      });
      if (acquired.error !== null || !acquired.acquired) {
        recordOutcome(context.world, null, acquired.error ?? new Error('Lock was not acquired'));
        return;
      }
      const lease = requirePresent(acquired.lease, 'Acquired lease');
      const cleanup = context.world.registerLockCleanup(context.world.lockKey, lease);
      const released = await context.world.serviceClient.locks.release(
        context.world.lockKey,
        lease,
      );
      if (released.error !== null) {
        recordOutcome(context.world, null, released.error);
        return;
      }
      context.world.cleanupCallbacks = context.world.cleanupCallbacks.filter(
        (callback) => callback !== cleanup,
      );
      const state = await context.world.serviceClient.locks.get(context.world.lockKey);
      recordOutcome(context.world, { lease, state: state.state }, state.error);
    });

    then('the released lease is no longer held', () => {
      expect(requireSuccessfulOutcome(context.world)).toMatchObject({ state: { held: false } });
    });

    given('a project-owner client', () => {
      expect(context.world.fixture.platform_token).toBeTruthy();
    });

    when('the client starts the contract durable function', async () => {
      const { world } = context;
      try {
        recordOutcome(world, await world.startDurableExecution(), null);
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });

    when(
      'the client starts the contract durable function twice under one execution name',
      async () => {
        const { world } = context;
        try {
          const first = await world.startDurableExecution();
          const second = await world.startDurableExecution();
          world.durablePair = { first, second };
          recordOutcome(world, { first, second }, null);
        } catch (error) {
          recordOutcome(world, null, error);
        }
      },
    );

    then('the started execution carries its id, function, name, region, and creation time', () => {
      const { world } = context;
      requireSuccessfulOutcome(world);
      const execution = requirePresent(world.startedExecution, 'Started execution');
      expect(typeof execution.id).toBe('string');
      expect(typeof execution.function_id).toBe('string');
      expect(execution.name).toBe(world.durableExecutionName);
      expect(typeof execution.region).toBe('string');
      expect(typeof execution.created_at).toBe('string');
    });

    then('the started execution is not terminal and carries no result', () => {
      requireSuccessfulOutcome(context.world);
      const execution = requirePresent(context.world.startedExecution, 'Started execution');
      expect(TERMINAL_DURABLE_STATUSES).not.toContain(execution.status);
      expect(execution.result).toBeUndefined();
    });

    then('both starts return the same execution', () => {
      requireSuccessfulOutcome(context.world);
      const { first, second } = requirePresent(context.world.durablePair, 'Durable start pair');
      expect(second.id).toBe(first.id);
      expect(second.name).toBe(first.name);
    });

    when('the owner reads the execution until it is terminal', async () => {
      const { world } = context;
      if (world.lastOutcome?.ok !== true) {
        return;
      }
      try {
        recordOutcome(
          world,
          await world.followDurableExecution(
            requirePresent(world.startedExecution, 'Started execution').id,
          ),
          null,
        );
      } catch (error) {
        recordOutcome(world, null, error);
      }
    });

    then("the execution succeeded carrying the function's result", () => {
      const { world } = context;
      expect(requireSuccessfulOutcome(world)).toMatchObject({
        status: 'succeeded',
        result: { echoed: world.durablePayload.value },
      });
    });

    when("the owner lists the durable function's executions", async () => {
      const { world } = context;
      if (world.lastOutcome?.ok !== true) {
        return;
      }
      const { data, error } = await world.ownerClient.durable.list(
        world.fixture.project_id,
        world.fixture.durable_function_name,
      );
      world.listedExecutions = data;
      recordOutcome(world, data, error);
    });

    then('the listed executions include the started execution', () => {
      const { world } = context;
      requireSuccessfulOutcome(world);
      const executions = requirePresent(world.listedExecutions, 'Listed executions');
      expect(executions.data.map(({ id }) => id)).toContain(
        requirePresent(world.startedExecution, 'Started execution').id,
      );
    });

    when('the client recovers the contract lock with caller-owned tokens', async () => {
      const world = context.world;
      const locks = world.serviceClient.locks;
      const options = { ttl: 30, token: randomUUID(), requestId: randomUUID() };
      const acquired = await locks.acquire(world.lockKey, options);
      const acquiredLease = requireAcquiredLease(acquired, 'Acquired lease');
      const cleanup = world.registerLockCleanup(world.lockKey, acquiredLease);
      const recovered = await locks.acquire(world.lockKey, options);
      const recoveredLease = requireAcquiredLease(recovered, 'Recovered lease');
      const held = await locks.get(world.lockKey, { requestId: randomUUID() });
      requireNoError(held);
      const renewed = await locks.renew(world.lockKey, recoveredLease, {
        ttl: 60,
        requestId: randomUUID(),
      });
      requireNoError(renewed);
      const released = await locks.release(world.lockKey, renewed.lease, {
        requestId: randomUUID(),
      });
      requireNoError(released);
      const available = await locks.get(world.lockKey, { requestId: randomUUID() });
      const result = {
        token: options.token,
        cleanup,
        acquired: acquiredLease,
        recovered: recoveredLease,
        held: requirePresent(held.state, 'Held lock state'),
        renewed: renewed.lease,
        available: requirePresent(available.state, 'Available lock state'),
      };
      world.lockRecoveryResult = result;
      recordOutcome(world, result, available.error);
    });

    then('recovery and renewal preserve the held lease until release', () => {
      requireSuccessfulOutcome(context.world);
      const value = requirePresent(context.world.lockRecoveryResult, 'Lock recovery result');
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
      ]).toEqual(Array.from({ length: 3 }).fill(value.acquired.fencingToken));
    });

    when('the client acquires and force releases the contract lock', async () => {
      const world = context.world;
      const acquired = await world.serviceClient.locks.acquire(world.lockKey, { ttl: 30 });
      const lease = requireAcquiredLease(acquired, 'Acquired lease');
      const cleanup = world.registerLockCleanup(world.lockKey, lease);
      const released = await world.serviceClient.locks.forceRelease(world.lockKey, {
        requestId: randomUUID(),
      });
      requireNoError(released);
      const available = await world.serviceClient.locks.get(world.lockKey);
      const result = {
        lease,
        cleanup,
        available: requirePresent(available.state, 'Available lock state'),
      };
      world.forceReleaseResult = result;
      recordOutcome(world, result, available.error);
    });

    then('the force-released lock is available', () => {
      const world = context.world;
      requireSuccessfulOutcome(world);
      const value = requirePresent(world.forceReleaseResult, 'Force release result');
      expect(value.available.held).toBe(false);
      world.cleanupCallbacks = world.cleanupCallbacks.filter(
        (callback) => callback !== value.cleanup,
      );
    });

    when('the client reacquires the force-released contract lock', async () => {
      const world = context.world;
      requireSuccessfulOutcome(world);
      const original = requirePresent(world.forceReleaseResult, 'Force release result').lease;
      const acquired = await world.serviceClient.locks.acquire(world.lockKey, { ttl: 30 });
      const replacement = requireAcquiredLease(acquired, 'Replacement lease');
      world.registerLockCleanup(world.lockKey, replacement);
      world.reacquiredLock = { original, replacement };
      recordOutcome(world, world.reacquiredLock, null);
    });

    then('the replacement owner receives a higher fencing token', () => {
      requireSuccessfulOutcome(context.world);
      const { original, replacement } = requirePresent(
        context.world.reacquiredLock,
        'Reacquired lock',
      );
      expect(replacement.token).not.toBe(original.token);
      expect(original.fencingToken).not.toBeNull();
      expect(replacement.fencingToken).toBeGreaterThan(
        requirePresent(original.fencingToken, 'Original fencing token'),
      );
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
      const response = requireSuccessfulOutcome(context.world);
      expect(response).toMatchObject({ status: 200, data: { echoed: 'contract' } });
    });

    given('two authenticated realtime clients', async () => {
      const world = startScenario(context);
      await world.createRealtimeClients();
    });

    when('one client subscribes and the other publishes the contract message', async () => {
      let timeout;
      const received = new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          reject(new Error('Realtime message timed out'));
        }, 10000);
        requirePresent(context.world.subscriber, 'Realtime subscriber').on('message', resolve);
      });
      try {
        await requirePresent(context.world.publisher, 'Realtime publisher').send(
          context.world.realtimeMessage,
        );
        recordOutcome(context.world, await received, null);
      } catch (error) {
        recordOutcome(context.world, null, error);
      } finally {
        clearTimeout(timeout);
      }
    });

    then('the subscriber receives the contract message within 10 seconds', () => {
      expect(requireSuccessfulOutcome(context.world)).toEqual(context.world.realtimeMessage);
    });
  },
]);
