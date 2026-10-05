/**
 * Volcano Realtime SDK - WebSocket client for real-time messaging
 *
 * This module provides real-time capabilities including:
 * - Broadcast: Pub/sub messaging between clients
 * - Presence: Track online users and their state
 * - Postgres Changes: Subscribe to database INSERT/UPDATE/DELETE events
 *
 * @example
 * ```javascript
 * import { VolcanoRealtime } from '@volcano.dev/sdk/realtime';
 *
 * const realtime = new VolcanoRealtime({
 *   apiUrl: 'https://api.yourapp.com',
 *   anonKey: 'your-anon-key',
 *   accessToken: 'your-access-token'
 * });
 *
 * // Connect to realtime server
 * await realtime.connect();
 *
 * // Subscribe to a broadcast channel
 * const channel = realtime.channel('chat-room');
 * channel.on('message', (payload) => console.log('New message:', payload));
 * await channel.subscribe();
 *
 * // Send a message
 * channel.send({ text: 'Hello, world!' });
 *
 * // Subscribe to database changes
 * const dbChannel = realtime.channel('public:messages');
 * dbChannel.onPostgresChanges('*', 'public', 'messages', (payload) => {
 *   console.log('Database change:', payload);
 * });
 * await dbChannel.subscribe();
 *
 * // Track presence
 * const presenceChannel = realtime.channel('lobby', { type: 'presence' });
 * presenceChannel.onPresenceSync((state) => {
 *   console.log('Online users:', Object.keys(state));
 * });
 * await presenceChannel.subscribe();
 * presenceChannel.track({ status: 'online' });
 * ```
 */

export { RealtimeChannel } from './realtime-channel.ts';
export { VolcanoRealtime } from './realtime-client.ts';
export { VolcanoRealtime as default } from './realtime-client.ts';
export type {
  CentrifugeClient,
  ChannelOptions,
  ConnectContext,
  DisconnectContext,
  ErrorContext,
  FetchConfig,
  LightweightNotification,
  PostgresChange,
  PresenceInfo,
  PresenceState,
  PublicationContext,
  RealtimeConfig,
  UnsubscribeFunction,
  WebSocketConstructor,
} from './realtime-public-types.ts';
