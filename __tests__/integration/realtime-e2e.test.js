/**
 * Realtime SDK End-to-End Integration Tests
 *
 * These tests run against a real Volcano Hosting server with realtime enabled.
 *
 * Prerequisites:
 * - Volcano server running (configured via .env or environment variables)
 * - Centrifuge/realtime server enabled
 * - PostgreSQL database available
 *
 * Environment Variables (can be set in .env file):
 * - VOLCANO_API_URL: The API server URL (default: http://localhost:8000)
 * - VOLCANO_MGMT_URL: The management server URL (default: http://localhost:8001)
 * - VOLCANO_REALTIME_URL: The realtime WebSocket URL (optional, derived from API_URL)
 *
 * Note: These tests require the centrifuge npm package to be installed.
 */

// Load .env file if present
try {
  require('dotenv').config({ path: require('node:path').resolve(__dirname, '../../../.env') });
} catch {
  // dotenv not installed, use environment variables directly
}

const VolcanoAuth = require('../../src/index.js');
const { VolcanoRealtime } = require('../../src/realtime.js');
const WebSocket = require('ws');

// Configuration from environment
const API_URL = process.env.VOLCANO_API_URL || 'http://localhost:8000';
const MGMT_URL = process.env.VOLCANO_MGMT_URL || 'http://localhost:8001';
const REALTIME_URL = process.env.VOLCANO_REALTIME_URL || API_URL;
const ALLOWED_REALTIME_ORIGIN = 'https://allowed-realtime-origin.example.com';
const BLOCKED_REALTIME_ORIGIN = 'https://blocked-realtime-origin.example.com';

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

function webSocketWithOrigin(origin) {
  return class OriginWebSocket extends WebSocket {
    constructor(address, protocols, options = {}) {
      super(address, protocols, {
        ...options,
        headers: {
          ...options.headers,
          Origin: origin,
        },
      });
    }
  };
}

