const { VolcanoRealtime } = require('../src/realtime.js');

function token(projectId, subject, expires = 1) {
  const payload = Buffer.from(
    JSON.stringify({ project_id: projectId, sub: subject, exp: expires }),
  ).toString('base64url');
  return `header.${payload}.signature`;
}

function createRealtime(accessToken) {
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.example.com',
    anonKey: 'project.key',
    accessToken,
  });
  const client = {
    newSubscription: jest.fn(() => {
      const handlers = new Map();
      return {
        on: jest.fn((event, callback) => handlers.set(event, callback)),
        off: jest.fn((event) => handlers.delete(event)),
        subscribe: jest.fn(),
        unsubscribe: jest.fn(),
        ready: jest.fn().mockResolvedValue(undefined),
        emit: (event, data) => handlers.get(event)?.(data),
      };
    }),
    removeSubscription: jest.fn(),
  };
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
    const previous = channel._subscription;
    realtime._adoptAccessToken(next);
    expect(previous.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.removeSubscription).toHaveBeenCalledWith(previous);
    previous.emit('publication', { data: { event: 'message', text: 'old' } });
    expect(onMessage).not.toHaveBeenCalled();
    await channel.subscribe();
    channel._subscription.emit('publication', { data: { event: 'message', text: 'new' } });
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
});
