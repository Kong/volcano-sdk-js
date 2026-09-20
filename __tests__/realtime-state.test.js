const { VolcanoRealtime } = require('../src/realtime.js');

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

    const info = {
      client: 'remote-client',
      user: 'user-id',
      data: { status: 'working' },
      connInfo: { user_metadata: { display_name: 'Contract' } },
    };
    realtime._handleServerSubscribed({
      channel: 'project:presence:lobby',
      data: { presence: { 'remote-client': info } },
    });
    const initial = onSync.mock.lastCall[0];
    realtime._handleServerJoin({ channel: 'project:presence:lobby', info });
    const live = onSync.mock.lastCall[0];

    expect(initial).toEqual({ 'remote-client': info });
    expect(live).toEqual(initial);
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
});
