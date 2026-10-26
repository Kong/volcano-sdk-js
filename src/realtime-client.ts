import type { RealtimeChannel } from './realtime-channel.ts';
import {
  channelName,
  closeAllChannels,
  closeChannel,
  closeDurableChannel,
  openChannel,
  openDurableChannel,
  synchronizeRecoveryIdentity,
} from './realtime-client-channels.ts';
import { adoptAccessToken, connectOnce, connectRealtime, disconnectRealtime } from './realtime-client-connect.ts';
import {
  activePresenceChannel,
  handleServerJoin,
  handleServerLeave,
  handleServerPublication,
  handleServerSubscribed,
} from './realtime-client-events.ts';
import { addConnectListener, addDisconnectListener, addErrorListener } from './realtime-client-listeners.ts';
import { globalFetchConfig, realtimeWebSocketUrl } from './realtime-config.ts';
import { recoveryIdentity } from './realtime-identity.ts';
import type {
  ActiveFetchConfig,
  ChannelType,
  ClientHandlers,
  InternalChannelType,
  RecoveryIdentity,
  TransportClient,
} from './realtime-internal-types.ts';
import type {
  ChannelOptions,
  ConnectContext,
  DisconnectContext,
  ErrorContext,
  FetchConfig,
  RealtimeConfig,
  UnsubscribeFunction,
  WebSocketConstructor,
} from './realtime-public-types.ts';
import { optionalDatabaseName, requiredAnonKey, requiredApiUrl } from './realtime-values.ts';

/** @internal */
export { isTransportClient } from './realtime-client-connect.ts';

/**
 * VolcanoRealtime - Main realtime client
 *
 * Channel names use simple format: type:name (e.g., "broadcast:chat")
 * The server automatically handles project isolation - clients never
 * need to know about project IDs.
 *
 * Authentication options:
 * 1. User token: anonKey (required) + accessToken (user JWT)
 * 2. Service key: anonKey (optional) + accessToken (service role key)
 */
class VolcanoRealtime {
  /** @internal */
  readonly apiUrl: string;
  /** @internal */
  readonly anonKey: string;
  /** @internal */
  accessToken: string | undefined;
  /** @internal */
  readonly getToken: (() => Promise<string>) | undefined;
  /** @internal */
  _recoveryIdentity: RecoveryIdentity;
  /** @internal */
  readonly _webSocket: WebSocketConstructor | null;
  /** @internal */
  _client: TransportClient | null = null;
  /** @internal */
  _clientHandlers: ClientHandlers | null = null;
  /** @internal */
  readonly _channels = new Map<string, RealtimeChannel>();
  /** @internal */
  _connected = false;
  /** @internal */
  _connectionPromise: Promise<void> | null = null;
  /** @internal */
  _onConnect: ((context: ConnectContext) => void)[] = [];
  /** @internal */
  _onDisconnect: ((context: DisconnectContext) => void)[] = [];
  /** @internal */
  _onError: ((context: ErrorContext) => void)[] = [];
  /** @internal */
  _volcanoClient: NonNullable<RealtimeConfig['volcanoClient']> | null;
  /** @internal */
  readonly _fetchConfig: ActiveFetchConfig;
  /** @internal */
  _databaseName: string | null;
  /**
   * Create a new VolcanoRealtime client
   * @param {Object} config - Configuration options
   * @param {string} config.apiUrl - Volcano API URL
   * @param {string} [config.anonKey] - Anon key (required for user tokens, optional for service keys)
   * @param {string} config.accessToken - Access token (user JWT) or service role key (sk-...)
   * @param {Function} [config.getToken] - Function to get/refresh token
   * @param {Object} [config.volcanoClient] - VolcanoAuth client for auto-fetching lightweight notifications
   * @param {string} [config.databaseName] - Database name for auto-fetch queries
   * @param {Object} [config.fetchConfig] - Configuration for auto-fetch behavior
   * @param {Function} [config.webSocket] - Optional WebSocket implementation for Node.js tests/advanced usage
   */
  constructor(config: RealtimeConfig) {
    this.apiUrl = requiredApiUrl(config.apiUrl);
    this.anonKey = requiredAnonKey(config.anonKey);
    this.accessToken = config.accessToken;
    this.getToken = config.getToken;
    this._recoveryIdentity = recoveryIdentity(config.accessToken);
    this._webSocket = config.webSocket ?? null;

    // Auto-fetch support (Phase 3)
    this._volcanoClient = config.volcanoClient ?? null;
    this._fetchConfig = globalFetchConfig(config.fetchConfig);

    // Database name for auto-fetch queries (optional)
    this._databaseName = optionalDatabaseName(config.databaseName);
  }

