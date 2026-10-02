import { afterEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoRealtime } from '../src/realtime.ts';
import type { PendingRow } from '../src/realtime-internal-types.ts';

function realtime(): VolcanoRealtime {
  return new VolcanoRealtime({ apiUrl: 'https://api.example.com', anonKey: 'key' });
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('realtime channel facade', () => {
  test('starts active and delivers full publications', () => {
    const channel = realtime().channel('room');
    const received: unknown[] = [];
    channel.on('message', (data) => {
      received.push(data);
    });

    expect(channel._paused).toBe(false);
    channel._handlePublication({ data: { event: 'message', text: 'hello' } });
    expect(received).toEqual([{ event: 'message', text: 'hello' }]);
  });

  test('rejects activation without a subscription', async () => {
    const channel = realtime().channel('room');
    await expect(channel._activateSubscription()).rejects.toThrow('Subscription missing');
  });

  test('publishes only on a subscribed broadcast channel', async () => {
    const channel = realtime().channel('room');
    const publish = jest.fn((data: Record<string, unknown>) => Promise.resolve(data));
    channel._subscription = {
      state: 'subscribed',
      publish,
      on: jest.fn(),
      off: jest.fn(),
      subscribe: jest.fn(),
      unsubscribe: jest.fn(),
      ready: jest.fn(() => Promise.resolve()),
    };
    await channel.send({ text: 'hello' });
    expect(publish).toHaveBeenCalledWith({ text: 'hello' });
    channel._paused = true;
    await expect(channel.send({ text: 'later' })).rejects.toThrow('Channel not subscribed');
  });

  test('filters postgres callbacks by event and table and preserves context', () => {
    const channel = realtime().channel('public:tasks', { type: 'postgres' });
    const changes: unknown[] = [];
    channel.onPostgresChanges('UPDATE', 'public', 'tasks', (data, context) => {
      changes.push({ data, context });
    });
    const change = { type: 'UPDATE', schema: 'public', table: 'tasks', timestamp: 'now' };
    channel._deliverPayload({ ...change, table: 'other' }, { data: change });
    channel._deliverPayload(change, { data: change, offset: 2 });
    expect(changes).toEqual([{ data: change, context: { data: change, offset: 2 } }]);
  });

  test('delivers presence sync only for validated clients and keeps local tracking', async () => {
    const channel = realtime().channel('lobby', { type: 'presence' });
    const states: unknown[] = [];
    channel.onPresenceSync((state) => {
      states.push(state);
    });
    channel._triggerEvent('presence_sync', { alice: { client: 3 } });
    channel._updatePresenceState({ clients: { alice: { client: 'alice' } } });
    channel._triggerPresenceSync();
    expect(states).toEqual([{ alice: { client: 'alice' } }]);
    expect(channel.getPresenceState()).toEqual({ alice: { client: 'alice' } });
    channel._updatePresenceState({ clients: { invalid: { client: 3 } } });
    expect(channel.getPresenceState()).toEqual({});
    channel._updatePresenceState({ clients: null });
    expect(channel.getPresenceState()).toEqual({});
    await expect(channel.track()).resolves.toBeUndefined();
    await expect(channel.track({ status: 'online' })).resolves.toBeUndefined();
    expect(channel._myPresenceState).toEqual({ status: 'online' });
  });

  test('handles empty fetch batches and rejects pending rows when the database is missing', async () => {
    const channel = realtime().channel('public:tasks', { type: 'postgres' });
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    await channel._flushFetch('public', 'tasks');
    channel._pendingFetches.set('public.tasks', {
      ids: new Map<string, PendingRow>(),
      timer: null,
      schema: 'public',
      table: 'tasks',
    });
    await channel._flushFetch('public', 'tasks');
    expect(channel._pendingFetches.has('public.tasks')).toBe(true);
    const rejected: unknown[] = [];
    channel._pendingFetches.set('public.tasks', {
      ids: new Map<string, PendingRow>([
        [
          '1',
          {
            resolve() {
              throw new Error('unexpected success');
            },
            reject(error) {
              rejected.push(error);
            },
          },
        ],
      ]),
      timer: null,
      schema: 'public',
      table: 'tasks',
    });
    await channel._flushFetch('public', 'tasks');
    expect(rejected).toEqual([new TypeError('volcanoClient.from not available')]);
    expect(channel._pendingFetches.size).toBe(0);
    expect(clear).not.toHaveBeenCalled();
  });

  test('cancels a scheduled batch flush when it flushes early', async () => {
    const channel = realtime().channel('public:tasks', { type: 'postgres' });
    const timer = setTimeout(() => {
      throw new Error('stale batch timer ran');
    }, 10_000);
    const clear = jest.spyOn(globalThis, 'clearTimeout');
    const rejected: unknown[] = [];
    channel._pendingFetches.set('public.tasks', {
      ids: new Map<string, PendingRow>([
        ['1', { resolve: jest.fn(), reject: (error) => rejected.push(error) }],
      ]),
      timer,
      schema: 'public',
      table: 'tasks',
    });
    try {
      await channel._flushFetch('public', 'tasks');
      expect(clear).toHaveBeenCalledWith(timer);
      expect(rejected).toEqual([new TypeError('volcanoClient.from not available')]);
    } finally {
      clearTimeout(timer);
    }
  });

  test('falls back to lightweight delivery for non-Error query failures', async () => {
    const channel = realtime().channel('public:tasks', { type: 'postgres' });
    const delivered: unknown[] = [];
    const warnings: unknown[][] = [];
    jest.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => {
      warnings.push(args);
    });
    const notification = {
      mode: 'lightweight' as const,
      type: 'UPDATE' as const,
      schema: 'public',
      table: 'tasks',
      id: '1',
      timestamp: 'now',
    };
    jest.spyOn(channel, '_fetchRow').mockRejectedValueOnce('offline');
    channel.on('*', (data) => {
      delivered.push(data);
    });
    await channel._deliverFetchedNotification(notification, { data: notification }, 0);
    expect(delivered).toEqual([notification]);
    expect(warnings).toEqual([
      ['[Realtime] Failed to fetch record for public.tasks:1:', 'offline'],
    ]);
  });

  test('removes event callbacks even if their registry was cleared', () => {
    const channel = realtime().channel('room');
    const received: unknown[] = [];
    channel.on('message', (data) => {
      received.push(data);
    });
    const remove = channel.on('message', (data) => {
      received.push(data);
    });
    channel._deliverPayload({ event: 'message' }, { data: {} });
    expect(received).toHaveLength(2);
    channel._callbacks.delete('message');
    remove();
    expect(channel._callbacks.get('message')).toEqual([]);
  });

  test('unsubscribes only the requested event callback', () => {
    const channel = realtime().channel('room');
    const received: string[] = [];
    channel.on('message', () => {
      received.push('first');
    });
    const removeSecond = channel.on('message', () => {
      received.push('second');
    });

    channel._deliverPayload({ event: 'message' }, {});
    removeSecond();
    channel._deliverPayload({ event: 'message' }, {});

    expect(received).toEqual(['first', 'second', 'first']);
    expect(channel._callbacks.get('message')).toHaveLength(1);
  });

  test('ignores malformed presence snapshots after a valid update', () => {
    const channel = realtime().channel('lobby', { type: 'presence' });
    channel._updatePresenceState({ clients: { alice: { client: 'one' } } });
    channel._updatePresenceState({ clients: 'invalid' });
    expect(channel._presenceState).toEqual({});
  });
});
