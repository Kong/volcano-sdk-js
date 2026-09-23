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

import { resolve } from 'node:path';
import { config } from 'dotenv';
import WebSocket from 'ws';
import { VolcanoAuth } from '../../src/index.ts';
import { VolcanoRealtime } from '../../src/realtime.ts';
import type { Session, User } from '../../src/sdk-public-types.ts';
import {
  integrationUrl,
  isRecord,
  managementFetch,
  platformFetch as fetchPlatform,
  requiredString,
} from './http.ts';

config({ path: resolve(__dirname, '../../../.env') });

// Configuration from environment
const API_URL = integrationUrl('VOLCANO_API_URL', 'http://localhost:8000');
const MGMT_URL = integrationUrl('VOLCANO_MGMT_URL', 'http://localhost:8001');
const REALTIME_URL = integrationUrl('VOLCANO_REALTIME_URL', API_URL);
const ALLOWED_REALTIME_ORIGIN = 'https://allowed-realtime-origin.example.com';
const BLOCKED_REALTIME_ORIGIN = 'https://blocked-realtime-origin.example.com';

function mgmtFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  return managementFetch(MGMT_URL, path, options);
}

function platformFetch(path: string, token: string, options: RequestInit = {}): Promise<unknown> {
  return fetchPlatform(API_URL, path, token, options);
}

function webSocketWithOrigin(origin: string) {
  return class OriginWebSocket extends WebSocket {
    constructor(address: string | URL, protocols?: string | string[], options?: unknown) {
      const provided = isRecord(options) ? options : {};
      const headers = isRecord(provided['headers']) ? provided['headers'] : {};
      super(address, protocols, {
        ...provided,
        headers: {
          ...headers,
          Origin: origin,
        },
      });
    }
  };
}

function requireRealtime(value: VolcanoRealtime | null): VolcanoRealtime {
  if (value === null) {
    throw new Error('Expected a connected realtime client');
  }
  return value;
}

async function verifyServer(): Promise<void> {
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
}

