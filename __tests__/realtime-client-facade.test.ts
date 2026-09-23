import { afterEach, describe, expect, jest, test } from '@jest/globals';
import * as centrifuge from '../src/realtime-centrifuge.ts';
import { isTransportClient, VolcanoRealtime } from '../src/realtime-client.ts';
import type { ConnectionOptions } from '../src/realtime-connection.ts';

type Listener = (context: unknown) => void;

const transports: MockTransport[] = [];
let ready = true;

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

afterEach(() => {
  jest.restoreAllMocks();
  transports.length = 0;
  ready = true;
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
    const first = realtime.connect();
    const second = realtime.connect();
    await Promise.resolve();
    await Promise.resolve();
    const transport = latestTransport();
    transport.emit('connected', {});
    await Promise.all([first, second]);
    expect(realtime._connectionPromise).toBeNull();
    expect(realtime.isConnected()).toBe(true);
    realtime._adoptAccessToken('new-token');
    expect(realtime.accessToken).toBe('new-token');
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
