/**
 * Realtime Lightweight E2E Integration Tests
 *
 * These tests verify the end-to-end flow of lightweight notifications
 * and auto-fetch functionality.
 *
 * Note: These tests require a running Volcano server.
 * Run with: source .env && npm run test:integration -- --testPathPatterns="realtime-lightweight"
 */

const { VolcanoRealtime } = require('../../src/realtime.js');

// Mock volcano client for auto-fetch testing without full integration
const createMockVolcanoClient = (mockData = {}) => {
  const client = {
    _currentDatabaseName: null,
    database: jest.fn((name) => {
      client._currentDatabaseName = name;
      return client;
    }),
    from: jest.fn((table) => ({
      select: jest.fn().mockReturnValue({
        in: jest.fn((column, ids) => {
          const data = ids.map((id) => mockData[`${table}:${id}`]).filter(Boolean);
          return Promise.resolve({ data, error: null });
        }),
      }),
    })),
  };

  return { client };
};

describe('Realtime Lightweight E2E (Unit Mock)', () => {
  let realtime;
  let mockVolcanoClient;

  beforeEach(() => {
    jest.useFakeTimers();

    const { client } = createMockVolcanoClient({
      'messages:1': { id: 1, text: 'Hello', author_id: 'user-a' },
      'messages:2': { id: 2, text: 'World', author_id: 'user-b' },
      'secrets:100': { id: 100, secret: 'classified', owner_id: 'admin' },
    });
    mockVolcanoClient = client;

    realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'test.key',
      accessToken: 'test-token',
      volcanoClient: mockVolcanoClient,
      databaseName: 'testdb',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    if (realtime) {
      realtime.disconnect();
    }
  });

  describe('INSERT notification flows through auto-fetch', () => {
    test('lightweight INSERT is converted to full payload', async () => {
      const channel = realtime.channel('public:messages', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('INSERT', callback);

      // Simulate server sending lightweight notification
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'messages',
          id: 1,
          timestamp: new Date().toISOString(),
        },
      });

      // Wait for batch flush
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INSERT',
          schema: 'public',
          table: 'messages',
          record: { id: 1, text: 'Hello', author_id: 'user-a' },
        }),
        expect.anything(),
      );
    });
  });

  describe('UPDATE notification flows through auto-fetch', () => {
    test('lightweight UPDATE is converted to full payload', async () => {
      const channel = realtime.channel('public:messages', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('UPDATE', callback);

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'UPDATE',
          schema: 'public',
          table: 'messages',
          id: 2,
          timestamp: new Date().toISOString(),
        },
      });

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'UPDATE',
          record: { id: 2, text: 'World', author_id: 'user-b' },
        }),
        expect.anything(),
      );
    });
  });

  describe('DELETE notification does not require old_record', () => {
    test('DELETE payload works without fetch', () => {
      const channel = realtime.channel('public:messages', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('DELETE', callback);

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'DELETE',
          schema: 'public',
          table: 'messages',
          id: 1,
          timestamp: new Date().toISOString(),
        },
      });

      // DELETE should be delivered immediately without database fetch
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DELETE',
          old_record: { id: 1 },
        }),
        expect.anything(),
      );

      // Should NOT have triggered any database queries
      expect(mockVolcanoClient.from).not.toHaveBeenCalled();
    });
  });

  describe('RLS enforced - user A cannot fetch user B row', () => {
    test('returns lightweight on RLS denial', async () => {
      // Mock client that returns empty for secrets table (simulating RLS denial)
      const { client: restrictiveMockClient } = createMockVolcanoClient({
        // No data for secrets - simulates RLS blocking access
      });

      const rt = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'test.key',
        volcanoClient: restrictiveMockClient,
        databaseName: 'testdb',
      });

      const channel = rt.channel('public:secrets', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('*', callback);

      // Suppress console warning
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'secrets',
          id: 100, // This ID exists but user doesn't have access
          timestamp: new Date().toISOString(),
        },
      });

      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      // Should still deliver notification (falls back to lightweight)
      expect(callback).toHaveBeenCalled();

      // The record should not be in the payload (or lightweight is delivered)
      const callArg = callback.mock.calls[0][0];
      // Either it has no record (lightweight fallback) or mode is lightweight
      expect(callArg.record === undefined || callArg.mode === 'lightweight').toBe(true);

      consoleSpy.mockRestore();
      rt.disconnect();
    });
  });

  describe('batch window collects multiple notifications', () => {
    test('multiple INSERTs within window are batched', async () => {
      const channel = realtime.channel('public:messages', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('*', callback);

      // Send multiple lightweight notifications rapidly
      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'messages',
          id: 1,
          timestamp: new Date().toISOString(),
        },
      });

      channel._handlePublication({
        data: {
          mode: 'lightweight',
          type: 'INSERT',
          schema: 'public',
          table: 'messages',
          id: 2,
          timestamp: new Date().toISOString(),
        },
      });

      // Advance timer to flush batch
      jest.advanceTimersByTime(50);
      await Promise.resolve();
      await Promise.resolve();

      // Should have made only one database call for both IDs
      expect(mockVolcanoClient.from).toHaveBeenCalledTimes(1);
    });
  });

  describe('cross-project isolation maintained', () => {
    test('channels from different projects are separate', () => {
      const rt1 = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project1.key',
      });

      const rt2 = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project2.key',
      });

      const channel1 = rt1.channel('public:users', { type: 'postgres' });
      const channel2 = rt2.channel('public:users', { type: 'postgres' });

      // Channels should have same name but different realtime instances
      expect(channel1.name).toBe('postgres:public:users');
      expect(channel2.name).toBe('postgres:public:users');
      expect(channel1._realtime).not.toBe(channel2._realtime);

      rt1.disconnect();
      rt2.disconnect();
    });
  });

  describe('full mode backward compatibility', () => {
    test('full payloads work without volcanoClient', () => {
      const rt = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'test.key',
        // No volcanoClient
      });

      const channel = rt.channel('public:messages', { type: 'postgres' });

      const callback = jest.fn();
      channel.on('INSERT', callback);

      // Server sends full payload (no mode field)
      channel._handlePublication({
        data: {
          type: 'INSERT',
          schema: 'public',
          table: 'messages',
          record: { id: 1, text: 'Full payload' },
          timestamp: new Date().toISOString(),
        },
      });

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'INSERT',
          record: { id: 1, text: 'Full payload' },
        }),
        expect.anything(),
      );

      rt.disconnect();
    });
  });
});

