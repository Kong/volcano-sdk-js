import {
  attachConnectionHandlers,
  type ConnectionEvents,
  connectionOptions,
  detachConnectionHandlers,
  type RealtimeConnectionClient,
  waitForConnection,
} from '../src/realtime-connection.ts';

class Client implements RealtimeConnectionClient {
  readonly listeners = new Map<string, Set<(context: unknown) => void>>();
  readonly connect = jest.fn();
  readonly on = jest.fn((event: string, listener: (context: unknown) => void): void => {
    const listeners = this.listeners.get(event) ?? new Set<(context: unknown) => void>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  });
  readonly off = jest.fn((event: string, listener: (context: unknown) => void): void => {
    this.listeners.get(event)?.delete(listener);
  });

  emit(event: string, context: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(context);
    }
  }
}

const events = [
  'connected',
  'disconnected',
  'error',
  'publication',
  'join',
  'leave',
  'subscribed',
] as const;

test('connection options preserve token refresh and custom transport', async () => {
  const websocket = Symbol('websocket');
  const adopt = jest.fn();
  const getter = jest.fn().mockResolvedValue('fresh');
  const options = connectionOptions('initial', getter, adopt, websocket);
  expect(options.token).toBe('initial');
  expect(options.debug).toBe(false);
  expect(options.websocket).toBe(websocket);
  expect(typeof options.getToken).toBe('function');
  await expect(options.getToken?.()).resolves.toBe('fresh');
  expect(adopt).toHaveBeenCalledWith('fresh');
  getter.mockRejectedValueOnce(new Error('refresh failed'));
  await expect(options.getToken?.()).rejects.toThrow('refresh failed');
  expect(adopt).toHaveBeenCalledTimes(1);
  expect(connectionOptions(undefined, undefined, adopt, websocket)).toEqual({
    token: undefined,
    getToken: undefined,
    debug: false,
    websocket,
  });
});

test('attaches and detaches all connection events without changing callbacks', () => {
  const client = new Client();
  const callback = jest.fn<undefined, [unknown]>();
  const handlers: ConnectionEvents = {
    connected: callback,
    disconnected: callback,
    error: callback,
    publication: callback,
    join: callback,
    leave: callback,
    subscribed: callback,
  };
  attachConnectionHandlers(client, handlers);
  expect(client.on.mock.calls.map(([event]) => event)).toEqual(events);
  for (const event of events) {
    client.emit(event, event);
  }
  expect(callback.mock.calls.map(([context]) => context)).toEqual(events);
  detachConnectionHandlers(client, handlers);
  expect(client.off.mock.calls.map(([event]) => event)).toEqual(events);
  for (const event of events) {
    client.emit(event, event);
  }
  expect(callback).toHaveBeenCalledTimes(events.length);
});

test('waits for connection and removes temporary listeners on success', async () => {
  const client = new Client();
  const waiting = waitForConnection(client);
  expect(client.connect).toHaveBeenCalledTimes(1);
  client.emit('connected', {});
  await expect(waiting).resolves.toBeUndefined();
  expect(client.listeners.get('connected')?.size).toBe(0);
  expect(client.listeners.get('error')?.size).toBe(0);
});

test.each([
  [{ error: { message: 'denied' } }, 'denied'],
  [{ error: { message: '' } }, 'Connection failed'],
  [{ error: { message: 3 } }, 'Connection failed'],
  [{ error: null }, 'Connection failed'],
  [{ error: 'denied' }, 'Connection failed'],
  [null, 'Connection failed'],
  ['denied', 'Connection failed'],
])('reports a connection error from %p', async (context, message) => {
  const client = new Client();
  const waiting = waitForConnection(client);
  client.emit('error', context);
  await expect(waiting).rejects.toThrow(message);
  expect(client.listeners.get('connected')?.size).toBe(0);
  expect(client.listeners.get('error')?.size).toBe(0);
});

test('rejects a connection that never becomes ready', async () => {
  jest.useFakeTimers();
  try {
    const client = new Client();
    const waiting = waitForConnection(client);
    await jest.advanceTimersByTimeAsync(10_000);
    await expect(waiting).rejects.toThrow('Connection timeout');
    expect(client.listeners.get('connected')?.size).toBe(0);
    expect(client.listeners.get('error')?.size).toBe(0);
  } finally {
    jest.useRealTimers();
  }
});

test('removes temporary listeners when a transport throws during connection', async () => {
  const client = new Client();
  const failure = new Error('transport failed');
  client.connect.mockImplementationOnce(() => {
    throw failure;
  });
  await expect(waitForConnection(client)).rejects.toBe(failure);
  expect(client.listeners.get('connected')?.size).toBe(0);
  expect(client.listeners.get('error')?.size).toBe(0);
});
