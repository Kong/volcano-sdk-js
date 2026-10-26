import { afterEach, describe, expect, jest, test } from '@jest/globals';
import * as centrifuge from '../src/realtime-centrifuge.ts';
import { client, latestTransport, MockTransport, resetTransports } from './support/realtime-client-facade-transport.ts';

afterEach(() => {
  jest.restoreAllMocks();
  resetTransports();
});

function routesPublicationsAndPresence(): void {
  test('routes transport publications and presence events to active channels', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = client();
    const message: unknown[] = [];
    const presence: unknown[] = [];
    realtime.channel('room').on('message', (data) => {
      message.push(data);
    });
    const room = realtime.channel('lobby', { type: 'presence' });
    room.onPresenceSync((state) => {
      presence.push({ ...state });
    });
    await realtime.connect();
    const transport = latestTransport();
    transport.emit('publication', { channel: 'project:broadcast:room', data: { text: 'hi' } });
    transport.emit('join', { channel: 'project:presence:lobby', info: { client: 'alice' } });
    transport.emit('subscribed', {
      channel: 'project:presence:lobby',
      data: { presence: { bob: { client: 'bob' } } },
    });
    transport.emit('leave', { channel: 'project:presence:lobby', info: { client: 'bob' } });
    expect(message).toEqual([{ text: 'hi' }]);
    expect(presence).toEqual([{ alice: { client: 'alice' } }, { bob: { client: 'bob' } }, {}]);
    realtime.disconnect();
  });

  test('routes per-user postgres publications to the base channel unless an exact channel exists', () => {
    const realtime = client();
    const base = realtime.channel('public:messages', { type: 'postgres' });
    const direct = realtime.channel('public:messages:user-1', { type: 'postgres' });
    const basePublication = jest
      .spyOn(base, '_handlePublication')
      .mockImplementation(jest.fn<(context: unknown) => void>());
    const directPublication = jest
      .spyOn(direct, '_handlePublication')
      .mockImplementation(jest.fn<(context: unknown) => void>());
    const event = { channel: 'project:postgres:public:messages:user-1', data: { id: 1 } };

    realtime._handleServerPublication(event);
    expect(directPublication).toHaveBeenCalledWith(event);
    expect(basePublication).not.toHaveBeenCalled();
    realtime.removeChannel('public:messages:user-1', 'postgres');
    realtime._handleServerPublication(event);
    expect(basePublication).toHaveBeenCalledWith(event);
  });
}

function guardsPresenceState(): void {
  test('ignores malformed and paused presence routes while preserving active state', () => {
    const realtime = client();
    const room = realtime.channel('lobby', { type: 'presence' });
    const route = { channel: 'project:presence:lobby' };
    expect(realtime._activePresenceChannel(null)).toBeNull();
    expect(realtime._activePresenceChannel({ channel: 'project:broadcast:lobby' })).toBeNull();
    expect(realtime._activePresenceChannel(route)).toBe(room);
    realtime._handleServerJoin({ ...route, info: { client: 3 } });
    realtime._handleServerSubscribed({ ...route, data: { presence: null } });
    expect(room.getPresenceState()).toEqual({});
    realtime._handleServerJoin({ ...route, info: { client: 'alice' } });
    realtime._handleServerLeave({ ...route, info: { client: 3 } });
    expect(room.getPresenceState()).toEqual({ alice: { client: 'alice' } });
    room._paused = true;
    realtime._handleServerJoin({ ...route, info: { client: 'bob' } });
    realtime._handleServerLeave({ ...route, info: { client: 'alice' } });
    realtime._handleServerSubscribed({ ...route, data: { presence: {} } });
    expect(room.getPresenceState()).toEqual({ alice: { client: 'alice' } });
  });

  test('preserves presence state on malformed events and emits join and leave events', () => {
    const realtime = client();
    const room = realtime.channel('lobby', { type: 'presence' });
    const route = { channel: 'project:presence:lobby' };
    const joined: unknown[] = [];
    const left: unknown[] = [];
    const synced: unknown[] = [];
    room.on('join', (info) => {
      joined.push(info);
    });
    room.on('leave', (info) => {
      left.push(info);
    });
    room.onPresenceSync((state) => {
      synced.push({ ...state });
    });
    realtime._handleServerSubscribed({ ...route, data: { presence: { '3': { client: '3' } } } });
    expect(synced).toHaveLength(1);
    realtime._handleServerSubscribed({ ...route, data: { presence: null } });
    expect(synced).toHaveLength(1);
    realtime._handleServerJoin({ ...route, info: { client: 'alice' } });
    realtime._handleServerLeave({ ...route, info: { client: 3 } });
    expect(room.getPresenceState()).toHaveProperty('3');
    realtime._handleServerLeave({ ...route, info: { client: 'alice' } });
    expect(joined).toEqual([{ client: 'alice' }]);
    expect(left).toEqual([{ client: 3 }, { client: 'alice' }]);
  });
}

