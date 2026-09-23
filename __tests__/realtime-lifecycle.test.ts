import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoAuth } from '../src/index.js';
import { VolcanoRealtime } from '../src/realtime.ts';
import { deferred, subscriptionAt, TestTransportClient } from './realtime-transport-fixtures.ts';

function createRealtime() {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
  });
  const client = new TestTransportClient();
  jest.spyOn(realtime, 'getClient').mockReturnValue(client);
  realtime.setVolcanoClient(
    new VolcanoAuth({ apiUrl: 'https://api.example.com', anonKey: 'project.key' }),
  );
  return { realtime, client };
}

describe('realtime in-flight work', () => {
  test.each(['presence', 'join'])(
    'preserves full client identity from %s events',
    async (event) => {
      const { realtime, client } = createRealtime();
      const channel = realtime.channel('lobby', { type: 'presence' });
      const onSync = jest.fn();
      channel.onPresenceSync(onSync);
      await channel.subscribe();
      const info = {
        client: 'remote-client',
        user: 'user-id',
        connInfo: { user_metadata: { display_name: 'Contract' } },
      };
      subscriptionAt(client, 0).emit(
        event,
        event === 'join' ? { info } : { clients: { 'remote-client': info } },
      );
      expect(channel.getPresenceState()).toEqual({ 'remote-client': info });
      expect(onSync).toHaveBeenLastCalledWith({ 'remote-client': info });
      channel.unsubscribe();
    },
  );

  test.each(['resolve', 'reject'])(
    'ignores a stale row fetch that will %s after resubscribing',
    async (settle) => {
      const { realtime } = createRealtime();
      const channel = realtime.channel('public:items', { type: 'postgres' });
      const fetch = deferred<unknown>();
      jest.spyOn(channel, '_fetchRow').mockReturnValue(fetch.promise);
      await channel.subscribe();
      const delivery = channel._handleLightweightNotification(
        {
          type: 'INSERT',
          schema: 'public',
          table: 'items',
          id: 1,
          mode: 'lightweight',
          timestamp: '2024-01-01T00:00:00Z',
        },
        {},
      );
      channel.unsubscribe();
      const onInsert = jest.fn();
      channel.onPostgresChanges('INSERT', 'public', 'items', onInsert);
      await channel.subscribe();
      if (settle === 'resolve') {
        fetch.resolve({ id: 1 });
      } else {
        fetch.reject(new Error('stale failure'));
      }
      await delivery;
      expect(onInsert).not.toHaveBeenCalled();
    },
  );

  test('ignores a stale presence snapshot after resubscribing', async () => {
    jest.useFakeTimers();
    try {
      const { realtime, client } = createRealtime();
      const snapshot = deferred<unknown>();
      client.presence.mockReturnValue(snapshot.promise);
      const channel = realtime.channel('lobby', { type: 'presence' });
      await channel.subscribe();
      subscriptionAt(client, 0).emit('subscribed');
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
