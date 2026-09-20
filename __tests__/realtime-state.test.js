const { VolcanoRealtime } = require('../src/realtime.js');

function containsValue(value, expected) {
  if (value === expected) return true;
  if (expected && typeof expected === 'object') {
    try {
      if (JSON.stringify(value) === JSON.stringify(expected)) return true;
    } catch {
      return false;
    }
  }
  if (!value || typeof value !== 'object') return false;
  return Object.values(value).some((child) => containsValue(child, expected));
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
    expect(containsValue(subscriptionOptions, 'app')).toBe(true);
  });

  test.each(['database is required', 'database not found'])(
    'surfaces the server %s error',
    async (message) => {
      const { realtime, client } = createRealtime({ databaseName: 'app' });
      const channel = realtime.channel('public:items', { type: 'postgres' });
      const serverError = new Error(message);
      client.newSubscription.mockImplementationOnce(() => {
        const subscription = createSubscription();
        subscription.ready.mockRejectedValueOnce(serverError);
        return subscription;
      });

      await expect(channel.subscribe()).rejects.toThrow(message);
    },
  );

  test('publishes tracked state through the presence subscription', async () => {
    const { realtime, subscriptions } = createRealtime();
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();

    const state = { status: 'working', task: 'build' };
    await channel.track(state);

    expect(subscriptions[0].publish).toHaveBeenCalledTimes(1);
    expect(containsValue(subscriptions[0].publish.mock.calls[0][0], state)).toBe(true);
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

    expect(subscriptions[0].publish).toHaveBeenCalledTimes(2);
    expect(containsValue(subscriptions[0].publish.mock.calls[1][0], state)).toBe(true);
  });
});
