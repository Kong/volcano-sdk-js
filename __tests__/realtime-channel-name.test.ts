import { describe, expect, test } from '@jest/globals';
import { postgresBaseChannelFromParts, sdkChannelFromParts } from '../src/realtime-channel-name.ts';
import { serverEventRoute } from '../src/realtime-event-route.ts';

describe('server-side realtime channel names', () => {
  test('requires a project, type, and name', () => {
    expect(sdkChannelFromParts(['project', 'broadcast'])).toBeNull();
  });

  test('preserves colons in channel names', () => {
    expect(sdkChannelFromParts(['project', 'broadcast', 'chat', 'thread'])).toBe(
      'broadcast:chat:thread',
    );
  });

  test('recognizes legacy and database-scoped per-user postgres channels', () => {
    expect(
      postgresBaseChannelFromParts(['project', 'postgres', 'public', 'messages', 'user']),
    ).toBe('postgres:public:messages');
    expect(
      postgresBaseChannelFromParts(['project', 'postgres', 'db-a', 'public', 'messages', 'user']),
    ).toBe('postgres:db-a:public:messages');
    expect(postgresBaseChannelFromParts(['project', 'postgres', 'public', 'messages'])).toBeNull();
    expect(
      postgresBaseChannelFromParts([
        'project',
        'postgres',
        'db-a',
        'public',
        'messages',
        'extra',
        'user',
      ]),
    ).toBeNull();
    expect(
      postgresBaseChannelFromParts(['project', 'broadcast', 'public', 'messages', 'user']),
    ).toBeNull();
  });
});

describe('server-side realtime events', () => {
  test.each([null, 12, {}, { channel: 12 }, { channel: 'project:broadcast' }])(
    'ignores a malformed channel in %p',
    (context) => {
      expect(serverEventRoute(context)).toBeNull();
    },
  );

  test('preserves a channel name containing colons', () => {
    expect(serverEventRoute({ channel: 'project:broadcast:chat:thread' })).toEqual({
      sdkChannel: 'broadcast:chat:thread',
      postgresBaseChannel: null,
    });
  });

  test('identifies a per-user postgres publication without losing its base subscription', () => {
    expect(serverEventRoute({ channel: 'project:postgres:public:messages:user' })).toEqual({
      sdkChannel: 'postgres:public:messages:user',
      postgresBaseChannel: 'postgres:public:messages',
    });
  });
});
