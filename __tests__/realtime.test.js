/**
 * Realtime SDK Unit Tests
 *
 * These tests verify the VolcanoRealtime and RealtimeChannel classes
 * without requiring the actual centrifuge library.
 */

// Since centrifuge is a peer dependency, we test only the parts
// that don't require actual centrifuge client

const { VolcanoRealtime, RealtimeChannel } = require('../src/realtime.js');

describe('VolcanoRealtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('throws error if apiUrl is missing', () => {
      expect(
        () =>
          new VolcanoRealtime({
            anonKey: 'project123.secret',
          }),
      ).toThrow('apiUrl is required');
    });

    test('throws error if anonKey is missing', () => {
      expect(
        () =>
          new VolcanoRealtime({
            apiUrl: 'https://api.example.com',
          }),
      ).toThrow('anonKey is required');
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
        anonKey: '', // Empty is allowed for service keys
        accessToken: 'sk-service-key-jwt-token',
      });

      expect(realtime.apiUrl).toBe('https://api.example.com');
      expect(realtime.anonKey).toBe('');
      expect(realtime.accessToken).toBe('sk-service-key-jwt-token');
    });
  });

  describe('wsUrl', () => {
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
  });

  describe('channel (without connection)', () => {
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
  });

  describe('callbacks', () => {
    test('registers onConnect callback', () => {
      const realtime = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project123.secret',
      });

      const callback = jest.fn();
      realtime.onConnect(callback);

      expect(realtime._onConnect).toContain(callback);
    });

    test('unregisters callback correctly', () => {
      const realtime = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project123.secret',
      });

      const callback = jest.fn();
      const unsubscribe = realtime.onConnect(callback);

      unsubscribe();

      expect(realtime._onConnect).not.toContain(callback);
    });

    test('registers onDisconnect callback', () => {
      const realtime = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project123.secret',
      });

      const callback = jest.fn();
      realtime.onDisconnect(callback);

      expect(realtime._onDisconnect).toContain(callback);
    });

    test('registers onError callback', () => {
      const realtime = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project123.secret',
      });

      const callback = jest.fn();
      realtime.onError(callback);

      expect(realtime._onError).toContain(callback);
    });
  });

  describe('isConnected', () => {
    test('returns false before connection', () => {
      const realtime = new VolcanoRealtime({
        apiUrl: 'https://api.example.com',
        anonKey: 'project123.secret',
      });

      expect(realtime.isConnected()).toBe(false);
    });
  });
});

describe('RealtimeChannel', () => {
  let realtime;

  beforeEach(() => {
    jest.clearAllMocks();
    realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
      accessToken: 'token123',
    });
  });

  describe('subscribe', () => {
    test('throws error if not connected', async () => {
      const channel = realtime.channel('room-1');

      await expect(channel.subscribe()).rejects.toThrow('Not connected');
    });
  });

  describe('on', () => {
    test('registers callback for events', () => {
      const channel = realtime.channel('room-1');

      const callback = jest.fn();
      channel.on('message', callback);

      expect(channel._callbacks.get('message')).toContain(callback);
    });

    test('returns unsubscribe function', () => {
      const channel = realtime.channel('room-1');

      const callback = jest.fn();
      const unsubscribe = channel.on('message', callback);

      unsubscribe();

      expect(channel._callbacks.get('message')).not.toContain(callback);
    });

    test('supports wildcard listeners', () => {
      const channel = realtime.channel('room-1');

      const callback = jest.fn();
      channel.on('*', callback);

      expect(channel._callbacks.get('*')).toContain(callback);
    });
  });

  describe('send', () => {
    test('throws error for non-broadcast channels', async () => {
      const channel = realtime.channel('lobby', { type: 'presence' });

      await expect(channel.send({ text: 'hello' })).rejects.toThrow(
        'only available for broadcast channels',
      );
    });

    test('throws error if not subscribed', async () => {
      const channel = realtime.channel('room-1');

      await expect(channel.send({ text: 'hello' })).rejects.toThrow('Channel not subscribed');
    });
  });

  describe('onPostgresChanges', () => {
    test('throws error for non-postgres channels', () => {
      const channel = realtime.channel('room-1');

      expect(() => {
        channel.onPostgresChanges('*', 'public', 'messages', jest.fn());
      }).toThrow('only available for postgres channels');
    });

    test('registers callback for postgres channel', () => {
      const channel = realtime.channel('public:messages', { type: 'postgres' });

      const callback = jest.fn();
      channel.onPostgresChanges('INSERT', 'public', 'messages', callback);

      expect(channel._callbacks.get('*')).toHaveLength(1);
    });
  });

  describe('presence', () => {
    test('onPresenceSync throws error for non-presence channels', () => {
      const channel = realtime.channel('room-1');

      expect(() => {
        channel.onPresenceSync(jest.fn());
      }).toThrow('only available for presence channels');
    });

    test('track throws error for non-presence channels', async () => {
      const channel = realtime.channel('room-1');

      await expect(channel.track({ status: 'online' })).rejects.toThrow(
        'only available for presence channels',
      );
    });

    test('getPresenceState returns empty object initially', () => {
      const channel = realtime.channel('lobby', { type: 'presence' });

      expect(channel.getPresenceState()).toEqual({});
    });

    test('onPresenceSync registers callback for presence channel', () => {
      const channel = realtime.channel('lobby', { type: 'presence' });

      const callback = jest.fn();
      channel.onPresenceSync(callback);

      expect(channel._callbacks.get('presence_sync')).toHaveLength(1);
    });
  });

  describe('unsubscribe', () => {
    test('clears callbacks', () => {
      const channel = realtime.channel('room-1');

      channel.on('message', jest.fn());
      channel.on('update', jest.fn());

      channel.unsubscribe();

      expect(channel._callbacks.size).toBe(0);
    });

    test('clears presence state', () => {
      const channel = realtime.channel('lobby', { type: 'presence' });

      channel.unsubscribe();

      expect(channel.getPresenceState()).toEqual({});
    });
  });
});
