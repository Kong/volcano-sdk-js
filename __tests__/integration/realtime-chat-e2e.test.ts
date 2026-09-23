/**
 * End-to-End test replicating the realtime-chat example experience
 *
 * This test simulates the exact flow a user would go through:
 * 1. Sign up anonymously with a display name
 * 2. Connect to realtime using the access token
 * 3. Subscribe to a chat channel
 * 4. Send and receive messages
 * 5. Multiple users in the same room
 */

import { VolcanoAuth } from '../../src/index.ts';
import { VolcanoRealtime } from '../../src/realtime.ts';
import type { AuthResponse, Session, User } from '../../src/sdk-public-types.ts';

// Configuration from environment
const configuredApiUrl = process.env['VOLCANO_API_URL'];
const configuredMgmtUrl = process.env['VOLCANO_MGMT_URL'];
const API_URL =
  configuredApiUrl === undefined || configuredApiUrl === ''
    ? 'http://localhost:8000'
    : configuredApiUrl;
const MGMT_URL =
  configuredMgmtUrl === undefined || configuredMgmtUrl === ''
    ? 'http://localhost:8001'
    : configuredMgmtUrl;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, field: string): string {
  if (!isRecord(value) || typeof value[field] !== 'string') {
    throw new Error(`Expected ${field} in integration response`);
  }
  return value[field];
}

function assertSignedIn(
  value: AuthResponse,
): asserts value is AuthResponse & { session: Session; user: User } {
  if (value.session === null || value.user === null) {
    throw new Error('Expected an authenticated session');
  }
}

function connectionInfo(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  const info = value['connInfo'];
  return isRecord(info) ? info : null;
}

function displayName(value: unknown): unknown {
  const info = connectionInfo(value);
  if (info === null) {
    return undefined;
  }
  const metadata = info['user_metadata'];
  return isRecord(metadata) ? metadata['display_name'] : undefined;
}

function identityField(value: unknown, field: 'user' | 'client'): unknown {
  return isRecord(value) ? value[field] : undefined;
}

function connectionUserId(value: unknown): unknown {
  return connectionInfo(value)?.['user_id'];
}

function responseError(value: unknown): string {
  if (!isRecord(value)) {
    return 'Unknown error';
  }
  const error = value['error'];
  return typeof error === 'string' && error !== '' ? error : 'Unknown error';
}

function requestHeaders(options: RequestInit, token?: string): Headers {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token !== undefined && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  return headers;
}

