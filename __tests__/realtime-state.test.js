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
