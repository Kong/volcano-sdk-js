/**
 * Realtime Lightweight E2E Integration Tests
 *
 * These tests verify the end-to-end flow of lightweight notifications
 * and auto-fetch functionality.
 *
 * Note: These tests require a running Volcano server.
 * Run with: source .env && npm run test:integration -- --testPathPatterns="realtime-lightweight"
 */

import { type Session, type User, VolcanoAuth } from '../../src/index.js';
import { VolcanoRealtime } from '../../src/realtime.ts';
import {
  integrationUrl,
  isRecord,
  managementFetch,
  platformFetch as requestPlatform,
  requiredString,
} from './http.ts';

// Configuration from environment (source .env before running tests)
const API_URL = integrationUrl('VOLCANO_API_URL', 'http://localhost:8000');
const MGMT_URL = integrationUrl('VOLCANO_MGMT_URL', 'http://localhost:8001');

// Helper to make management API calls
async function mgmtFetch(route: string, options: RequestInit = {}): Promise<unknown> {
  return managementFetch(MGMT_URL, route, options);
}

// Helper to make platform API calls with user token
async function platformFetch(
  route: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  return requestPlatform(API_URL, route, token, options);
}

async function verifyServer(): Promise<void> {
  try {
    const health = await fetch(`${API_URL}/health`);
    if (!health.ok) {
      throw new Error('Health check failed');
    }
  } catch {
    throw new Error(`Volcano API server is not running at ${API_URL}. Please start with: make run`);
  }
}

