const { VolcanoRealtime } = require('../src/realtime.js');

function createRealtime(createSubscription) {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project123.secret',
    accessToken: 'token123',
  });

  realtime._client = {
    disconnect: jest.fn(),
    newSubscription: jest.fn(createSubscription),
    off: jest.fn(),
    removeSubscription: jest.fn(),
  };
  return realtime;
}

function createSubscription() {
  const handlers = new Map();
  const subscription = {
    emit(event, context) {
      for (const handler of handlers.get(event) || []) {
        handler(context);
      }
    },
    off: jest.fn((event, handler) => handlers.get(event)?.delete(handler)),
    on: jest.fn((event, handler) => {
      const listeners = handlers.get(event) || new Set();
      listeners.add(handler);
      handlers.set(event, listeners);
    }),
    publish: jest.fn(),
    state: 'unsubscribed',
  };
  subscription.ready = jest.fn(async () => {
    subscription.state = 'subscribed';
  });
  subscription.subscribe = jest.fn(() => {
    subscription.state = 'subscribing';
  });
  subscription.unsubscribe = jest.fn(() => {
    subscription.state = 'unsubscribed';
  });
  return subscription;
}

function createDeferred() {
  const deferred = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
  return deferred;
}

describe('realtime subscription lifecycle', () => {
  test('subscribe waits until the channel is ready', async () => {
    const subscription = createSubscription();
    let resolveReady;
    subscription.ready.mockReturnValue(
      new Promise((resolve) => {
        resolveReady = resolve;
      }),
    );
    const channel = createRealtime(() => subscription).channel('room-1');

    let subscribed = false;
    const completion = channel.subscribe().then(() => {
      subscribed = true;
    });
    await Promise.resolve();

    expect(subscription.ready).toHaveBeenCalledWith(10_000);
    expect(subscribed).toBe(false);

    resolveReady();
    await completion;
    expect(subscribed).toBe(true);
  });

  test.each([
    ['broadcast', false],
    ['presence', true],
  ])('passes supported Centrifuge options for %s channels', async (type, joinLeave) => {
    const subscription = createSubscription();
    const realtime = createRealtime(() => subscription);

    await realtime.channel('room-1', { type }).subscribe();

    expect(realtime._client.newSubscription).toHaveBeenCalledWith(`${type}:room-1`, {
      joinLeave,
    });
  });

  test('unsubscribe and resubscribe retain the broadcast recovery subscription', async () => {
    const subscriptions = [];
    const realtime = createRealtime(() => {
      const subscription = createSubscription();
      subscriptions.push(subscription);
      return subscription;
    });
    const channel = realtime.channel('room-1');
    const onMessage = jest.fn();
    channel.on('message', onMessage);

    await channel.subscribe();
    subscriptions[0].emit('publication', { data: { event: 'message', sequence: 1 } });
    channel.unsubscribe();
    subscriptions[0].emit('publication', { data: { event: 'message', sequence: 99 } });
    expect(onMessage).toHaveBeenCalledTimes(1);

    await channel.subscribe();
    subscriptions.at(-1).emit('publication', { data: { event: 'message', sequence: 2 } });

    expect(subscriptions).toHaveLength(1);
    expect(onMessage).toHaveBeenNthCalledWith(
      2,
      { event: 'message', sequence: 2 },
      { data: { event: 'message', sequence: 2 } },
    );
  });

  test('a paused broadcast channel cannot send', async () => {
    const subscription = createSubscription();
    const channel = createRealtime(() => subscription).channel('room-1');
    await channel.subscribe();

    channel.unsubscribe();

    await expect(channel.send({ event: 'message' })).rejects.toThrow('Channel not subscribed');
    expect(subscription.publish).not.toHaveBeenCalled();
  });

  test('a paused channel suppresses an in-flight lightweight result', async () => {
    const subscription = createSubscription();
    const realtime = createRealtime(() => subscription);
    realtime.setVolcanoClient({});
    const channel = realtime.channel('public:items', { type: 'postgres' });
    const onInsert = jest.fn();
    const fetch = createDeferred();
    channel.onPostgresChanges('INSERT', 'public', 'items', onInsert);
    channel._fetchRow = jest.fn(() => fetch.promise);
    await channel.subscribe();

    const delivery = channel._handleLightweightNotification(
      { id: 1, mode: 'lightweight', schema: 'public', table: 'items', type: 'INSERT' },
      {},
    );
    channel.unsubscribe();
    fetch.resolve({ id: 1 });
    await delivery;

    expect(onInsert).not.toHaveBeenCalled();
  });

  test('pausing a channel silently cancels a queued lightweight fetch', async () => {
    const subscription = createSubscription();
    const realtime = createRealtime(() => subscription);
    realtime.setVolcanoClient({});
    const channel = realtime.channel('public:items', { type: 'postgres' });
    const onInsert = jest.fn();
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    channel.onPostgresChanges('INSERT', 'public', 'items', onInsert);
    await channel.subscribe();

    const delivery = channel._handleLightweightNotification(
      { id: 1, mode: 'lightweight', schema: 'public', table: 'items', type: 'INSERT' },
      {},
    );
    channel.unsubscribe();
    await delivery;

    expect(onInsert).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  test.each([
    ['removeChannel', (realtime) => realtime.removeChannel('room-1')],
    ['removeAllChannels', (realtime) => realtime.removeAllChannels()],
    ['disconnect', (realtime) => realtime.disconnect()],
  ])('%s permanently disposes the subscription', async (_operation, dispose) => {
    const subscription = createSubscription();
    const realtime = createRealtime(() => subscription);
    const channel = realtime.channel('room-1');
    const onMessage = jest.fn();
    const client = realtime._client;
    channel.on('message', onMessage);
    await channel.subscribe();

    dispose(realtime);
    subscription.emit('publication', { data: { event: 'message' } });

    expect(onMessage).not.toHaveBeenCalled();
    expect(client.removeSubscription).toHaveBeenCalledWith(subscription);
  });
});
