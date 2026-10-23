import { afterEach, describe, expect, jest, test } from '@jest/globals';
import * as centrifuge from '../src/realtime-centrifuge.ts';
import { isTransportClient, VolcanoRealtime } from '../src/realtime-client.ts';
import type { ConnectionOptions } from '../src/realtime-connection.ts';

type Listener = (context: unknown) => void;

const transports: MockTransport[] = [];
let ready = true;
let connectStarted: ((transport: MockTransport) => void) | undefined;

class MockTransport {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly url: string;
  readonly options: ConnectionOptions;
  readonly disconnect = jest.fn();
  readonly removed: unknown[] = [];

  constructor(url: string, options: ConnectionOptions) {
    this.url = url;
    this.options = options;
    transports.push(this);
  }

  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, context: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(context);
    }
  }

  connect(): void {
    connectStarted?.(this);
    if (ready) {
      this.emit('connected', { client: 'connected', latency: 1 });
    }
  }

  newSubscription(): unknown {
    return undefined;
  }

  getSubscription(): unknown {
    return undefined;
  }

  removeSubscription(subscription: unknown): void {
    this.removed.push(subscription);
  }

  presence(): Promise<unknown> {
    return Promise.resolve({ clients: {} });
  }
}

function latestTransport(): MockTransport {
  const latest = transports.at(-1);
  if (latest === undefined) {
    throw new Error('transport was not constructed');
  }
  return latest;
}

function client(): VolcanoRealtime {
  return new VolcanoRealtime({
    apiUrl: 'https://api.example.com/',
    anonKey: 'a b',
    webSocket: WebSocket,
  });
}

function nextConnection(): Promise<MockTransport> {
  return new Promise((resolve) => {
    connectStarted = resolve;
  });
}

afterEach(() => {
  jest.restoreAllMocks();
  transports.length = 0;
  ready = true;
  connectStarted = undefined;
});