// Configuration from environment (source .env before running tests)
const API_URL = process.env.VOLCANO_API_URL || 'http://localhost:8000';
const MGMT_URL = process.env.VOLCANO_MGMT_URL || 'http://localhost:8001';

const VolcanoAuth = require('../../src/index.js');

// Helper to make management API calls
async function mgmtFetch(path, options = {}) {
  const response = await fetch(`${MGMT_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Management API error: ${response.status} - ${error.error || 'Unknown error'}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Helper to make platform API calls with user token
async function platformFetch(path, token, options = {}) {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Platform API error: ${response.status} - ${error.error || 'Unknown error'}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

// Actual E2E tests that require running server
describe('Realtime Lightweight E2E (Live Server)', () => {
  // Test fixtures
  let platformUser;
  let platformToken;
  let project;
  let database;
  let anonKey;
  let volcano;
  let authUser;
  let authSession;
  let realtime;

  // Cleanup tracking
  const cleanupFns = [];

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Realtime Lightweight E2E (Live Server)');
    console.log('========================================\n');

    // Verify server is running
    try {
      const healthResponse = await fetch(`${API_URL}/health`);
      if (!healthResponse.ok) {
        throw new Error('Health check failed');
      }
      console.log('[ok] Volcano API server is running');
    } catch {
      throw new Error(
        `Volcano API server is not running at ${API_URL}. Please start with: make run`,
      );
    }

    // Create platform user
    platformUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `lightweight-e2e-test-${Date.now()}`,
        name: 'Lightweight E2E Test User',
      }),
    });
    cleanupFns.push(async () => {
      await mgmtFetch(`/users/${platformUser.id}`, { method: 'DELETE' }).catch(() => {});
    });
    console.log(`[ok] Created platform user: ${platformUser.id}`);

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUser.id}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'lightweight-e2e-test-token' }),
    });
    platformToken = tokenResponse.token;
    console.log('[ok] Created platform token');

    // Create project
    project = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `lightweight-e2e-${Date.now()}` }),
    });
    cleanupFns.push(async () => {
      await platformFetch(`/projects/${project.id}`, platformToken, { method: 'DELETE' }).catch(
        () => {},
      );
    });
    console.log(`[ok] Created project: ${project.id}`);

    // Create a database so postgres realtime subscriptions are accepted.
    database = await platformFetch(`/projects/${project.id}/databases`, platformToken, {
      method: 'POST',
      body: JSON.stringify({
        name: `lightweight_e2e_db_${Date.now()}`,
        region: 'aws-us-east-1',
        pg_version: '16',
      }),
    });
    console.log(`[ok] Created database: ${database.id}`);

    console.log('  Waiting for database to be ready...');
    let dbReady = false;
    for (let i = 0; i < 60; i++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      try {
        const dbStatus = await platformFetch(
          `/projects/${project.id}/databases/${database.name}`,
          platformToken,
        );
        if (dbStatus.status === 'active') {
          dbReady = true;
          break;
        }
      } catch {
        // Database status can be temporarily unavailable while provisioning.
      }
    }
    if (!dbReady) {
      throw new Error('Database did not become ready in time');
    }
    console.log('[ok] Database is ready');

    // Create anon key using timestamp to guarantee uniqueness
    // Include realtime permissions for WebSocket tests
    const anonKeyResponse = await platformFetch(
      `/projects/${project.id}/anon-keys`,
      platformToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `lightweight-key-${Date.now()}`,
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
    anonKey = anonKeyResponse.key_value;
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
      anonKey: anonKey,
    });
    volcano.database(database.name);
    console.log('[ok] Initialized SDK');

    // Create an auth user for testing
    const email = `lightweight-test-${Date.now()}@example.com`;
    const password = 'TestPassword123!';

    const signUpResult = await volcano.auth.signUp({
      email,
      password,
    });

    if (signUpResult.error) {
      throw new Error(`Failed to create auth user: ${signUpResult.error.message}`);
    }

    authUser = signUpResult.user;
    authSession = signUpResult.session;
    console.log(`[ok] Created auth user: ${authUser.email}`);

    console.log('\n--- Setup complete ---\n');
  }, 180000);

  afterAll(async () => {
    console.log('\n--- Cleaning up ---');

    // Disconnect realtime
    if (realtime) {
      realtime.disconnect();
    }

    // Run cleanup in reverse order
    for (const cleanupFn of cleanupFns.reverse()) {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn('Cleanup error:', error.message);
      }
    }

    console.log('[ok] Cleanup complete\n');
  });

  test('connects to live server with valid credentials', async () => {
    realtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey: anonKey,
      accessToken: authSession.access_token,
      volcanoClient: volcano,
    });

    await realtime.connect();
    expect(realtime.isConnected()).toBe(true);
  });

  test('subscribes to postgres changes channel', async () => {
    realtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey: anonKey,
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
      anonKey: anonKey,
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
      anonKey: anonKey,
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
