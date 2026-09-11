const { VolcanoRealtime } = require('../src/realtime.js');

function deferred() {
  const result = {};
  result.promise = new Promise((resolve, reject) => {
    result.resolve = resolve;
    result.reject = reject;
  });
  return result;
}

function createRealtime() {
  const subscriptions = [];
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
  });
  const client = {
    newSubscription: jest.fn(() => {
      const handlers = new Map();
      const subscription = {
        on: jest.fn((event, handler) => handlers.set(event, handler)),
        off: jest.fn((event) => handlers.delete(event)),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        ready: jest.fn().mockResolvedValue(undefined),
        handlers,
      };
      subscriptions.push(subscription);
      return subscription;
    }),
    presence: jest.fn(),
    removeSubscription: jest.fn(),
  };
  jest.spyOn(realtime, 'getClient').mockReturnValue(client);
  realtime.setVolcanoClient({});
  return { realtime, client, subscriptions };
}

describe('realtime in-flight work', () => {
  test.each(['resolve', 'reject'])(
    'ignores a stale row fetch that will %s after resubscribing',
    async (settle) => {
      const { realtime } = createRealtime();
      const channel = realtime.channel('public:items', { type: 'postgres' });
      const fetch = deferred();
      jest.spyOn(channel, '_fetchRow').mockReturnValue(fetch.promise);
      await channel.subscribe();
      const delivery = channel._handleLightweightNotification(
        { type: 'INSERT', schema: 'public', table: 'items', id: 1, mode: 'lightweight' },
        {},
      );
      channel.unsubscribe();
      const onInsert = jest.fn();
      channel.onPostgresChanges('INSERT', 'public', 'items', onInsert);
      await channel.subscribe();
      fetch[settle](settle === 'resolve' ? { id: 1 } : new Error('stale failure'));
      await delivery;
      expect(onInsert).not.toHaveBeenCalled();
    },
  );

  test('ignores a stale presence snapshot after resubscribing', async () => {
    jest.useFakeTimers();
    try {
      const { realtime, client, subscriptions } = createRealtime();
      const snapshot = deferred();
      client.presence.mockReturnValue(snapshot.promise);
      const channel = realtime.channel('lobby', { type: 'presence' });
      await channel.subscribe();
      subscriptions[0].handlers.get('subscribed')();
      await jest.advanceTimersByTimeAsync(150);
      expect(client.presence).toHaveBeenCalledTimes(1);
      channel.unsubscribe();
      const onSync = jest.fn();
      channel.onPresenceSync(onSync);
      await channel.subscribe();
      snapshot.resolve({ clients: { stale: { data: { online: true } } } });
      await Promise.resolve();
      expect(channel.getPresenceState()).toEqual({});
      expect(onSync).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
