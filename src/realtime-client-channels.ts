import { RealtimeChannel } from './realtime-channel.ts';
import type { VolcanoRealtime } from './realtime-client.ts';
import { recoveryIdentity, sameRecoveryIdentity } from './realtime-identity.ts';
import type { ChannelType, InternalChannelType } from './realtime-internal-types.ts';
import type { ChannelOptions } from './realtime-public-types.ts';

/**
 * Format channel name for subscription
 * Format: type:name
 *
 * The server automatically adds the project ID prefix based on
 * the authenticated connection. Clients never need to know about project IDs.
 */
export function channelName(name: string, type: InternalChannelType): string {
  return `${type}:${name}`;
}

export function synchronizeRecoveryIdentity(realtime: VolcanoRealtime): void {
  const nextIdentity = recoveryIdentity(realtime.accessToken);
  if (sameRecoveryIdentity(realtime._recoveryIdentity, nextIdentity)) {
    return;
  }
  realtime._recoveryIdentity = nextIdentity;
  for (const channel of realtime._channels.values()) {
    channel._resetForIdentityChange();
  }
}

export function openChannel(realtime: VolcanoRealtime, name: string, options: ChannelOptions): RealtimeChannel {
  const type = options.type ?? 'broadcast';
  const fullName = realtime._formatChannelName(name, type);

  const existing = realtime._channels.get(fullName);
  if (existing !== undefined) {
    return existing;
  }

  const channel = new RealtimeChannel(realtime, fullName, type, options);
  realtime._channels.set(fullName, channel);
  return channel;
}

/**
 * Open the channel a durable execution publishes on, or return null when
 * this client already has it open.
 */
export function openDurableChannel(
  realtime: VolcanoRealtime,
  executionId: string,
  clientToken: string | null,
): RealtimeChannel | null {
  const fullName = realtime._formatChannelName(executionId, 'durable');
  if (realtime._channels.has(fullName)) {
    return null;
  }
  const channel = new RealtimeChannel(realtime, fullName, 'durable', {});
  channel._subscribeData = clientToken === null ? null : { client_token: clientToken };
  realtime._channels.set(fullName, channel);
  return channel;
}

export function closeDurableChannel(realtime: VolcanoRealtime, channel: RealtimeChannel): void {
  if (realtime._channels.get(channel._name) !== channel) {
    return;
  }
  channel._dispose();
  realtime._channels.delete(channel._name);
}

export function closeChannel(realtime: VolcanoRealtime, name: string, type: ChannelType): void {
  const fullName = realtime._formatChannelName(name, type);
  const channel = realtime._channels.get(fullName);
  if (channel !== undefined) {
    channel._dispose();
    realtime._channels.delete(fullName);
  }
}

export function closeAllChannels(realtime: VolcanoRealtime): void {
  for (const channel of realtime._channels.values()) {
    channel._dispose();
  }
  realtime._channels.clear();
}
