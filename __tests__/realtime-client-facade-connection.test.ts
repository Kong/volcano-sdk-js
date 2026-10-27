import { afterEach, describe, expect, jest, test } from '@jest/globals';
import * as centrifuge from '../src/realtime-centrifuge.ts';
import { isTransportClient, VolcanoRealtime } from '../src/realtime-client.ts';
import {
  client,
  deferTransportConnection,
  latestTransport,
  MockTransport,
  resetTransports,
} from './support/realtime-client-facade-transport.ts';
import { ProvidedWebSocket } from './support/realtime-provided-websocket.ts';

afterEach(() => {
  jest.restoreAllMocks();
  resetTransports();
});

function validatesTransportsAndWebSockets(): void {
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
    const callable: unknown = Object.setPrototypeOf(
      (): void => undefined,
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
}

function connectsOnceAndRemovesListeners(): void {
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
}

function settlesConnectionAttempts(): void {
  test('shares an in-flight connection and accepts token refresh after readiness', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    deferTransportConnection();
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
}

describe('realtime client facade', () => {
  validatesTransportsAndWebSockets();
  connectsOnceAndRemovesListeners();
  settlesConnectionAttempts();
});
