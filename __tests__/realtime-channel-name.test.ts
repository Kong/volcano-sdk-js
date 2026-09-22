import { describe, expect, test } from '@jest/globals';
import { postgresBaseChannelFromParts, sdkChannelFromParts } from '../src/realtime-channel-name.ts';

describe('server-side realtime channel names', () => {
  test('requires a project, type, and name', () => {
    expect(sdkChannelFromParts(['project', 'broadcast'])).toBeNull();
  });

  test('preserves colons in channel names', () => {
    expect(sdkChannelFromParts(['project', 'broadcast', 'chat', 'thread'])).toBe(
      'broadcast:chat:thread',
    );
  });

  test('recognizes only five-part per-user postgres channels', () => {
    expect(
      postgresBaseChannelFromParts(['project', 'postgres', 'public', 'messages', 'user']),
    ).toBe('postgres:public:messages');
    expect(postgresBaseChannelFromParts(['project', 'postgres', 'public', 'messages'])).toBeNull();
    expect(
      postgresBaseChannelFromParts(['project', 'broadcast', 'public', 'messages', 'user']),
    ).toBeNull();
  });
});
