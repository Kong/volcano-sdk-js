/**
 * Realtime SDK Unit Tests
 *
 * These tests verify the VolcanoRealtime and RealtimeChannel classes
 * without requiring the actual centrifuge library.
 */

// Since centrifuge is a peer dependency, we test only the parts
// that don't require actual centrifuge client

import { RealtimeChannel, VolcanoRealtime } from '../src/realtime.ts';
import type { ConnectListener, DisconnectListener, ErrorListener } from './support/realtime-listeners.ts';

function makeRealtime(): VolcanoRealtime {
  return new VolcanoRealtime({ apiUrl: 'https://api.example.com', anonKey: 'project123.secret' });
}

function validatesConfiguration(): void {
  test('throws error if apiUrl is missing', () => {
    expect(() => {
      Reflect.construct(VolcanoRealtime, [{ anonKey: 'project123.secret' }]);
    }).toThrow('apiUrl is required');
  });

  test('throws error if anonKey is missing', () => {
    expect(() => {
      Reflect.construct(VolcanoRealtime, [{ apiUrl: 'https://api.example.com' }]);
    }).toThrow('anonKey is required');
  });

  test('creates client with valid config', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
      accessToken: 'token123',
    });

    expect(realtime.apiUrl).toBe('https://api.example.com');
    expect(realtime.anonKey).toBe('project123.secret');
    expect(realtime.accessToken).toBe('token123');
  });

  test('removes trailing slash from apiUrl', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com/',
      anonKey: 'project123.secret',
    });

    expect(realtime.apiUrl).toBe('https://api.example.com');
  });

  test('allows empty anon key with service role key', () => {
    // Service role keys contain the project ID, so anon key is optional
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      // Empty is allowed for service keys
      anonKey: '',
      accessToken: 'sk-service-key-jwt-token',
    });

    expect(realtime.apiUrl).toBe('https://api.example.com');
    expect(realtime.anonKey).toBe('');
    expect(realtime.accessToken).toBe('sk-service-key-jwt-token');
  });
}

function derivesWebSocketUrls(): void {
  test('generates wss URL for https', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    expect(realtime.wsUrl).toBe('wss://api.example.com/realtime/v1/websocket');
  });

  test('generates ws URL for http', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'http://localhost:8000',
      anonKey: 'project123.secret',
    });

    expect(realtime.wsUrl).toBe('ws://localhost:8000/realtime/v1/websocket');
  });
}

function createsTypedChannels(): void {
  test('creates broadcast channel by default', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const channel = realtime.channel('room-1');

    expect(channel).toBeInstanceOf(RealtimeChannel);
    // Channel name is type:name - server adds project prefix from anon key
    expect(channel.name).toBe('broadcast:room-1');
  });

  test('creates presence channel', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const channel = realtime.channel('lobby', { type: 'presence' });

    // Channel name is type:name - server adds project prefix from anon key
    expect(channel.name).toBe('presence:lobby');
  });

  test('creates postgres channel', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const channel = realtime.channel('public:messages', { type: 'postgres' });

    // Channel name is type:name - server adds project prefix from anon key
    expect(channel.name).toBe('postgres:public:messages');
  });

  test('returns same channel instance for same name', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const channel1 = realtime.channel('room-1');
    const channel2 = realtime.channel('room-1');

    expect(channel1).toBe(channel2);
  });
}

function routesPerUserPostgresChannels(): void {
  test('routes a per-user postgres channel to the base channel', () => {
    const realtime = makeRealtime();
    const channel = realtime.channel('public:messages', { type: 'postgres' });
    let delivered: unknown = null;
    channel._handlePublication = (ctx: unknown) => {
      delivered = ctx;
    };
    // Server delivers RLS-scoped changes on projectId:postgres:schema:table:userID
    realtime._handleServerPublication({
      channel: '00000000-0000-0000-0000-000000000000:postgres:public:messages:11111111-1111-1111-1111-111111111111',
      data: { type: 'INSERT', schema: 'public', table: 'messages' },
    });
    expect(delivered).not.toBeNull();
  });

  test('still routes a base (non-user) postgres channel', () => {
    const realtime = makeRealtime();
    const channel = realtime.channel('public:messages', { type: 'postgres' });
    let delivered: unknown = null;
    channel._handlePublication = (ctx: unknown) => {
      delivered = ctx;
    };
    realtime._handleServerPublication({
      channel: '00000000-0000-0000-0000-000000000000:postgres:public:messages',
      data: {},
    });
    expect(delivered).not.toBeNull();
  });
}

function rejectsUnrelatedPostgresChannels(): void {
  test('does not route an unrelated postgres table to a different channel', () => {
    const realtime = makeRealtime();
    const channel = realtime.channel('public:messages', { type: 'postgres' });
    let delivered: unknown = null;
    channel._handlePublication = (ctx: unknown) => {
      delivered = ctx;
    };
    realtime._handleServerPublication({
      channel: '00000000-0000-0000-0000-000000000000:postgres:public:other:11111111-1111-1111-1111-111111111111',
      data: {},
    });
    expect(delivered).toBeNull();
  });

  test('only the exact 5-segment per-user form triggers the fallback (no over-match)', () => {
    const realtime = makeRealtime();
    const channel = realtime.channel('public:messages', { type: 'postgres' });
    let delivered: unknown = null;
    channel._handlePublication = (ctx: unknown) => {
      delivered = ctx;
    };
    // A 6-segment channel is not the well-defined per-user format; it must not
    // be truncated and misrouted to postgres:public:messages.
    realtime._handleServerPublication({
      channel:
        '00000000-0000-0000-0000-000000000000:postgres:public:messages:extra:11111111-1111-1111-1111-111111111111',
      data: {},
    });
    expect(delivered).toBeNull();
  });
}

function registersConnectionCallbacks(): void {
  test('registers onConnect callback', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const callback = jest.fn<void, Parameters<ConnectListener>>();
    realtime.onConnect(callback);

    expect(realtime._onConnect).toContain(callback);
  });

  test('unregisters callback correctly', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const callback = jest.fn<void, Parameters<ConnectListener>>();
    const unsubscribe = realtime.onConnect(callback);

    unsubscribe();

    expect(realtime._onConnect).not.toContain(callback);
  });
}

function registersStatusCallbacks(): void {
  test('registers onDisconnect callback', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const callback = jest.fn<void, Parameters<DisconnectListener>>();
    realtime.onDisconnect(callback);

    expect(realtime._onDisconnect).toContain(callback);
  });

  test('registers onError callback', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    const callback = jest.fn<void, Parameters<ErrorListener>>();
    realtime.onError(callback);

    expect(realtime._onError).toContain(callback);
  });
}

function reportsTheInitialConnectionState(): void {
  test('returns false before connection', () => {
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
    });

    expect(realtime.isConnected()).toBe(false);
  });
}

describe('VolcanoRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    validatesConfiguration();
  });

  describe('wsUrl', () => {
    derivesWebSocketUrls();
  });

  describe('channel (without connection)', () => {
    createsTypedChannels();
  });

  describe('_handleServerPublication (per-user postgres routing, VOL-522)', () => {
    routesPerUserPostgresChannels();
    rejectsUnrelatedPostgresChannels();
  });

  describe('callbacks', () => {
    registersConnectionCallbacks();
    registersStatusCallbacks();
  });

  describe('isConnected', () => {
    reportsTheInitialConnectionState();
  });
});
