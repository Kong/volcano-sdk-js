import { postgresBaseChannelFromParts, sdkChannelFromParts } from './realtime-channel-name.ts';

interface ServerEventRoute {
  sdkChannel: string;
  postgresBaseChannel: string | null;
}

function channelFromContext(context: unknown): string | null {
  if (typeof context !== 'object' || context === null || !('channel' in context)) {
    return null;
  }
  const { channel } = context;
  return typeof channel === 'string' ? channel : null;
}

/** Validate the channel on an event before routing it into SDK subscriptions. */
export function serverEventRoute(context: unknown): ServerEventRoute | null {
  const channel = channelFromContext(context);
  if (channel === null) {
    return null;
  }
  const parts = channel.split(':');
  const sdkChannel = sdkChannelFromParts(parts);
  if (sdkChannel === null) {
    return null;
  }
  return { sdkChannel, postgresBaseChannel: postgresBaseChannelFromParts(parts) };
}