// Helper to make management API calls
async function mgmtFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${MGMT_URL}${path}`, {
    ...options,
    headers: requestHeaders(options),
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => ({}));
    throw new Error(
      `Management API error: ${response.status.toString()} - ${responseError(error)}`,
    );
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

// Helper to make platform API calls with user token
async function platformFetch(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<unknown> {
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: requestHeaders(options, token),
  });

  if (!response.ok) {
    const error: unknown = await response.json().catch(() => ({}));
    throw new Error(`Platform API error: ${response.status.toString()} - ${responseError(error)}`);
  }

  if (response.status === 204) {
    return null;
  }
  return response.json();
}

describe('Realtime Chat E2E', () => {
  let platformUserId: string;
  let platformToken: string;
  let projectId: string;
  let anonKey: string;
  const cleanupFns: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    // Create platform user
    const platformUser = await mgmtFetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        id: `chat-e2e-test-${Date.now().toString()}`,
        name: 'Chat E2E Test User',
      }),
    });
    platformUserId = requiredString(platformUser, 'id');
    cleanupFns.push(async () => {
      await mgmtFetch(`/users/${platformUserId}`, { method: 'DELETE' }).catch(() => null);
    });

    // Create platform token
    const tokenResponse = await mgmtFetch(`/users/${platformUserId}/tokens`, {
      method: 'POST',
      body: JSON.stringify({ name: 'chat-e2e-test-token' }),
    });
    platformToken = requiredString(tokenResponse, 'token');

    // Create project
    const project = await platformFetch('/projects', platformToken, {
      method: 'POST',
      body: JSON.stringify({ name: `chat-e2e-${Date.now().toString()}` }),
    });
    projectId = requiredString(project, 'id');
    cleanupFns.push(async () => {
      await platformFetch(`/projects/${projectId}`, platformToken, { method: 'DELETE' }).catch(
        () => null,
      );
    });

    // Create anon key using project ID to guarantee uniqueness
    // Include realtime permissions for WebSocket tests
    const anonKeyResponse = await platformFetch(`/projects/${projectId}/anon-keys`, platformToken, {
      method: 'POST',
      body: JSON.stringify({
        name: `chat-key-${projectId.slice(0, 8)}`,
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

    // Enable anonymous signups
    await platformFetch(`/projects/${projectId}/auth/config`, platformToken, {
      method: 'PUT',
      body: JSON.stringify({
        enable_anonymous_signins: true,
        enable_signup: true,
        enable_email_password: true,
      }),
    });

    // Enable realtime
    await platformFetch(`/projects/${projectId}/realtime/config`, platformToken, {
      method: 'PUT',
      body: JSON.stringify({ enabled: true }),
    });
  });

  afterAll(async () => {
    const cleanupOrder = [...cleanupFns];
    cleanupOrder.reverse();
    for (const cleanup of cleanupOrder) {
      await cleanup();
    }
  });

  test('complete chat flow: anonymous signup -> connect -> chat', async () => {
    // 1. Sign up anonymously as "Alice"
    const aliceAuth = new VolcanoAuth({
      apiUrl: API_URL,
      anonKey,
    });

    const aliceSignup = await aliceAuth.auth.signInAnonymously({
      display_name: 'Alice',
    });

    expect(aliceSignup.error).toBeNull();
    assertSignedIn(aliceSignup);
    expect(aliceSignup.session).toBeDefined();
    expect(aliceSignup.session.access_token).toBeDefined();
    expect(aliceSignup.user).toBeDefined();

    // 2. Connect to realtime with Alice's access token
    const aliceRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: aliceSignup.session.access_token,
    });

    const aliceConnected = new Promise<void>((resolve) => {
      aliceRealtime.onConnect(() => {
        resolve();
      });
    });

    await aliceRealtime.connect();
    await aliceConnected;
    expect(aliceRealtime.isConnected()).toBe(true);

    // 3. Subscribe to chat channel
    const aliceMessages: unknown[] = [];
    const aliceChannel = aliceRealtime.channel('chat-general');

    aliceChannel.on('message', (msg) => {
      aliceMessages.push(msg);
    });

    await aliceChannel.subscribe();

    // 4. Send a message from Alice
    await aliceChannel.send({
      userId: aliceSignup.user.id,
      username: 'Alice',
      text: 'Hello from Alice!',
      timestamp: new Date().toISOString(),
    });

    // Wait for Alice to receive her own message
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0]).toMatchObject({ username: 'Alice', text: 'Hello from Alice!' });

    // Cleanup
    aliceChannel.unsubscribe();
    aliceRealtime.disconnect();
  });

  test('two users see each other symmetrically via presence', async () => {
    // Alice signs up with display_name in metadata
    const aliceAuth = new VolcanoAuth({ apiUrl: API_URL, anonKey });
    const aliceResult = await aliceAuth.auth.signInAnonymously({ display_name: 'Alice' });
    assertSignedIn(aliceResult);

    const aliceRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: aliceResult.session.access_token,
    });

    await aliceRealtime.connect();

    // Alice subscribes to presence channel
    const alicePresence = aliceRealtime.channel('test-room', { type: 'presence' });
    const aliceJoinEvents: unknown[] = [];
    let aliceSyncCount = 0;

    alicePresence.on('join', (info) => {
      aliceJoinEvents.push(info);
    });

    alicePresence.on('presence_sync', () => {
      aliceSyncCount++;
    });

    await alicePresence.subscribe();
    await alicePresence.track();

    // Wait for Alice's initial sync
    await new Promise((resolve) => setTimeout(resolve, 300));

    // Bob signs up and joins AFTER Alice
    const bobAuth = new VolcanoAuth({ apiUrl: API_URL, anonKey });
    const bobResult = await bobAuth.auth.signInAnonymously({ display_name: 'Bob' });
    assertSignedIn(bobResult);

    const bobRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: bobResult.session.access_token,
    });

    await bobRealtime.connect();

    // Bob subscribes to presence
    const bobPresence = bobRealtime.channel('test-room', { type: 'presence' });
    let bobSyncCount = 0;

    bobPresence.on('presence_sync', () => {
      bobSyncCount++;
    });

    await bobPresence.subscribe();
    await bobPresence.track();

    // Wait for events to propagate
    await new Promise((resolve) => setTimeout(resolve, 500));

    // CRITICAL: Both users should see each other (symmetric visibility)

    // Alice should see Bob (she was already subscribed when Bob joined)
    expect(aliceJoinEvents.length).toBeGreaterThan(0);
    const aliceSeeBobJoin = aliceJoinEvents.find((e) => displayName(e) === 'Bob');
    expect(aliceSeeBobJoin).toBeDefined();

    const aliceState = alicePresence.getPresenceState();
    const aliceSeesUsers = Object.values(aliceState);
    const aliceSeeBobInState = aliceSeesUsers.some((info) => displayName(info) === 'Bob');
    expect(aliceSeeBobInState).toBe(true);

    // Bob should see Alice (even though he joined late - via initial sync)
    const bobState = bobPresence.getPresenceState();
    const bobSeesUsers = Object.values(bobState);
    const bobSeeAlice = bobSeesUsers.some((info) => displayName(info) === 'Alice');
    expect(bobSeeAlice).toBe(true);

    // Both should see themselves too
    const aliceSeeSelf = aliceSeesUsers.some((info) => displayName(info) === 'Alice');
    const bobSeeSelf = bobSeesUsers.some((info) => displayName(info) === 'Bob');
    expect(aliceSeeSelf).toBe(true);
    expect(bobSeeSelf).toBe(true);

    // Verify count
    expect(aliceSeesUsers).toHaveLength(2);
    expect(bobSeesUsers).toHaveLength(2);

    // Verify sync events were triggered
    expect(aliceSyncCount).toBeGreaterThan(0);
    expect(bobSyncCount).toBeGreaterThan(0);

    // Cleanup
    alicePresence.unsubscribe();
    bobPresence.unsubscribe();
    aliceRealtime.disconnect();
    bobRealtime.disconnect();
  });

  test('user leaving and rejoining updates presence state correctly', async () => {
    // Alice and Bob sign up
    const aliceAuth = new VolcanoAuth({ apiUrl: API_URL, anonKey });
    const aliceResult = await aliceAuth.auth.signInAnonymously({ display_name: 'Alice' });
    assertSignedIn(aliceResult);

    const bobAuth = new VolcanoAuth({ apiUrl: API_URL, anonKey });
    const bobResult = await bobAuth.auth.signInAnonymously({ display_name: 'Bob' });
    assertSignedIn(bobResult);

    // Both connect and subscribe to presence
    const aliceRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: aliceResult.session.access_token,
    });
    await aliceRealtime.connect();

    const alicePresence = aliceRealtime.channel('leave-test', { type: 'presence' });
    const aliceLeaveEvents: unknown[] = [];
    const aliceJoinEvents: unknown[] = [];

    alicePresence.on('join', (info) => aliceJoinEvents.push(info));
    alicePresence.on('leave', (info) => aliceLeaveEvents.push(info));

    await alicePresence.subscribe();
    await alicePresence.track();

    await new Promise((resolve) => setTimeout(resolve, 300));

    const bobRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: bobResult.session.access_token,
    });
    await bobRealtime.connect();

    const bobPresence = bobRealtime.channel('leave-test', { type: 'presence' });
    await bobPresence.subscribe();
    await bobPresence.track();

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Verify: Both see each other (2 users total)
    let aliceState = alicePresence.getPresenceState();
    const bobState = bobPresence.getPresenceState();
    expect(Object.keys(aliceState)).toHaveLength(2);
    expect(Object.keys(bobState)).toHaveLength(2);

    // Bob disconnects (leaves)
    bobPresence.unsubscribe();
    bobRealtime.disconnect();

    // Wait for leave event
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Alice should have seen Bob leave
    expect(aliceLeaveEvents.length).toBeGreaterThan(0);
    const bobLeftEvent = aliceLeaveEvents.find(
      (e) =>
        identityField(e, 'user') === bobResult.user.id ||
        (typeof identityField(e, 'client') === 'string' && identityField(e, 'client') !== ''),
    );
    expect(bobLeftEvent).toBeDefined();

    // Alice should now only see herself (1 user)
    aliceState = alicePresence.getPresenceState();
    expect(Object.keys(aliceState)).toHaveLength(1);
    const aliceOnlySeesHerself = Object.values(aliceState).every(
      (info) => displayName(info) === 'Alice',
    );
    expect(aliceOnlySeesHerself).toBe(true);

    // Bob reconnects and rejoins
    const bobRealtime2 = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: bobResult.session.access_token,
    });
    await bobRealtime2.connect();

    const bobPresence2 = bobRealtime2.channel('leave-test', { type: 'presence' });
    await bobPresence2.subscribe();
    await bobPresence2.track();

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Alice should see Bob join again
    const bobRejoinEvent = aliceJoinEvents.find(
      (e) => connectionUserId(e) === bobResult.user.id && displayName(e) === 'Bob',
    );
    expect(bobRejoinEvent).toBeDefined();

    // Both should see each other again (2 users)
    aliceState = alicePresence.getPresenceState();
    const bobState2 = bobPresence2.getPresenceState();
    expect(Object.keys(aliceState)).toHaveLength(2);
    expect(Object.keys(bobState2)).toHaveLength(2);

    // Bob should see BOTH Alice and himself after rejoining
    const bobState2Users = Object.values(bobState2);
    const bobSeesAlice2 = bobState2Users.some((info) => displayName(info) === 'Alice');
    const bobSeesHimself2 = bobState2Users.some((info) => displayName(info) === 'Bob');
    expect(bobSeesAlice2).toBe(true);
    expect(bobSeesHimself2).toBe(true);

    // Alice should see BOTH herself and Bob
    const aliceStateUsers2 = Object.values(aliceState);
    const aliceSeesBob2 = aliceStateUsers2.some((info) => displayName(info) === 'Bob');
    const aliceSeesHerself2 = aliceStateUsers2.some((info) => displayName(info) === 'Alice');
    expect(aliceSeesBob2).toBe(true);
    expect(aliceSeesHerself2).toBe(true);

    // Cleanup
    alicePresence.unsubscribe();
    bobPresence2.unsubscribe();
    aliceRealtime.disconnect();
    bobRealtime2.disconnect();
  });

  test('user can only see messages after joining', async () => {
    // Alice connects first
    const aliceAuth = new VolcanoAuth({ apiUrl: API_URL, anonKey });
    const aliceResult = await aliceAuth.auth.signInAnonymously({ display_name: 'Alice' });
    assertSignedIn(aliceResult);

    const aliceRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: aliceResult.session.access_token,
    });

    await aliceRealtime.connect();
    const aliceChannel = aliceRealtime.channel('chat-test');
    await aliceChannel.subscribe();

    // Alice sends some messages before Bob joins
    await aliceChannel.send({
      userId: aliceResult.user.id,
      username: 'Alice',
      text: 'Message before Bob',
      timestamp: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 100));

    // Bob joins
    const bobAuth = new VolcanoAuth({ apiUrl: API_URL, anonKey });
    const bobResult = await bobAuth.auth.signInAnonymously({ display_name: 'Bob' });
    assertSignedIn(bobResult);

    const bobRealtime = new VolcanoRealtime({
      apiUrl: API_URL,
      anonKey,
      accessToken: bobResult.session.access_token,
    });

    await bobRealtime.connect();

    const bobMessages: unknown[] = [];
    const bobChannel = bobRealtime.channel('chat-test');
    bobChannel.on('message', (msg) => bobMessages.push(msg));
    await bobChannel.subscribe();

    // Bob should NOT see Alice's old messages (no history)
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(bobMessages).toHaveLength(0);

    // Alice sends a new message
    await aliceChannel.send({
      userId: aliceResult.user.id,
      username: 'Alice',
      text: 'Message after Bob joined',
      timestamp: new Date().toISOString(),
    });

    await new Promise((resolve) => setTimeout(resolve, 200));

    // Bob SHOULD see the new message
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0]).toMatchObject({ text: 'Message after Bob joined' });

    // Cleanup
    aliceChannel.unsubscribe();
    bobChannel.unsubscribe();
    aliceRealtime.disconnect();
    bobRealtime.disconnect();
  });
});