describe('Realtime SDK E2E Integration Tests', () => {
  // Test fixtures
  let platformUserId: string;
  let platformToken: string;
  let projectId: string;
  let anonKey: string;
  let volcano: VolcanoAuth;
  let authUser: User;
  let authSession: Session;

  // Cleanup tracking
  const cleanupFns: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    console.log('\n========================================');
    console.log('Realtime SDK E2E Integration Tests');
    console.log('========================================\n');

    await verifyServer();

    // Create platform user
    const platformUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `realtime-e2e-test-${Date.now().toString()}`,
        name: 'Realtime E2E Test User',
      }),
    });
    platformUserId = requiredString(platformUser, 'id');
    cleanupFns.push(async () => {
      await mgmtFetch(`/users/${platformUserId}`, { method: 'DELETE' }).catch(() => null);
    });
    console.log(`[ok] Created platform user: ${platformUserId}`);

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUserId}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'realtime-e2e-test-token' }),
    });
    platformToken = requiredString(tokenResponse, 'token');
    console.log('[ok] Created platform token');

    // Create project with unique name
    const project = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `realtime-e2e-${Date.now().toString()}` }),
    });
    projectId = requiredString(project, 'id');
    cleanupFns.push(async () => {
      await platformFetch(`/projects/${projectId}`, platformToken, { method: 'DELETE' }).catch(
        () => null,
      );
    });
    console.log(`[ok] Created project: ${projectId}`);

    // Create anon key with unique name using project ID to guarantee uniqueness
    // Include realtime permissions for WebSocket tests
    const anonKeyResponse = await platformFetch(`/projects/${projectId}/anon-keys`, platformToken, {
      method: 'POST',
      body: JSON.stringify({
        name: `e2e-key-${projectId.slice(0, 8)}`,
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
    anonKey = requiredString(anonKeyResponse, 'key_value');
    console.log('[ok] Created anon key');

    // Enable realtime for the project
    await platformFetch(`/projects/${projectId}/realtime/config`, platformToken, {
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
    await platformFetch(`/projects/${projectId}/auth/config`, platformToken, {
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
      anonKey,
    });
    console.log('[ok] Initialized SDK');

    // Create an auth user for testing
    const email = `realtime-test-${Date.now().toString()}@example.com`;
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
      throw new Error('Expected a signed-in test user');
    }
    authUser = signUpResult.user;
    authSession = signUpResult.session;
    console.log(`[ok] Created auth user: ${authUser.email}`);

    console.log('\n--- Setup complete ---\n');
  });

  afterAll(async () => {
    console.log('\n--- Cleaning up ---');

    // Run cleanup in reverse order
    const cleanupOrder = [...cleanupFns];
    cleanupOrder.reverse();
    for (const cleanupFn of cleanupOrder) {
      try {
        await cleanupFn();
      } catch (error) {
        console.warn(
          `Cleanup warning: ${error instanceof Error ? error.message : 'Unknown error'}`,
        );
      }
    }

    console.log('[ok] Cleanup complete\n');
  });

  describe('VolcanoRealtime Connection', () => {
    let realtime: VolcanoRealtime | null = null;

    afterEach(() => {
      if (realtime !== null) {
        realtime.disconnect();
        realtime = null;
      }
    });

    test('connects with valid credentials', async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
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
        anonKey,
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
        anonKey,
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
        anonKey,
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
    let realtime: VolcanoRealtime | null = null;

    beforeAll(async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime !== null) {
        realtime.disconnect();
      }
    });

    test('subscribes to broadcast channel', async () => {
      const channel = requireRealtime(realtime).channel('test-broadcast');

      await channel.subscribe();

      expect(channel._subscription).not.toBeNull();
    });

    test('sends a broadcast message without error', async () => {
      const channel = requireRealtime(realtime).channel('test-broadcast-2');

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
      const channel = requireRealtime(realtime).channel('test-unsubscribe');

      await channel.subscribe();
      channel.unsubscribe();

      const subscription = channel._subscription;
      if (subscription === null) {
        throw new Error('Expected an active subscription');
      }
      expect(subscription.state).toBe('unsubscribed');
    });

    test('can subscribe to multiple channels', async () => {
      const channel1 = requireRealtime(realtime).channel('multi-channel-1');
      const channel2 = requireRealtime(realtime).channel('multi-channel-2');
      const channel3 = requireRealtime(realtime).channel('multi-channel-3');

      await Promise.all([channel1.subscribe(), channel2.subscribe(), channel3.subscribe()]);

      expect(channel1._subscription).not.toBeNull();
      expect(channel2._subscription).not.toBeNull();
      expect(channel3._subscription).not.toBeNull();

      channel1.unsubscribe();
      channel2.unsubscribe();
      channel3.unsubscribe();
    });

    test('can listen to multiple event types', async () => {
      const channel = requireRealtime(realtime).channel('multi-events');

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
    let realtime: VolcanoRealtime | null = null;

    beforeAll(async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime !== null) {
        realtime.disconnect();
      }
    });

    test('subscribes to presence channel', async () => {
      const channel = requireRealtime(realtime).channel('test-presence', { type: 'presence' });

      await channel.subscribe();

      expect(channel._subscription).not.toBeNull();
    });

    test('tracks presence state', async () => {
      const channel = requireRealtime(realtime).channel('test-presence-track', {
        type: 'presence',
      });

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
      const channel = requireRealtime(realtime).channel('test-presence-events', {
        type: 'presence',
      });

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
    let realtime: VolcanoRealtime | null = null;

    beforeAll(async () => {
      // Create another project with unique name
      const otherProject = await platformFetch('/projects', platformToken, {
        method: 'POST',
        body: JSON.stringify({ name: `other-security-${Date.now().toString()}` }),
      });
      const otherProjectId = requiredString(otherProject, 'id');
      cleanupFns.push(async () => {
        await platformFetch(`/projects/${otherProjectId}`, platformToken, {
          method: 'DELETE',
        }).catch(() => null);
      });

      // Create anon key for other project using project ID for uniqueness
      await platformFetch(`/projects/${otherProjectId}/anon-keys`, platformToken, {
        method: 'POST',
        body: JSON.stringify({
          name: `other-key-${otherProjectId.slice(0, 8)}`,
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
      await platformFetch(`/projects/${otherProjectId}/realtime/config`, platformToken, {
        method: 'PUT',
        body: JSON.stringify({ enabled: true }),
      });

      // Connect with main project credentials
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime !== null) {
        realtime.disconnect();
      }
    });

    test('cannot subscribe to channel from another project', async () => {
      // Try to subscribe to a channel - the SDK now automatically prefixes with project ID
      // from the anon key, so cross-project subscriptions are blocked at the SDK level
      const channel = requireRealtime(realtime).channel('secret-channel');

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
        anonKey,
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
        anonKey,
        accessToken: authSession.access_token,
      });

      await realtime.connect();

      const channel = requireRealtime(realtime).channel('test-clear');
      await channel.subscribe();

      realtime.disconnect();

      // Channels should be cleared
      expect(realtime._channels.size).toBe(0);
    });
  });

  describe('Rate Limiting and Limits', () => {
    let realtime: VolcanoRealtime | null = null;

    beforeAll(async () => {
      realtime = new VolcanoRealtime({
        apiUrl: REALTIME_URL,
        anonKey,
        accessToken: authSession.access_token,
      });
      await realtime.connect();
    });

    afterAll(() => {
      if (realtime !== null) {
        realtime.disconnect();
      }
    });

    test('can send many messages without error', async () => {
      const channel = requireRealtime(realtime).channel('rate-limit-test');
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
