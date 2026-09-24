import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoRealtime } from '../src/realtime.ts';
import { subscriptionAt, TestTransportClient } from './realtime-transport-fixtures.ts';

function createRealtime() {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
    accessToken: 'credential',
  });
  const client = new TestTransportClient();
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
    const subscription = subscriptionAt(client, 0);
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
    const previous = subscriptionAt(client, 0);
    channel.unsubscribe();
    realtime._adoptAccessToken('other-credential');
    expect(client.removeSubscription).toHaveBeenCalledWith(previous);
    await channel.subscribe();
    subscriptionAt(client, 1).emit('publication', { data: { event: 'message' } });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(client.newSubscription).toHaveBeenCalledTimes(2);
  });

  test('discards server-side publications while paused and delivers new messages on resume', async () => {
    const { realtime } = createRealtime();
    const channel = realtime.channel('room');
    const onMessage = jest.fn();
    channel.on('message', onMessage);
    await channel.subscribe();
    channel.unsubscribe();
    realtime._handleServerPublication({
      channel: 'project:broadcast:room',
      data: { event: 'message', text: 'paused' },
    });
    await channel.subscribe();
    expect(onMessage).not.toHaveBeenCalled();
    const message = { event: 'message', text: 'resumed' };
    realtime._handleServerPublication({ channel: 'project:broadcast:room', data: message });
    expect(onMessage).toHaveBeenCalledTimes(1);
    expect(onMessage.mock.calls[0]?.[0]).toEqual(message);
  });

  const disposeCases: [string, (realtime: VolcanoRealtime) => void][] = [
    [
      'removeChannel',
      (realtime) => {
        realtime.removeChannel('room');
      },
    ],
    [
      'removeAllChannels',
      (realtime) => {
        realtime.removeAllChannels();
      },
    ],
    [
      'disconnect',
      (realtime) => {
        realtime.disconnect();
      },
    ],
  ];
  test.each(disposeCases)(
    '%s discards paused subscriptions and listeners',
    async (_name, dispose) => {
      const { realtime, client } = createRealtime();
      const channel = realtime.channel('room');
      channel.on('message', jest.fn());
      await channel.subscribe();
      const subscription = subscriptionAt(client, 0);
      channel.unsubscribe();
      dispose(realtime);
      expect(client.removeSubscription).toHaveBeenCalledWith(subscription);
      expect(channel._subscription).toBeNull();
      expect(channel._callbacks.size).toBe(0);
    },
  );
});
