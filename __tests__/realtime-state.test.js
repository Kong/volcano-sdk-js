const { VolcanoRealtime } = require('../src/realtime.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createSubscription() {
  const handlers = new Map();
  const subscription = {
    state: 'unsubscribed',
    handlers,
    on: jest.fn((event, handler) => handlers.set(event, handler)),
    off: jest.fn((event) => handlers.delete(event)),
    subscribe: jest.fn(() => {
      subscription.state = 'subscribing';
    }),
    unsubscribe: jest.fn(() => {
      subscription.state = 'unsubscribed';
    }),
    ready: jest.fn(async () => {
      subscription.state = 'subscribed';
    }),
    publish: jest.fn(async () => {}),
    setData: jest.fn(),
  };
  return subscription;
}

function createRealtime(config = {}) {
  const subscriptions = [];
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
    ...config,
  });
  const client = {
    newSubscription: jest.fn(() => {
      const subscription = createSubscription();
      subscriptions.push(subscription);
      return subscription;
    }),
    presence: jest.fn(),
    removeSubscription: jest.fn(),
  };
  jest.spyOn(realtime, 'getClient').mockReturnValue(client);
  return { realtime, client, subscriptions };
}

describe('realtime server state contract', () => {
  test('scopes postgres channel identity, subscription data, and publications by database', async () => {
    const { realtime, client } = createRealtime();
    const dbA = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-a',
    });
    const dbB = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-b',
    });
    const onA = jest.fn();
    const onB = jest.fn();

    expect(dbA).not.toBe(dbB);
    expect(dbA).toBe(realtime.channel('public:items', { type: 'postgres', databaseName: 'db-a' }));
    expect(dbA.name).toBe('postgres:db-a:public:items');
    expect(dbB.name).toBe('postgres:db-b:public:items');

    dbA.onPostgresChanges('INSERT', 'public', 'items', onA);
    dbB.onPostgresChanges('INSERT', 'public', 'items', onB);
    await dbA.subscribe();
    await dbB.subscribe();

    expect(client.newSubscription.mock.calls[0]).toEqual([
      'postgres:db-a:public:items',
      expect.objectContaining({ data: { database_name: 'db-a' } }),
    ]);
    expect(client.newSubscription.mock.calls[1]).toEqual([
      'postgres:db-b:public:items',
      expect.objectContaining({ data: { database_name: 'db-b' } }),
    ]);

    const change = { type: 'INSERT', schema: 'public', table: 'items' };
    realtime._handleServerPublication({
      channel: 'project:postgres:db-a:public:items:user-a',
      data: change,
    });
    expect(onA).toHaveBeenCalledWith(change, expect.anything());
    expect(onB).not.toHaveBeenCalled();

    realtime._handleServerPublication({
      channel: 'project:postgres:db-b:public:items:user-b',
      data: change,
    });
    expect(onB).toHaveBeenCalledWith(change, expect.anything());
    expect(onA).toHaveBeenCalledTimes(1);
  });

  test.each([
    {
      name: 'legacy',
      options: { type: 'postgres' },
      serverChannel: 'project:postgres:public:items:service:key-id',
    },
    {
      name: 'database-scoped',
      options: { type: 'postgres', databaseName: 'app' },
      serverChannel: 'project:postgres:app:public:items:service:key-id',
    },
  ])('routes $name service-key postgres publications', ({ options, serverChannel }) => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('public:items', options);
    const onDelete = jest.fn();
    channel.onPostgresChanges('DELETE', 'public', 'items', onDelete);
    const change = { type: 'DELETE', schema: 'public', table: 'items', id: 'row-1' };

    realtime._handleServerPublication({ channel: serverChannel, data: change });

    expect(onDelete).toHaveBeenCalledWith(change, expect.anything());
  });

  test('keeps one-part user suffix routing for a table named service', () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('public:service', { type: 'postgres' });
    const onInsert = jest.fn();
    channel.onPostgresChanges('INSERT', 'public', 'service', onInsert);
    const change = { type: 'INSERT', schema: 'public', table: 'service' };

    realtime._handleServerPublication({
      channel: 'project:postgres:public:service:user-uuid',
      data: change,
    });

    expect(onInsert).toHaveBeenCalledWith(change, expect.anything());
  });

  test('uses the global selector in scoped identity when the channel selector is absent', async () => {
    const { realtime, client } = createRealtime({ databaseName: 'db-global' });

    const channel = realtime.channel('public:items', { type: 'postgres' });
    expect(channel.name).toBe('postgres:db-global:public:items');
    await channel.subscribe();

    expect(client.newSubscription).toHaveBeenCalledWith(
      'postgres:db-global:public:items',
      expect.objectContaining({ data: { database_name: 'db-global' } }),
    );
  });

  test('keeps no-selector postgres channels on the legacy wire identity', async () => {
    const { realtime, client } = createRealtime();

    const channel = realtime.channel('public:items', { type: 'postgres' });
    expect(channel.name).toBe('postgres:public:items');
    await channel.subscribe();

    expect(client.newSubscription).toHaveBeenCalledWith(
      'postgres:public:items',
      expect.not.objectContaining({ data: expect.anything() }),
    );
  });

  test('removes and resubscribes only the requested scoped channel', async () => {
    const { realtime, client, subscriptions } = createRealtime();
    const dbA = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-a',
    });
    const dbB = realtime.channel('public:items', {
      type: 'postgres',
      databaseName: 'db-b',
    });

    await dbA.subscribe();
    await dbB.subscribe();
    dbA.unsubscribe();
    await dbA.subscribe();

    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.newSubscription).toHaveBeenCalledTimes(2);
    expect(subscriptions[0].setData).not.toHaveBeenCalled();

    realtime.removeChannel('public:items', 'postgres', 'db-a');
    expect(subscriptions[0].unsubscribe).toHaveBeenCalledTimes(2);
    expect(realtime.channel('public:items', { type: 'postgres', databaseName: 'db-b' })).toBe(dbB);
    expect(realtime.channel('public:items', { type: 'postgres', databaseName: 'db-a' })).not.toBe(
      dbA,
    );
  });

  test('transmits the configured database selector when subscribing', async () => {
    const { realtime, client } = createRealtime({ databaseName: 'app' });

    await realtime.channel('public:items', { type: 'postgres' }).subscribe();

    const subscriptionOptions = client.newSubscription.mock.calls[0][1];
    expect(subscriptionOptions).toEqual(
      expect.objectContaining({ data: { database_name: 'app' } }),
    );
  });

  test.each([
    { code: 400, message: 'database selector required' },
    { code: 401, message: 'unknown database selector' },
  ])('surfaces the server $message error', async (serverError) => {
    const { realtime, client } = createRealtime({ databaseName: 'app' });
    const channel = realtime.channel('public:items', { type: 'postgres' });
    let receivedOptions;
    client.newSubscription.mockImplementationOnce((_name, options) => {
      receivedOptions = options;
      const subscription = createSubscription();
      subscription.ready.mockRejectedValueOnce(serverError);
      return subscription;
    });

    await expect(channel.subscribe()).rejects.toMatchObject(serverError);
    expect(receivedOptions).toEqual(expect.objectContaining({ data: { database_name: 'app' } }));
  });

  test('publishes tracked state through the presence subscription', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();

    const state = { status: 'working', task: 'build' };
    await channel.track(state);

    expect(subscriptions[0].setData).toHaveBeenCalledWith(state);
    state.status = 'changed-after-track';
    expect(subscriptions[0].setData.mock.calls[0][0]).toEqual({ status: 'working', task: 'build' });
  });

  test('includes tracked state in the initial presence subscription', async () => {
    const { realtime, client } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.track({ status: 'working' });

    await channel.subscribe();

    expect(client.newSubscription.mock.calls[0][1]).toEqual(
      expect.objectContaining({ data: { status: 'working' } }),
    );
  });

  test('keeps initial and live presence callback entries in one shape', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    const onSync = jest.fn();
    channel.onPresenceSync(onSync);
    await channel.subscribe();

    const transportInfo = {
      client: 'remote-client',
      user: 'user-id',
      chanInfo: { status: 'working' },
      connInfo: { user_metadata: { display_name: 'Contract' } },
    };
    realtime._handleServerSubscribed({
      channel: 'project:presence:lobby',
      data: { presence: { 'remote-client': transportInfo } },
    });
    const initial = onSync.mock.lastCall[0];
    realtime._handleServerJoin({ channel: 'project:presence:lobby', info: transportInfo });
    const live = onSync.mock.lastCall[0];

    expect(initial).toEqual({
      'remote-client': {
        ...transportInfo,
        data: { status: 'working' },
      },
    });
    expect(live).toEqual(initial);
    expect(transportInfo).not.toHaveProperty('data');
  });

  test('resends the current tracked state after resubscribe', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const state = { status: 'away' };
    await channel.track(state);

    channel.unsubscribe();
    await channel.subscribe();

    expect(subscriptions[0].setData).toHaveBeenCalledTimes(1);
    expect(subscriptions[0].setData.mock.calls[0][0]).toEqual(state);
  });

  test('waits until the latest concurrent tracked state is acknowledged', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    const firstReady = deferred();
    const secondReady = deferred();
    const sent = [];
    let currentData;
    subscription.setData.mockImplementation((state) => {
      currentData = state;
    });
    subscription.subscribe.mockImplementation(() => {
      sent.push(JSON.parse(JSON.stringify(currentData)));
    });
    subscription.ready
      .mockReset()
      .mockReturnValueOnce(firstReady.promise)
      .mockReturnValueOnce(secondReady.promise);

    const first = channel.track({ status: 'away' });
    let secondResolved = false;
    const second = channel.track({ status: 'busy' }).then(() => {
      secondResolved = true;
    });
    await Promise.resolve();

    expect(sent).toEqual([{ status: 'away' }]);
    expect(secondResolved).toBe(false);

    firstReady.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(sent).toEqual([{ status: 'away' }, { status: 'busy' }]);
    expect(secondResolved).toBe(false);

    secondReady.resolve();
    await Promise.all([first, second]);
    expect(secondResolved).toBe(true);
  });

  test('stores tracked state without resubscribing an explicitly paused channel', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    const subscription = subscriptions[0];
    subscription.subscribe.mockClear();
    channel.unsubscribe();

    await channel.track({ status: 'offline' });

    expect(subscription.setData).toHaveBeenLastCalledWith({ status: 'offline' });
    expect(subscription.subscribe).not.toHaveBeenCalled();

    await channel.subscribe();
    expect(subscription.subscribe).toHaveBeenCalledTimes(1);
  });
});
