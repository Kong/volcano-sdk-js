import type { RealtimeChannel } from './realtime-channel.ts';
import type { VolcanoRealtime } from './realtime-client.ts';
import { serverEventRoute } from './realtime-event-route.ts';
import { property, record } from './realtime-values.ts';

/**
 * Handle publications from server-side subscriptions
 * The server uses project-prefixed channels: "projectId:type:name"
 * We extract the type:name portion and route to the SDK channel
 */
export function handleServerPublication(realtime: VolcanoRealtime, ctx: unknown): void {
  const route = serverEventRoute(ctx);
  if (route === null) {
    // Not a valid server channel format, ignore
    return;
  }

  // Find the SDK channel and deliver the message
  let channel = realtime._channels.get(route.sdkChannel);

  // Postgres changes are delivered on a per-user channel for RLS isolation:
  // projectId:postgres:schema:table:userID. onPostgresChanges takes schema and
  // table as separate single-identifier args, so a postgres channel is always
  // exactly postgres:schema:table and the per-user form is exactly 5 segments.
  // Match the base channel the client subscribed to by dropping the trailing
  // userID; otherwise the publication is silently dropped and onPostgresChanges
  // never fires. Requiring exactly 5 segments avoids over-matching anything
  // that isn't this well-defined per-user format.
  channel ??= realtime._channels.get(route.postgresBaseChannel ?? route.sdkChannel);

  if (channel !== undefined) {
    channel._handlePublication(ctx);
  }
}

export function activePresenceChannel(realtime: VolcanoRealtime, ctx: unknown): RealtimeChannel | null {
  const route = serverEventRoute(ctx);
  if (route === null) {
    return null;
  }
  const channel = realtime._channels.get(route.sdkChannel);
  return channel?._type === 'presence' && !channel._paused ? channel : null;
}

/**
 * Handle join events from server-side subscriptions
 */
export function handleServerJoin(realtime: VolcanoRealtime, ctx: unknown): void {
  const channel = realtime._activePresenceChannel(ctx);
  if (channel === null) {
    return;
  }
  const info = property(ctx, 'info');
  const client = property(info, 'client');
  if (typeof client === 'string') {
    channel._presenceState[client] = info;
  }
  channel._triggerPresenceSync();
  channel._triggerEvent('join', info);
}

/**
 * Handle leave events from server-side subscriptions
 */
export function handleServerLeave(realtime: VolcanoRealtime, ctx: unknown): void {
  const channel = realtime._activePresenceChannel(ctx);
  if (channel === null) {
    return;
  }
  const info = property(ctx, 'info');
  const client = property(info, 'client');
  if (typeof client === 'string') {
    Reflect.deleteProperty(channel._presenceState, client);
  }
  channel._triggerPresenceSync();
  channel._triggerEvent('leave', info);
}

/**
 * Handle subscribed events - includes initial presence state
 */
export function handleServerSubscribed(realtime: VolcanoRealtime, ctx: unknown): void {
  const channel = realtime._activePresenceChannel(ctx);
  if (channel === null) {
    return;
  }
  const presence = property(property(ctx, 'data'), 'presence');
  if (record(presence)) {
    channel._presenceState = { ...presence };
    channel._triggerPresenceSync();
  }
}
