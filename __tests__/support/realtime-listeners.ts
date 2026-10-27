import type { RealtimeChannel, VolcanoRealtime } from '../../src/realtime.ts';

// The callbacks the realtime client and its channels take, read from their own
// signatures, for typing mocks.
export type ChannelListener = Parameters<RealtimeChannel['on']>[1];
export type PostgresChangesListener = Parameters<RealtimeChannel['onPostgresChanges']>[3];
export type PresenceSyncListener = Parameters<RealtimeChannel['onPresenceSync']>[0];
export type ConnectListener = Parameters<VolcanoRealtime['onConnect']>[0];
export type DisconnectListener = Parameters<VolcanoRealtime['onDisconnect']>[0];
export type ErrorListener = Parameters<VolcanoRealtime['onError']>[0];
