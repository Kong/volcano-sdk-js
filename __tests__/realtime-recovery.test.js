const { VolcanoRealtime } = require('../src/realtime.js');

function createRealtime() {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
    accessToken: 'credential',
  });
  const client = {
    newSubscription: jest.fn(() => {
      const handlers = new Map();
      const subscription = {
        state: 'unsubscribed',
        on: jest.fn((event, handler) => handlers.set(event, handler)),
        off: jest.fn((event) => handlers.delete(event)),
        emit: (event, context) => handlers.get(event)?.(context),
        publish: jest.fn(),
      };
      subscription.subscribe = jest.fn(() => {
        subscription.state = 'subscribing';
      });
      subscription.unsubscribe = jest.fn(() => {
        subscription.state = 'unsubscribed';
      });
      subscription.ready = jest.fn(async () => {
        subscription.state = 'subscribed';
      });
      return subscription;
    }),
    removeSubscription: jest.fn(),
    off: jest.fn(),
    disconnect: jest.fn(),
  };
  realtime._client = client;
  return { realtime, client };
}

describe('retained broadcast subscriptions', () => {
  test('pauses and resumes the same subscription without dropping listeners', async () => {
    const { realtime, client } = createRealtime();
    const channel = realtime.channel('room');
    const onMessage = jest.fn();
    channel.on('message', onMessage);
    await channel.subscribe();
    const subscription = channel._subscription;
    channel.unsubscribe();
    subscription.emit('publication', { data: { event: 'message', text: 'paused' } });
    expect(onMessage).not.toHaveBeenCalled();
    expect(channel._subscription).toBe(subscription);
    expect(subscription.state).toBe('unsubscribed');
    await expect(channel.send({ text: 'paused' })).rejects.toThrow('Channel not subscribed');
    await channel.subscribe();
    subscription.emit('publication', { data: { event: 'message', text: 'resumed' } });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(client.newSubscription).toHaveBeenCalledTimes(1);
    expect(client.removeSubscription).not.toHaveBeenCalled();
  });

  test('discards a paused subscription when its credential changes', async () => {
    const { realtime, client } = createRealtime();
    const channel = realtime.channel('room');
    const onMessage = jest.fn();
    channel.on('message', onMessage);
    await channel.subscribe();
    const previous = channel._subscription;
    channel.unsubscribe();
    realtime._adoptAccessToken('other-credential');
    expect(client.removeSubscription).toHaveBeenCalledWith(previous);
    await channel.subscribe();
    channel._subscription.emit('publication', { data: { event: 'message' } });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(client.newSubscription).toHaveBeenCalledTimes(2);
  });

  test.each([
    ['removeChannel', (realtime) => realtime.removeChannel('room')],
    ['removeAllChannels', (realtime) => realtime.removeAllChannels()],
    ['disconnect', (realtime) => realtime.disconnect()],
  ])('%s discards paused subscriptions and listeners', async (_name, dispose) => {
    const { realtime, client } = createRealtime();
    const channel = realtime.channel('room');
    channel.on('message', jest.fn());
    await channel.subscribe();
    const subscription = channel._subscription;
    channel.unsubscribe();
    dispose(realtime);
    expect(client.removeSubscription).toHaveBeenCalledWith(subscription);
    expect(channel._subscription).toBeNull();
    expect(channel._callbacks.size).toBe(0);
  });
});
