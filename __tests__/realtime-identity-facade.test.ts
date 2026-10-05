import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoRealtime } from '../src/realtime.ts';
import {
  deferredVoid,
  subscriptionAt,
  TestSubscription,
  TestTransportClient,
} from './realtime-transport-fixtures.ts';

function token(projectId: string, subject: string, expires = 1): string {
  const payload = Buffer.from(
    JSON.stringify({ project_id: projectId, sub: subject, exp: expires }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function createRealtime(accessToken: string) {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
    accessToken,
  });
  const client = new TestTransportClient();
  jest.spyOn(realtime, 'getClient').mockReturnValue(client);
  return { realtime, client };
}

describe('realtime auth identity', () => {
  test.each([
    ['same user and project', token('project', 'user'), token('project', 'user', 2)],
    ['unchanged opaque credential', 'opaque', 'opaque'],
  ])('keeps subscriptions for %s', async (_case, original, refreshed) => {
    const { realtime, client } = createRealtime(original);
    const channel = realtime.channel('room');
    await channel.subscribe();
    realtime._adoptAccessToken(refreshed);
    await channel.subscribe();
    expect(client.newSubscription).toHaveBeenCalledTimes(1);
    expect(client.removeSubscription).not.toHaveBeenCalled();
    expect(realtime.accessToken).toBe(refreshed);
  });

  test.each([
    ['different user', token('project', 'user'), token('project', 'other')],
    ['different project', token('project', 'user'), token('other', 'user')],
    ['changed opaque credential', 'opaque', 'different'],
    ['missing identity claims', token('project', 'user'), token('', '')],
    ['malformed token', token('project', 'user'), 'header.invalid.signature'],
  ])('resets subscriptions for a %s without dropping handlers', async (_case, original, next) => {
    const { realtime, client } = createRealtime(original);
    const channel = realtime.channel('room');
    const onMessage = jest.fn();
    channel.on('message', onMessage);
    await channel.subscribe();
    const previous = subscriptionAt(client, 0);
    realtime._adoptAccessToken(next);
    expect(previous.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.removeSubscription).toHaveBeenCalledWith(previous);
    previous.emit('publication', { data: { event: 'message', text: 'old' } });
    expect(onMessage).not.toHaveBeenCalled();
    await channel.subscribe();
    subscriptionAt(client, 1).emit('publication', { data: { event: 'message', text: 'new' } });
    expect(client.newSubscription).toHaveBeenCalledTimes(2);
    expect(onMessage).toHaveBeenCalledTimes(1);
  });

  test('ignores server presence events while a changed identity is paused', async () => {
    const { realtime } = createRealtime('old');
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    realtime._adoptAccessToken('new');
    realtime._handleServerJoin({
      channel: 'project:presence:lobby',
      info: { client: 'old-client', data: { online: true } },
    });
    realtime._handleServerSubscribed({
      channel: 'project:presence:lobby',
      data: { presence: { 'old-client': { data: { online: true } } } },
    });
    expect(channel.getPresenceState()).toEqual({});
  });

  test('rejects readiness invalidated by an identity change', async () => {
    const { realtime, client } = createRealtime('old');
    const channel = realtime.channel('room');
    const ready = deferredVoid();
    const subscription = new TestSubscription();
    subscription.ready.mockReturnValue(ready.promise);
    client.newSubscription.mockReturnValueOnce(subscription);
    const pending = channel.subscribe();
    ready.resolve();
    realtime._adoptAccessToken('new');
    await expect(pending).rejects.toThrow('Subscription changed');
    expect(channel._subscription).toBeNull();
  });

  test('waits for server acceptance but delivers recovery before ready resumes', async () => {
    const { realtime, client } = createRealtime('old');
    const channel = realtime.channel('lobby', { type: 'presence' });
    await channel.subscribe();
    realtime._adoptAccessToken('new');
    const onMessage = jest.fn();
    channel.on('message', onMessage);
    const ready = deferredVoid();
    const subscription = new TestSubscription();
    subscription.ready.mockReturnValue(ready.promise);
    client.newSubscription.mockReturnValueOnce(subscription);
    const pending = channel.subscribe();
    realtime._handleServerJoin({
      channel: 'project:presence:lobby',
      info: { client: 'stale', data: {} },
    });
    subscription.emit('publication', { data: { event: 'message', text: 'stale' } });
    expect(channel.getPresenceState()).toEqual({});
    expect(onMessage).not.toHaveBeenCalled();
    subscription.emit('state', { newState: 'subscribed' });
    subscription.emit('publication', { data: { event: 'message', text: 'recovered' } });
    expect(onMessage).toHaveBeenCalledTimes(1);
    ready.resolve();
    await pending;
  });
});
