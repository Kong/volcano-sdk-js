const { VolcanoRealtime } = require('../src/realtime.js');

function createRealtime(createSubscription, accessToken = 'token123') {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project123.secret',
    accessToken,
  });

  realtime._client = {
    disconnect: jest.fn(),
    newSubscription: jest.fn(createSubscription),
    off: jest.fn(),
    removeSubscription: jest.fn(),
  };
  return realtime;
}

function createAccessToken(claims) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(claims)}.`;
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

  test('same-user token refresh retains the broadcast recovery subscription', async () => {
    const subscriptions = [];
    const originalToken = createAccessToken({ project_id: 'project-1', sub: 'user-1', exp: 1 });
    const refreshedToken = createAccessToken({ project_id: 'project-1', sub: 'user-1', exp: 2 });
    const realtime = createRealtime(() => {
      const subscription = createSubscription();
      subscriptions.push(subscription);
      return subscription;
    }, originalToken);
    const channel = realtime.channel('room-1');

    await channel.subscribe();
    channel.unsubscribe();
    realtime._adoptAccessToken(refreshedToken);
    await channel.subscribe();

    expect(subscriptions).toHaveLength(1);
    expect(realtime._client.removeSubscription).not.toHaveBeenCalled();
  });

  test.each([
    [
      'a different user',
      createAccessToken({ project_id: 'project-1', sub: 'user-1' }),
      createAccessToken({ project_id: 'project-1', sub: 'user-2' }),
    ],
    [
      'a different project',
      createAccessToken({ project_id: 'project-1', sub: 'user-1' }),
      createAccessToken({ project_id: 'project-2', sub: 'user-1' }),
    ],
    ['a changed opaque token', 'opaque-token-1', 'opaque-token-2'],
  ])('%s discards recovery before resubscribe', async (_case, originalToken, nextToken) => {
    const subscriptions = [];
    const realtime = createRealtime(() => {
      const subscription = createSubscription();
      subscriptions.push(subscription);
      return subscription;
    }, originalToken);
    const channel = realtime.channel('room-1');
    const onMessage = jest.fn();
    channel.on('message', onMessage);

    await channel.subscribe();
    const originalSubscription = subscriptions[0];
    realtime._adoptAccessToken(nextToken);
    originalSubscription.emit('publication', { data: { event: 'message', sequence: 1 } });

    expect(realtime._client.removeSubscription).toHaveBeenCalledWith(originalSubscription);
    expect(onMessage).not.toHaveBeenCalled();

    await channel.subscribe();
    subscriptions[1].emit('publication', { data: { event: 'message', sequence: 2 } });

    expect(subscriptions).toHaveLength(2);
    expect(onMessage).toHaveBeenCalledWith(
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

  test('a channel that timed out cannot send after Centrifuge connects late', async () => {
    const subscription = createSubscription();
    subscription.ready.mockRejectedValue(new Error('timeout'));
    const channel = createRealtime(() => subscription).channel('room-1');
    await expect(channel.subscribe()).rejects.toThrow('timeout');

    expect(subscription.state).toBe('unsubscribed');
    subscription.state = 'subscribed';

    await expect(channel.send({ event: 'message' })).rejects.toThrow('Channel not subscribed');
    expect(subscription.publish).not.toHaveBeenCalled();
  });

  test('a retry suppresses autofetch work from a timed-out subscription', async () => {
    const subscription = createSubscription();
    const readiness = createDeferred();
    subscription.ready.mockReturnValueOnce(readiness.promise);
    const realtime = createRealtime(() => subscription);
    realtime.setVolcanoClient({});
    const channel = realtime.channel('public:items', { type: 'postgres' });
    const fetch = createDeferred();
    const onInsert = jest.fn();
    channel._fetchRow = jest.fn(() => fetch.promise);
    channel.onPostgresChanges('INSERT', 'public', 'items', onInsert);

    const firstAttempt = channel.subscribe();
    const delivery = channel._handleLightweightNotification(
      { id: 1, mode: 'lightweight', schema: 'public', table: 'items', type: 'INSERT' },
      {},
    );
    readiness.reject(new Error('timeout'));
    await expect(firstAttempt).rejects.toThrow('timeout');
    await channel.subscribe();
    fetch.resolve({ id: 1 });
    await delivery;

    expect(onInsert).not.toHaveBeenCalled();
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

  test('a paused presence channel ignores subscription and server events', async () => {
    const subscription = createSubscription();
    const realtime = createRealtime(() => subscription);
    const channel = realtime.channel('lobby', { type: 'presence' });
    const onJoin = jest.fn();
    const onSync = jest.fn();
    channel.on('join', onJoin);
    channel.onPresenceSync(onSync);
    await channel.subscribe();

    channel.unsubscribe();
    subscription.emit('presence', { clients: { client1: { data: { online: true } } } });
    subscription.emit('join', { info: { client: 'client1', data: { online: true } } });
    realtime._handleServerJoin({
      channel: 'project123:presence:lobby',
      info: { client: 'client1', data: { online: true } },
    });
    realtime._handleServerSubscribed({
      channel: 'project123:presence:lobby',
      data: { presence: { client1: { data: { online: true } } } },
    });

    expect(channel.getPresenceState()).toEqual({});
    expect(onJoin).not.toHaveBeenCalled();
    expect(onSync).not.toHaveBeenCalled();
  });

  test('a paused presence channel ignores an in-flight snapshot', async () => {
    jest.useFakeTimers();
    try {
      const subscription = createSubscription();
      const realtime = createRealtime(() => subscription);
      const snapshot = createDeferred();
      realtime._client.presence = jest.fn(() => snapshot.promise);
      const channel = realtime.channel('lobby', { type: 'presence' });
      const onSync = jest.fn();
      channel.onPresenceSync(onSync);
      await channel.subscribe();

      subscription.emit('subscribed');
      jest.advanceTimersByTime(150);
      await Promise.resolve();
      channel.unsubscribe();
      snapshot.resolve({ clients: { client1: { data: { online: true } } } });
      await Promise.resolve();

      expect(channel.getPresenceState()).toEqual({});
      expect(onSync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
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