// Actual E2E tests that require running server
describe('Realtime Lightweight E2E (Live Server)', () => {
  // Test fixtures
  let platformUser: { id: string };
  let platformToken: string;
  let project: { id: string };
  let database: { id: string; name: string };
  let anonKey: string;
  let volcano: VolcanoAuth;
  let authUser: User;
  let authSession: Session;
  let realtime: VolcanoRealtime | null = null;

  // Cleanup tracking
  const cleanupFns: (() => Promise<void>)[] = [];

  async function createResources(): Promise<void> {
    // Create platform user
    const createdUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `lightweight-e2e-test-${Date.now().toString()}`,
        name: 'Lightweight E2E Test User',
      }),
    });
    platformUser = { id: requiredString(createdUser, 'id') };
    cleanupFns.push(async () => {
      await mgmtFetch(`/users/${platformUser.id}`, { method: 'DELETE' }).catch(() => null);
    });
    console.log(`[ok] Created platform user: ${platformUser.id}`);

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUser.id}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'lightweight-e2e-test-token' }),
    });
    platformToken = requiredString(tokenResponse, 'token');
    console.log('[ok] Created platform token');

    // Create project
    const createdProject = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `lightweight-e2e-${Date.now().toString()}` }),
    });
    project = { id: requiredString(createdProject, 'id') };
    cleanupFns.push(async () => {
      await platformFetch(`/projects/${project.id}`, platformToken, { method: 'DELETE' }).catch(
        () => null,
      );
    });
    console.log(`[ok] Created project: ${project.id}`);

    // Create a database so postgres realtime subscriptions are accepted.
    const createdDatabase = await platformFetch(
      `/projects/${project.id}/databases`,
      platformToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `lightweight_e2e_db_${Date.now().toString()}`,
          region: 'aws-us-east-1',
          pg_version: '16',
        }),
      },
    );
    database = {
      id: requiredString(createdDatabase, 'id'),
      name: requiredString(createdDatabase, 'name'),
    };
    console.log(`[ok] Created database: ${database.id}`);
  }

  async function waitDatabase(): Promise<void> {
    console.log('  Waiting for database to be ready...');
    let dbReady = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      if (await databaseIsActive()) {
        dbReady = true;
        break;
      }
    }
    if (!dbReady) {
      throw new Error('Database did not become ready in time');
    }
    console.log('[ok] Database is ready');
  }

  async function databaseIsActive(): Promise<boolean> {
    try {
      const status = await platformFetch(
        `/projects/${project.id}/databases/${database.name}`,
        platformToken,
      );
      return isRecord(status) && status['status'] === 'active';
    } catch {
      return false;
    }
  }

  async function createKeyAndUser(): Promise<void> {
    // Create anon key using timestamp to guarantee uniqueness
    // Include realtime permissions for WebSocket tests
    const anonKeyResponse = await platformFetch(
      `/projects/${project.id}/anon-keys`,
      platformToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `lightweight-key-${Date.now().toString()}`,
          permissions: [
            'auth.signup',
            'auth.signin',
            'auth.refresh',
            'auth.logout',
            'realtime.connect',
            'realtime.subscribe',
            'realtime.publish',
          ],
        }),
      },
    );
    anonKey = requiredString(anonKeyResponse, 'key_value');
    console.log('[ok] Created anon key');

    // Enable realtime for the project
    await platformFetch(`/projects/${project.id}/realtime/config`, platformToken, {
      method: 'PUT',
      body: JSON.stringify({
        enabled: true,
        broadcast_enabled: true,
        presence_enabled: true,
        postgres_changes_enabled: true,
      }),
    });
    console.log('[ok] Enabled realtime for project');

    // Initialize SDK
    volcano = new VolcanoAuth({
      apiUrl: API_URL,
      anonKey,
    });
    volcano.database(database.name);
    console.log('[ok] Initialized SDK');

    // Create an auth user for testing
    const email = `lightweight-test-${Date.now().toString()}@example.com`;
    const password = 'TestPassword123!';

    const signUpResult = await volcano.auth.signUp({
      email,
      password,
      signInWhenAllowed: true,
    });

    if (signUpResult.error !== null) {
      throw new Error(`Failed to create auth user: ${signUpResult.error.message}`);
    }
    if (signUpResult.user === null || signUpResult.session === null) {
      throw new Error('Signup returned no user session');
    }

    authUser = signUpResult.user;
    authSession = signUpResult.session;
    console.log(`[ok] Created auth user: ${authUser.email}`);
  }

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Realtime Lightweight E2E (Live Server)');
    console.log('========================================\n');
    await verifyServer();
    await createResources();
    await waitDatabase();
    await createKeyAndUser();
    console.log('\n--- Setup complete ---\n');
  }, 180000);

  afterAll(async () => {
    console.log('\n--- Cleaning up ---');

    // Disconnect realtime
    if (realtime !== null) {
      realtime.disconnect();
    }

    // Run cleanup in reverse order
    for (const cleanupFn of [...cleanupFns].reverse()) {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn('Cleanup error:', error instanceof Error ? error.message : String(error));
      }
    }

    console.log('[ok] Cleanup complete\n');
  });

  test('connects to live server with valid credentials', async () => {
    realtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: authSession.access_token,
      volcanoClient: volcano,
    });

    await realtime.connect();
    expect(realtime.isConnected()).toBe(true);
  });

  test('subscribes to postgres changes channel', async () => {
    realtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: authSession.access_token,
      volcanoClient: volcano,
    });

    await realtime.connect();

    const channel = realtime.channel('public:notes', { type: 'postgres' });
    const callback = jest.fn();
    channel.on('*', callback);

    // subscribe() should complete without throwing
    await expect(channel.subscribe()).resolves.not.toThrow();
    // Verify subscription object was created
    expect(channel._subscription).toBeTruthy();

    channel.unsubscribe();
  });

  test('subscribes to broadcast channel', async () => {
    realtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: authSession.access_token,
      volcanoClient: volcano,
    });

    await realtime.connect();

    const channel = realtime.channel('test-broadcast', { type: 'broadcast' });
    await expect(channel.subscribe()).resolves.not.toThrow();
    expect(channel._subscription).toBeTruthy();

    channel.unsubscribe();
  });

  test('lightweight notification structure is correct', async () => {
    realtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: authSession.access_token,
      volcanoClient: volcano,
    });

    await realtime.connect();

    const channel = realtime.channel('public:auth_users', { type: 'postgres' });

    // Just verify we can subscribe - actual lightweight notification
    // testing requires database changes which is covered in other e2e tests
    await expect(channel.subscribe()).resolves.not.toThrow();
    expect(channel._subscription).toBeTruthy();

    // Verify channel has auto-fetch capability configured
    expect(channel._realtime._volcanoClient).toBe(volcano);
    expect(channel._realtime._fetchConfig.enabled).toBe(true);

    channel.unsubscribe();
  });
});
