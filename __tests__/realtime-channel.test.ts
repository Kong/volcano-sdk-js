import { VolcanoRealtime } from '../src/realtime.ts';
import type { ChannelListener, PostgresChangesListener, PresenceSyncListener } from './support/realtime-listeners.ts';

let realtime: VolcanoRealtime;

function rejectsSubscribeWhileDisconnected(): void {
  test('throws error if not connected', async () => {
    const channel = realtime.channel('room-1');

    await expect(channel.subscribe()).rejects.toThrow('Not connected');
  });
}

function registersEventListeners(): void {
  test('registers callback for events', () => {
    const channel = realtime.channel('room-1');

    const callback = jest.fn<void, Parameters<ChannelListener>>();
    channel.on('message', callback);

    channel._deliverPayload({ event: 'message' }, { data: { event: 'message' } });
    expect(callback).toHaveBeenCalledWith({ event: 'message' }, { data: { event: 'message' } });
  });

  test('returns unsubscribe function', () => {
    const channel = realtime.channel('room-1');

    const callback = jest.fn<void, Parameters<ChannelListener>>();
    const unsubscribe = channel.on('message', callback);

    unsubscribe();

    expect(channel._callbacks.get('message')).not.toContain(callback);
  });

  test('supports wildcard listeners', () => {
    const channel = realtime.channel('room-1');

    const callback = jest.fn<void, Parameters<ChannelListener>>();
    channel.on('*', callback);

    channel._deliverPayload({ event: 'message' }, { data: { event: 'message' } });
    expect(callback).toHaveBeenCalledWith({ event: 'message' }, { data: { event: 'message' } });
  });
}

function rejectsUnavailableSends(): void {
  test('throws error for non-broadcast channels', async () => {
    const channel = realtime.channel('lobby', { type: 'presence' });

    await expect(channel.send({ text: 'hello' })).rejects.toThrow('only available for broadcast channels');
  });

  test('throws error if not subscribed', async () => {
    const channel = realtime.channel('room-1');

    await expect(channel.send({ text: 'hello' })).rejects.toThrow('Channel not subscribed');
  });
}

function registersPostgresListeners(): void {
  test('throws error for non-postgres channels', () => {
    const channel = realtime.channel('room-1');

    expect(() => {
      channel.onPostgresChanges('*', 'public', 'messages', jest.fn<void, Parameters<PostgresChangesListener>>());
    }).toThrow('only available for postgres channels');
  });

  test('registers callback for postgres channel', () => {
    const channel = realtime.channel('public:messages', { type: 'postgres' });

    const callback = jest.fn<void, Parameters<PostgresChangesListener>>();
    channel.onPostgresChanges('INSERT', 'public', 'messages', callback);

    expect(channel._callbacks.get('*')).toHaveLength(1);
  });
}

function guardsPresenceMethods(): void {
  test('onPresenceSync throws error for non-presence channels', () => {
    const channel = realtime.channel('room-1');

    expect(() => {
      channel.onPresenceSync(jest.fn<void, Parameters<PresenceSyncListener>>());
    }).toThrow('only available for presence channels');
  });

  test('track throws error for non-presence channels', async () => {
    const channel = realtime.channel('room-1');

    await expect(channel.track({ status: 'online' })).rejects.toThrow('only available for presence channels');
  });

  test('getPresenceState returns empty object initially', () => {
    const channel = realtime.channel('lobby', { type: 'presence' });

    expect(channel.getPresenceState()).toEqual({});
  });

  test('onPresenceSync registers callback for presence channel', () => {
    const channel = realtime.channel('lobby', { type: 'presence' });

    const callback = jest.fn<void, Parameters<PresenceSyncListener>>();
    channel.onPresenceSync(callback);

    expect(channel._callbacks.get('presence_sync')).toHaveLength(1);
  });
}

function retainsCallbacksOnUnsubscribe(): void {
  test('retains callbacks for a later resubscribe', () => {
    const channel = realtime.channel('room-1');

    channel.on('message', jest.fn<void, Parameters<ChannelListener>>());
    channel.on('update', jest.fn<void, Parameters<ChannelListener>>());

    channel.unsubscribe();

    expect(channel._callbacks.size).toBe(2);
  });

  test('clears presence state', () => {
    const channel = realtime.channel('lobby', { type: 'presence' });

    channel.unsubscribe();

    expect(channel.getPresenceState()).toEqual({});
  });
}

describe('RealtimeChannel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project123.secret',
      accessToken: 'token123',
    });
  });

  describe('subscribe', () => {
    rejectsSubscribeWhileDisconnected();
  });

  describe('on', () => {
    registersEventListeners();
  });

  describe('send', () => {
    rejectsUnavailableSends();
  });

  describe('onPostgresChanges', () => {
    registersPostgresListeners();
  });

  describe('presence', () => {
    guardsPresenceMethods();
  });

  describe('unsubscribe', () => {
    retainsCallbacksOnUnsubscribe();
  });
});