function preservesOtherConnectionListeners(): void {
  test('unsubscribing one listener preserves other listeners for every connection event', () => {
    const realtime = client();
    const contexts: unknown[] = [];
    const offConnect = realtime.onConnect((context) => {
      contexts.push(context);
    });
    realtime.onConnect((context) => {
      contexts.push(context);
    });
    const offDisconnect = realtime.onDisconnect((context) => {
      contexts.push(context);
    });
    realtime.onDisconnect((context) => {
      contexts.push(context);
    });
    const offError = realtime.onError((context) => {
      contexts.push(context);
    });
    realtime.onError((context) => {
      contexts.push(context);
    });
    offConnect();
    offDisconnect();
    offError();
    expect(realtime._onConnect).toHaveLength(1);
    expect(realtime._onDisconnect).toHaveLength(1);
    expect(realtime._onError).toHaveLength(1);
    realtime._onConnect[0]?.({ client: 'active' });
    realtime._onDisconnect[0]?.({ reason: 'closed' });
    realtime._onError[0]?.({ message: 'failed' });
    expect(contexts).toEqual([{ client: 'active' }, { reason: 'closed' }, { message: 'failed' }]);
  });
}

function removesDurableAndNamedChannels(): void {
  test('opens one durable channel per execution and removes only the one it opened', () => {
    const realtime = client();
    const channel = realtime._durableChannel('exec-1', 'token');
    if (channel === null) {
      throw new Error('durable channel was not opened');
    }
    expect(channel.name).toBe('durable:exec-1');
    expect(channel._type).toBe('durable');
    expect(channel._subscribeData).toEqual({ client_token: 'token' });
    expect(realtime._durableChannel('exec-1', null)).toBeNull();
    expect(realtime._durableChannel('exec-2', null)?._subscribeData).toBeNull();
    const received: unknown[] = [];
    channel.on('*', (data) => {
      received.push(data);
    });
    realtime._handleServerPublication({ channel: 'project:durable:exec-1', data: { seq: 1 } });
    expect(received).toEqual([{ seq: 1 }]);

    const dispose = jest.spyOn(channel, '_dispose');
    realtime._removeDurableChannel(channel);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    expect(realtime._channels.has('durable:exec-2')).toBe(true);
    const reopened = realtime._durableChannel('exec-1', null);
    realtime._removeDurableChannel(channel);
    expect(dispose).toHaveBeenCalledTimes(1);
    expect(realtime._channels.get('durable:exec-1')).toBe(reopened);
  });

  test('removes channels by name and isolates cleanup failures', async () => {
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(MockTransport);
    const realtime = client();
    const first = realtime.channel('one');
    const second = realtime.channel('two');
    realtime.removeChannel('unknown');
    realtime.removeChannel('one');
    expect(realtime._channels.has('broadcast:one')).toBe(false);
    await realtime.connect();
    jest.spyOn(second, '_dispose').mockImplementationOnce(() => {
      throw new Error('cleanup failed');
    });
    realtime.disconnect();
    expect(realtime._channels.size).toBe(0);
    expect(first._callbacks.size).toBe(0);
  });
}

describe('realtime client facade', () => {
  routesPublicationsAndPresence();
  guardsPresenceState();
  preservesOtherConnectionListeners();
  removesDurableAndNamedChannels();
});