  /**
   * Set the VolcanoAuth client for auto-fetching
   * @param {Object} volcanoClient - VolcanoAuth client instance
   */
  setVolcanoClient(volcanoClient: NonNullable<RealtimeConfig['volcanoClient']>): void {
    this._volcanoClient = volcanoClient;
  }

  /**
   * Get the configured VolcanoAuth client
   * @returns {Object|null} The VolcanoAuth client or null
   */
  getVolcanoClient(): NonNullable<RealtimeConfig['volcanoClient']> | null {
    return this._volcanoClient;
  }

  /**
   * Get the fetch configuration
   * @returns {Object} The fetch configuration
   */
  getFetchConfig(): FetchConfig {
    return { ...this._fetchConfig };
  }

  /**
   * Set the database name for auto-fetch queries
   * @param {string} databaseName
   */
  setDatabaseName(databaseName: string): void {
    this._databaseName = databaseName;
  }

  /**
   * Get the configured database name
   * @returns {string|null}
   */
  getDatabaseName(): string | null {
    return this._databaseName;
  }

  /**
   * Get the WebSocket URL for realtime connections
   */
  get wsUrl(): string {
    return realtimeWebSocketUrl(this.apiUrl);
  }

  /**
   * Connect to the realtime server
   */
  connect(): Promise<void> {
    return connectOnce(this);
  }

  /** @internal */
  _doConnect(): Promise<void> {
    return connectRealtime(this);
  }

  /** @internal */
  _adoptAccessToken(token: string): void {
    adoptAccessToken(this, token);
  }

  /** @internal */
  _synchronizeRecoveryIdentity(): void {
    synchronizeRecoveryIdentity(this);
  }

  /**
   * Disconnect from the realtime server
   */
  disconnect(): void {
    disconnectRealtime(this);
  }

  /**
   * Check if connected to the realtime server
   */
  isConnected(): boolean {
    return this._connected;
  }

  /**
   * Create or get a channel
   * @param {string} name - Channel name
   * @param {Object} [options] - Channel options
   * @param {string} [options.type='broadcast'] - Channel type: 'broadcast', 'presence', 'postgres'
   * @param {boolean} [options.autoFetch=true] - Enable auto-fetch for lightweight notifications
   * @param {number} [options.fetchBatchWindowMs] - Batch window for fetch requests
   * @param {number} [options.fetchMaxBatchSize] - Max batch size for fetch requests
   */
  channel(name: string, options: ChannelOptions = {}): RealtimeChannel {
    return openChannel(this, name, options);
  }

  /** @internal */
  _formatChannelName(name: string, type: InternalChannelType): string {
    return channelName(name, type);
  }

  /** @internal */
  _durableChannel(executionId: string, clientToken: string | null): RealtimeChannel | null {
    return openDurableChannel(this, executionId, clientToken);
  }

  /** @internal */
  _removeDurableChannel(channel: RealtimeChannel): void {
    closeDurableChannel(this, channel);
  }

  /** @internal */
  _handleServerPublication(ctx: unknown): void {
    handleServerPublication(this, ctx);
  }

  /** @internal */
  _activePresenceChannel(ctx: unknown): RealtimeChannel | null {
    return activePresenceChannel(this, ctx);
  }

  /** @internal */
  _handleServerJoin(ctx: unknown): void {
    handleServerJoin(this, ctx);
  }

  /** @internal */
  _handleServerLeave(ctx: unknown): void {
    handleServerLeave(this, ctx);
  }

  /** @internal */
  _handleServerSubscribed(ctx: unknown): void {
    handleServerSubscribed(this, ctx);
  }

  /**
   * Get the underlying Centrifuge client
   */
  getClient(): TransportClient | null {
    return this._client;
  }

  /**
   * Register callback for connection events
   */
  onConnect(callback: (context: ConnectContext) => void): UnsubscribeFunction {
    return addConnectListener(this, callback);
  }

  /**
   * Register callback for disconnection events
   */
  onDisconnect(callback: (context: DisconnectContext) => void): UnsubscribeFunction {
    return addDisconnectListener(this, callback);
  }

  /**
   * Register callback for error events
   */
  onError(callback: (context: ErrorContext) => void): UnsubscribeFunction {
    return addErrorListener(this, callback);
  }

  /**
   * Remove a specific channel
   * @param {string} name - Channel name
   * @param {string} [type='broadcast'] - Channel type
   */
  removeChannel(name: string, type: ChannelType = 'broadcast'): void {
    closeChannel(this, name, type);
  }

  /**
   * Remove all channels and listeners
   */
  removeAllChannels(): void {
    closeAllChannels(this);
  }
}

export { VolcanoRealtime };