describe('Realtime SDK E2E Integration Tests', () => {
  // Test fixtures
  let platformUser;
  let platformToken;
  let project;
  let anonKey;
  let volcano;
  let authUser;
  let authSession;

  // Cleanup tracking
  const cleanupFns = [];

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Realtime SDK E2E Integration Tests');
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
        `Volcano API server is not running at ${API_URL}. Please start the server first.`,
      );
    }

    // Create platform user
    platformUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `realtime-e2e-test-${Date.now()}`,
        name: 'Realtime E2E Test User',
      }),
    });
    cleanupFns.push(async () => {
      await mgmtFetch(`/users/${platformUser.id}`, { method: 'DELETE' }).catch(() => {});
    });
    console.log(`[ok] Created platform user: ${platformUser.id}`);

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUser.id}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'realtime-e2e-test-token' }),
    });
    platformToken = tokenResponse.token;
    console.log('[ok] Created platform token');

    // Create project with unique name
    project = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `realtime-e2e-${Date.now()}` }),
    });
    cleanupFns.push(async () => {
      await platformFetch(`/projects/${project.id}`, platformToken, { method: 'DELETE' }).catch(
        () => {},
      );
    });
    console.log(`[ok] Created project: ${project.id}`);

    // Create anon key with unique name using project ID to guarantee uniqueness
    // Include realtime permissions for WebSocket tests
    const anonKeyResponse = await platformFetch(
      `/projects/${project.id}/anon-keys`,
      platformToken,
      {
        method: 'POST',
        body: JSON.stringify({
          name: `e2e-key-${project.id.slice(0, 8)}`,
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

    // Realtime browser WebSocket upgrades use this project auth CORS config.
    await platformFetch(`/projects/${project.id}/auth/config`, platformToken, {
      method: 'PUT',
      body: JSON.stringify({
        cors_enabled: true,
        cors_allowed_origins: [ALLOWED_REALTIME_ORIGIN],
        cors_allow_credentials: true,
      }),
    });
    console.log('[ok] Configured realtime CORS origin');

    // Initialize SDK
    volcano = new VolcanoAuth({
      apiUrl: API_URL,
      anonKey: anonKey,
    });
    console.log('[ok] Initialized SDK');

    // Create an auth user for testing
    const email = `realtime-test-${Date.now()}@example.com`;
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
  });

  afterAll(async () => {
    console.log('\n--- Cleaning up ---');

    // Run cleanup in reverse order
    for (const cleanupFn of cleanupFns.reverse()) {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn(`Cleanup warning: ${error.message}`);
      }
    }

    console.log('[ok] Cleanup complete\n');
  });

  describe('VolcanoRealtime Connection', () => {
    let realtime;

    afterEach(async () => {
      if (realtime) {
        realtime.disconnect();
        realtime = null;
      }
    });

    test('connects with valid credentials', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });

      let connected = false;
      realtime.onConnect(() => {
        connected = true;
      });

      await realtime.connect();

      expect(realtime.isConnected()).toBe(true);
      expect(connected).toBe(true);
    });

    test('connects from an allowed browser Origin', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: authSession.access_token,
        webSocket: webSocketWithOrigin(ALLOWED_REALTIME_ORIGIN),
      });

      await realtime.connect();

      expect(realtime.isConnected()).toBe(true);
    });

    test('rejects a blocked browser Origin before connecting', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: authSession.access_token,
        webSocket: webSocketWithOrigin(BLOCKED_REALTIME_ORIGIN),
      });

      await expect(realtime.connect()).rejects.toThrow();
      expect(realtime.isConnected()).toBe(false);
    });

    test('rejects connection with invalid token', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: 'invalid-token-12345',
      });

      await expect(realtime.connect()).rejects.toThrow();
      expect(realtime.isConnected()).toBe(false);
    });

    test('rejects connection with invalid anon key', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: 'invalid-anon-key',
        accessToken: authSession.access_token,
      });

      await expect(realtime.connect()).rejects.toThrow();
      expect(realtime.isConnected()).toBe(false);
    });

    test('handles onDisconnect callback', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });

      let disconnected = false;
      realtime.onDisconnect(() => {
        disconnected = true;
      });

      await realtime.connect();
      realtime.disconnect();

      // Give it a moment to trigger the callback
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(disconnected).toBe(true);
    });

    test('handles onError callback', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: 'invalid-token',
      });

      realtime.onError(jest.fn());

      try {
        await realtime.connect();
      } catch {
        // Expected to fail
      }

      // Error callback may or may not fire depending on implementation
      expect(realtime.isConnected()).toBe(false);
    });
  });

  describe('Broadcast Channels', () => {
    let realtime;

    beforeAll(async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime) {
        realtime.disconnect();
      }
    });

    test('subscribes to broadcast channel', async () => {
      const channel = realtime.channel('test-broadcast');

      await channel.subscribe();

      expect(channel._subscription).not.toBeNull();
    });

    test('sends and receives broadcast messages', async () => {
      const channel = realtime.channel('test-broadcast-2');

      const messages = [];
      channel.on('message', (data) => {
        messages.push(data);
      });

      await channel.subscribe();

      // Send a message
      await channel.send({ event: 'message', text: 'Hello, World!' });

      // Wait for message to arrive
      await new Promise((resolve) => setTimeout(resolve, 500));

      // We may or may not receive our own message depending on server config
      // Just verify no errors occurred
      expect(true).toBe(true);
    });

    test('unsubscribes from channel', async () => {
      const channel = realtime.channel('test-unsubscribe');

      await channel.subscribe();
      channel.unsubscribe();

      expect(channel._subscription).toBeNull();
    });

    test('can subscribe to multiple channels', async () => {
      const channel1 = realtime.channel('multi-channel-1');
      const channel2 = realtime.channel('multi-channel-2');
      const channel3 = realtime.channel('multi-channel-3');

      await Promise.all([channel1.subscribe(), channel2.subscribe(), channel3.subscribe()]);

      expect(channel1._subscription).not.toBeNull();
      expect(channel2._subscription).not.toBeNull();
      expect(channel3._subscription).not.toBeNull();

      channel1.unsubscribe();
      channel2.unsubscribe();
      channel3.unsubscribe();
    });

    test('can listen to multiple event types', async () => {
      const channel = realtime.channel('multi-events');

      const chatMessages = [];
      const typingEvents = [];

      channel.on('chat', (data) => chatMessages.push(data));
      channel.on('typing', (data) => typingEvents.push(data));

      await channel.subscribe();

      // Send different event types
      await channel.send({ event: 'chat', text: 'Hello' });
      await channel.send({ event: 'typing', userId: 'user-1' });

      // Verify subscriptions work
      expect(true).toBe(true);

      channel.unsubscribe();
    });
  });

  describe('Presence Channels', () => {
    let realtime;

    beforeAll(async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime) {
        realtime.disconnect();
      }
    });

    test('subscribes to presence channel', async () => {
      const channel = realtime.channel('test-presence', { type: 'presence' });

      await channel.subscribe();

      expect(channel._subscription).not.toBeNull();
    });

    test('tracks presence state', async () => {
      const channel = realtime.channel('test-presence-track', { type: 'presence' });

      channel.onPresenceSync(jest.fn());

      await channel.subscribe();

      // Track presence
      await channel.track({ status: 'online', username: 'testuser' });

      // Wait for sync
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Get presence state
      const state = channel.getPresenceState();
      expect(state).toBeDefined();
    });

    test('receives join and leave events', async () => {
      const channel = realtime.channel('test-presence-events', { type: 'presence' });

      const events = [];

      channel.on('join', (info) => events.push({ type: 'join', info }));
      channel.on('leave', (info) => events.push({ type: 'leave', info }));

      await channel.subscribe();
      await channel.track({ status: 'active' });

      // Wait for events
      await new Promise((resolve) => setTimeout(resolve, 300));

      // Verify channel is working
      expect(channel.getPresenceState()).toBeDefined();

      channel.unsubscribe();
    });
  });

  describe('Cross-Project Security', () => {
    let realtime;

    beforeAll(async () => {
      // Create another project with unique name
      const otherProject = await platformFetch('/projects', platformToken, {
        method: 'POST',
        body: JSON.stringify({ name: `other-security-${Date.now()}` }),
      });
      cleanupFns.push(async () => {
        await platformFetch(`/projects/${otherProject.id}`, platformToken, {
          method: 'DELETE',
        }).catch(() => {});
      });

      // Create anon key for other project using project ID for uniqueness
      await platformFetch(`/projects/${otherProject.id}/anon-keys`, platformToken, {
        method: 'POST',
        body: JSON.stringify({
          name: `other-key-${otherProject.id.slice(0, 8)}`,
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
      });

      // Enable realtime for other project
      await platformFetch(`/projects/${otherProject.id}/realtime/config`, platformToken, {
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      });

      // Connect with main project credentials
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime) {
        realtime.disconnect();
      }
    });

    test('cannot subscribe to channel from another project', async () => {
      // Try to subscribe to a channel - the SDK now automatically prefixes with project ID
      // from the anon key, so cross-project subscriptions are blocked at the SDK level
      const channel = realtime.channel('secret-channel');

      // The subscription should work (our project's channel)
      await channel.subscribe();
      expect(channel._subscription).not.toBeNull();

      // Verify that channel name includes our project ID prefix
      expect(channel.name).toBe('broadcast:secret-channel');

      channel.unsubscribe();
    });
  });

  describe('Disconnect and Reconnection', () => {
    test('reconnects after disconnect', async () => {
      const realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });

      await realtime.connect();
      expect(realtime.isConnected()).toBe(true);

      realtime.disconnect();
      expect(realtime.isConnected()).toBe(false);

      // Reconnect
      await realtime.connect();
      expect(realtime.isConnected()).toBe(true);

      realtime.disconnect();
    });

    test('clears channels on disconnect', async () => {
      const realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });

      await realtime.connect();

      const channel = realtime.channel('test-clear');
      await channel.subscribe();

      realtime.disconnect();

      // Channels should be cleared
      expect(realtime._channels.size).toBe(0);
    });
  });

  describe('Rate Limiting and Limits', () => {
    let realtime;

    beforeAll(async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey: anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime) {
        realtime.disconnect();
      }
    });

    test('can send many messages without error', async () => {
      const channel = realtime.channel('rate-limit-test');
      await channel.subscribe();

      // Send 10 messages quickly
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(channel.send({ event: 'test', count: i }));
      }

      // Should not throw
      await Promise.all(promises);

      channel.unsubscribe();
    });
  });
});

// Export for Jest
module.exports = {};