describe('realtime client facade', () => {
  test('requires every transport operation before connecting', () => {
    expect(isTransportClient(null)).toBe(false);
    expect(isTransportClient(() => 'not transport')).toBe(false);
    expect(
      isTransportClient({
        connect() {
          return 'not enough';
        },
      }),
    ).toBe(false);
    expect(
      isTransportClient(
        new MockTransport('url', {
          token: undefined,
          getToken: undefined,
          debug: false,
          websocket: WebSocket,
        }),
      ),
    ).toBe(true);
    const callable = (): void => undefined;
    Object.setPrototypeOf(
      callable,
      new MockTransport('url', {
        token: undefined,
        getToken: undefined,
        debug: false,
        websocket: WebSocket,
      }),
    );
    expect(isTransportClient(callable)).toBe(false);
  });

  test('uses an explicitly supplied WebSocket constructor', async () => {
    class ProvidedWebSocket extends WebSocket {}
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'key',
      webSocket: ProvidedWebSocket,
    });
    await realtime.connect();
    expect(latestTransport().options.websocket).toBe(ProvidedWebSocket);
    realtime.disconnect();
  });

  test('connects once, delivers transport contexts, and removes every listener', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = client();
    const connected: unknown[] = [];
    const disconnected: unknown[] = [];
    const errors: unknown[] = [];
    const offConnect = realtime.onConnect((context) => {
      connected.push(context);
    });
    const offDisconnect = realtime.onDisconnect((context) => {
      disconnected.push(context);
    });
    const offError = realtime.onError((context) => {
      errors.push(context);
    });
    await realtime.connect();
    const transport = latestTransport();
    expect(transport.url).toBe('wss://api.example.com/realtime/v1/websocket?apikey=a%20b');
    expect(transport.options.websocket).toBe(WebSocket);
    expect(realtime.isConnected()).toBe(true);
    expect(connected).toEqual([{ client: 'connected', latency: 1 }]);
    await realtime.connect();
    expect(latestTransport()).toBe(transport);

    transport.emit('connected', { client: 3, latency: 'bad' });
    transport.emit('error', { type: 'transport', error: { message: 'lost', code: 4 } });
    transport.emit('disconnected', { code: 1, reason: 'network', reconnect: true });
    expect(connected).toEqual([{ client: 'connected', latency: 1 }, {}]);
    expect(errors).toEqual([{ error: { message: 'lost', code: 4 }, message: 'lost', code: 4 }]);
    expect(disconnected).toEqual([{ code: 1, reason: 'network', reconnect: true }]);
    expect(realtime.isConnected()).toBe(false);

    realtime.disconnect();
    expect(disconnected.at(-1)).toEqual({ reason: 'manual' });
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(realtime.isConnected()).toBe(false);
    expect(transport.listeners.get('publication')?.size).toBe(0);
    expect(realtime.getClient()).toBeNull();
    offConnect();
    offDisconnect();
    offError();
    expect(realtime._onConnect).toEqual([]);
    expect(realtime._onDisconnect).toEqual([]);
    expect(realtime._onError).toEqual([]);
  });

  test('shares an in-flight connection and accepts token refresh after readiness', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    ready = false;
    const realtime = client();
    const started = nextConnection();
    const first = realtime.connect();
    const second = realtime.connect();
    const transport = await started;
    transport.emit('connected', {});
    await Promise.all([first, second]);
    expect(realtime._connectionPromise).toBeNull();
    expect(realtime.isConnected()).toBe(true);
    realtime._adoptAccessToken('new-token');
    expect(realtime.accessToken).toBe('new-token');
    realtime.disconnect();
  });

  test('rejects shared connection attempts with the terminal transport reason', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    ready = false;
    const realtime = client();
    const onDisconnect = jest.fn();
    realtime.onDisconnect(onDisconnect);
    const started = nextConnection();
    const first = realtime.connect();
    const second = realtime.connect();
    const firstRejection = first.catch((error: unknown) => error);
    const secondRejection = second.catch((error: unknown) => error);
    const transport = await started;
    transport.emit('disconnected', { code: 3507, reason: 'permission denied' });
    expect(await firstRejection).toMatchObject({ message: 'permission denied', code: 3507 });
    expect(await secondRejection).toMatchObject({ message: 'permission denied', code: 3507 });
    expect(realtime._connectionPromise).toBeNull();
    expect(realtime.isConnected()).toBe(false);
    expect(onDisconnect).toHaveBeenCalledWith({ code: 3507, reason: 'permission denied' });
    expect(realtime.getClient()).toBeNull();
    expect(realtime._clientHandlers).toBeNull();
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(transport.listeners.get('disconnected')?.size).toBe(0);
    for (const listeners of transport.listeners.values()) {
      expect(listeners.size).toBe(0);
    }
    ready = true;
    await realtime.connect();
    expect(latestTransport()).not.toBe(transport);
    expect(realtime.isConnected()).toBe(true);
    // Stale clients can no longer change the new connection's state.
    transport.emit('disconnected', { code: 3507, reason: 'old failure' });
    expect(realtime.isConnected()).toBe(true);
    expect(onDisconnect).toHaveBeenCalledTimes(1);
    realtime.disconnect();
  });

  test('rejects an invalid transport without marking the client connected', async () => {
    class InvalidTransport {
      readonly invalid = true;
    }
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(InvalidTransport);
    const realtime = client();
    await expect(realtime.connect()).rejects.toThrow('required client methods');
    expect(realtime._connectionPromise).toBeNull();
    expect(realtime.getClient()).toBeNull();
  });

  test('preserves a connection failure when transport disposal throws', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    ready = false;
    const realtime = client();
    const started = nextConnection();
    const failed = realtime.connect().catch((error: unknown) => error);
    const transport = await started;
    transport.disconnect.mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    transport.emit('disconnected', { code: 3507, reason: 'connection failed' });
    expect(await failed).toEqual(new Error('connection failed'));
    expect(realtime.getClient()).toBeNull();
    expect(realtime._clientHandlers).toBeNull();
    for (const listeners of transport.listeners.values()) {
      expect(listeners.size).toBe(0);
    }
  });

  test('reports retryable startup errors without disposing the recovering transport', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    ready = false;
    const realtime = client();
    const onError = jest.fn();
    realtime.onError(onError);
    const started = nextConnection();
    const connecting = realtime.connect();
    const transport = await started;
    transport.emit('error', { error: { code: 109, message: 'token expired' } });
    await Promise.resolve();
    expect(transport.disconnect).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith({
      error: { code: 109, message: 'token expired' },
      code: 109,
      message: 'token expired',
    });
    transport.emit('connected', {});
    await connecting;
    expect(realtime.isConnected()).toBe(true);
    expect(realtime.getClient()).toBe(transport);
    realtime.disconnect();
  });

  test('releases a timed-out transport and prevents late connections', async () => {
    jest.useFakeTimers();
    try {
      jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
      ready = false;
      const realtime = client();
      const started = nextConnection();
      const failed = realtime.connect().catch((error: unknown) => error);
      const transport = await started;
      await jest.advanceTimersByTimeAsync(10_000);
      expect(await failed).toEqual(new Error('Connection timeout'));
      expect(realtime.getClient()).toBeNull();
      expect(transport.disconnect).toHaveBeenCalledTimes(1);
      for (const listeners of transport.listeners.values()) {
        expect(listeners.size).toBe(0);
      }
      transport.emit('connected', {});
      expect(realtime.isConnected()).toBe(false);
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });

  test('rejects a manually cancelled pending connection without disposing twice', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    ready = false;
    const realtime = client();
    const started = nextConnection();
    const failed = realtime.connect().catch((error: unknown) => error);
    const transport = await started;
    transport.disconnect.mockImplementationOnce(() => {
      transport.emit('disconnected', { code: 0, reason: 'disconnect called' });
    });
    realtime.disconnect();
    expect(await failed).toMatchObject({ message: 'disconnect called', code: 0 });
    expect(transport.disconnect).toHaveBeenCalledTimes(1);
    expect(realtime.getClient()).toBeNull();
    expect(realtime._clientHandlers).toBeNull();
    for (const listeners of transport.listeners.values()) {
      expect(listeners.size).toBe(0);
    }
  });

  test('loads the default WebSocket and adopts refreshed credentials', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'key',
      getToken: () => Promise.resolve('fresh'),
    });
    realtime.setDatabaseName('selected');
    expect(realtime.getDatabaseName()).toBe('selected');
    realtime.disconnect();
    await realtime.connect();
    const transport = latestTransport();
    expect(typeof transport.options.websocket).toBe('function');
    await expect(transport.options.getToken?.()).resolves.toBe('fresh');
    expect(realtime.accessToken).toBe('fresh');
    realtime._handleServerPublication({ channel: 'malformed', data: {} });
    realtime.disconnect();
  });

  test('routes transport publications and presence events to active channels', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = client();
    const message: unknown[] = [];
    const presence: unknown[] = [];
    realtime.channel('room').on('message', (data) => {
      message.push(data);
    });
    const room = realtime.channel('lobby', { type: 'presence' });
    room.onPresenceSync((state) => {
      presence.push({ ...state });
    });
    await realtime.connect();
    const transport = latestTransport();
    transport.emit('publication', { channel: 'project:broadcast:room', data: { text: 'hi' } });
    transport.emit('join', { channel: 'project:presence:lobby', info: { client: 'alice' } });
    transport.emit('subscribed', {
      channel: 'project:presence:lobby',
      data: { presence: { bob: { client: 'bob' } } },
    });
    transport.emit('leave', { channel: 'project:presence:lobby', info: { client: 'bob' } });
    expect(message).toEqual([{ text: 'hi' }]);
    expect(presence).toEqual([{ alice: { client: 'alice' } }, { bob: { client: 'bob' } }, {}]);
    realtime.disconnect();
  });

  test('routes per-user postgres publications to the base channel unless an exact channel exists', () => {
    const realtime = client();
    const base = realtime.channel('public:messages', { type: 'postgres' });
    const direct = realtime.channel('public:messages:user-1', { type: 'postgres' });
    const basePublication = jest
      .spyOn(base, '_handlePublication')
      .mockImplementation(jest.fn<(context: unknown) => void>());
    const directPublication = jest
      .spyOn(direct, '_handlePublication')
      .mockImplementation(jest.fn<(context: unknown) => void>());
    const event = { channel: 'project:postgres:public:messages:user-1', data: { id: 1 } };

    realtime._handleServerPublication(event);
    expect(directPublication).toHaveBeenCalledWith(event);
    expect(basePublication).not.toHaveBeenCalled();
    realtime.removeChannel('public:messages:user-1', 'postgres');
    realtime._handleServerPublication(event);
    expect(basePublication).toHaveBeenCalledWith(event);
  });

  test('ignores malformed and paused presence routes while preserving active state', () => {
    const realtime = client();
    const room = realtime.channel('lobby', { type: 'presence' });
    const route = { channel: 'project:presence:lobby' };
    expect(realtime._activePresenceChannel(null)).toBeNull();
    expect(realtime._activePresenceChannel({ channel: 'project:broadcast:lobby' })).toBeNull();
    expect(realtime._activePresenceChannel(route)).toBe(room);
    realtime._handleServerJoin({ ...route, info: { client: 3 } });
    realtime._handleServerSubscribed({ ...route, data: { presence: null } });
    expect(room.getPresenceState()).toEqual({});
    realtime._handleServerJoin({ ...route, info: { client: 'alice' } });
    realtime._handleServerLeave({ ...route, info: { client: 3 } });
    expect(room.getPresenceState()).toEqual({ alice: { client: 'alice' } });
    room._paused = true;
    realtime._handleServerJoin({ ...route, info: { client: 'bob' } });
    realtime._handleServerLeave({ ...route, info: { client: 'alice' } });
    realtime._handleServerSubscribed({ ...route, data: { presence: {} } });
    expect(room.getPresenceState()).toEqual({ alice: { client: 'alice' } });
  });

  test('preserves presence state on malformed events and emits join and leave events', () => {
    const realtime = client();
    const room = realtime.channel('lobby', { type: 'presence' });
    const route = { channel: 'project:presence:lobby' };
    const joined: unknown[] = [];
    const left: unknown[] = [];
    const synced: unknown[] = [];
    room.on('join', (info) => {
      joined.push(info);
    });
    room.on('leave', (info) => {
      left.push(info);
    });
    room.onPresenceSync((state) => {
      synced.push({ ...state });
    });
    realtime._handleServerSubscribed({ ...route, data: { presence: { '3': { client: '3' } } } });
    expect(synced).toHaveLength(1);
    realtime._handleServerSubscribed({ ...route, data: { presence: null } });
    expect(synced).toHaveLength(1);
    realtime._handleServerJoin({ ...route, info: { client: 'alice' } });
    realtime._handleServerLeave({ ...route, info: { client: 3 } });
    expect(room.getPresenceState()).toHaveProperty('3');
    realtime._handleServerLeave({ ...route, info: { client: 'alice' } });
    expect(joined).toEqual([{ client: 'alice' }]);
    expect(left).toEqual([{ client: 3 }, { client: 'alice' }]);
  });

  test('unsubscribing one listener preserves other listeners for every connection event', () => {
    const realtime = client();
    const contexts: unknown[] = [];
    const offConnect = realtime.onConnect((context) => {
      contexts.push(context);
    });
    realtime.onConnect((context) => {
      contexts.push(context);
    });
    const offDisconnect = realtime.onDisconnect((context) => {
      contexts.push(context);
    });
    realtime.onDisconnect((context) => {
      contexts.push(context);
    });
    const offError = realtime.onError((context) => {
      contexts.push(context);
    });
    realtime.onError((context) => {
      contexts.push(context);
    });
    offConnect();
    offDisconnect();
    offError();
    expect(realtime._onConnect).toHaveLength(1);
    expect(realtime._onDisconnect).toHaveLength(1);
    expect(realtime._onError).toHaveLength(1);
    realtime._onConnect[0]?.({ client: 'active' });
    realtime._onDisconnect[0]?.({ reason: 'closed' });
    realtime._onError[0]?.({ message: 'failed' });
    expect(contexts).toEqual([{ client: 'active' }, { reason: 'closed' }, { message: 'failed' }]);
  });

  test('opens one durable channel per execution and removes only the one it opened', () => {
    const realtime = client();
    const channel = realtime._durableChannel('exec-1', 'token');
    if (channel === null) {
      throw new Error('durable channel was not opened');
    }
    expect(channel.name).toBe('durable:exec-1');
    expect(channel._type).toBe('durable');
    expect(channel._subscribeData).toEqual({ client_token: 'token' });
    expect(realtime._durableChannel('exec-1', null)).toBeNull();
    expect(realtime._durableChannel('exec-2', null)?._subscribeData).toBeNull();
    const received: unknown[] = [];
    channel.on('*', (data) => {
      received.push(data);
    });
    realtime._handleServerPublication({ channel: 'project:durable:exec-1', data: { seq: 1 } });
    expect(received).toEqual([{ seq: 1 }]);

    const dispose = jest.spyOn(channel, '_dispose');
    realtime._removeDurableChannel(channel);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    expect(realtime._channels.has('durable:exec-2')).toBe(true);
    const reopened = realtime._durableChannel('exec-1', null);
    realtime._removeDurableChannel(channel);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(realtime._channels.get('durable:exec-1')).toBe(reopened);
  });

  test('removes channels by name and isolates cleanup failures', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = client();
    const first = realtime.channel('one');
    const second = realtime.channel('two');
    realtime.removeChannel('unknown');
    realtime.removeChannel('one');
    expect(realtime._channels.has('broadcast:one')).toBe(false);
    await realtime.connect();
    jest.spyOn(second, '_dispose').mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    realtime.disconnect();
    expect(realtime._channels.size).toBe(0);
    expect(first._callbacks.size).toBe(0);
  });
});
