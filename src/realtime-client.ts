import { loadCentrifuge } from './realtime-centrifuge.ts';
import { RealtimeChannel } from './realtime-channel.ts';
import { globalFetchConfig, realtimeWebSocketUrl } from './realtime-config.ts';
import {
  attachConnectionHandlers,
  connectionOptions,
  detachConnectionHandlers,
  waitForConnection,
} from './realtime-connection.ts';
import { serverEventRoute } from './realtime-event-route.ts';
import { recoveryIdentity, sameRecoveryIdentity } from './realtime-identity.ts';
import type {
  ActiveFetchConfig,
  ChannelType,
  ClientHandlers,
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
import {
  connectContext,
  disconnectContext,
  errorContext,
  optionalDatabaseName,
  property,
  record,
  requiredAnonKey,
  requiredApiUrl,
} from './realtime-values.ts';
import { loadWebSocket } from './realtime-websocket.ts';

/** @internal */
export function isTransportClient(value: unknown): value is TransportClient {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return [
    'connect',
    'disconnect',
    'on',
    'off',
    'newSubscription',
    'getSubscription',
    'removeSubscription',
    'presence',
  ].every((method) => typeof Reflect.get(value, method) === 'function');
}

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
  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }
    if (this._connectionPromise !== null) {
      return this._connectionPromise;
    }

    this._connectionPromise = this._doConnect();
    try {
      await this._connectionPromise;
    } finally {
      this._connectionPromise = null;
    }
  }

  /** @internal */
  async _doConnect(): Promise<void> {
    const CentrifugeClient = await loadCentrifuge();
    const WebSocket = this._webSocket ?? (await loadWebSocket());

    const wsUrl = `${this.wsUrl}?apikey=${encodeURIComponent(this.anonKey)}`;

    const candidate: unknown = Reflect.construct(CentrifugeClient, [
      wsUrl,
      connectionOptions(
        this.accessToken,
        this.getToken,
        (token) => {
          this._adoptAccessToken(token);
        },
        WebSocket,
      ),
    ]);
    if (!isTransportClient(candidate)) {
      throw new TypeError('Realtime transport does not provide the required client methods');
    }
    this._client = candidate;

    // Set up event handlers (store references for cleanup)
    this._clientHandlers = {
      connected: (ctx) => {
        this._connected = true;
        this._onConnect.forEach((cb) => {
          cb(connectContext(ctx));
        });
      },
      disconnected: (ctx) => {
        this._connected = false;
        this._onDisconnect.forEach((cb) => {
          cb(disconnectContext(ctx));
        });
      },
      error: (ctx) => {
        this._onError.forEach((cb) => {
          cb(errorContext(ctx));
        });
      },
      publication: (ctx) => {
        this._handleServerPublication(ctx);
      },
      join: (ctx) => {
        this._handleServerJoin(ctx);
      },
      leave: (ctx) => {
        this._handleServerLeave(ctx);
      },
      subscribed: (ctx) => {
        this._handleServerSubscribed(ctx);
      },
    };

    attachConnectionHandlers(this._client, this._clientHandlers);
    return waitForConnection(this._client);
  }

  /** @internal */
  _adoptAccessToken(token: string): void {
    this.accessToken = token;
    this._synchronizeRecoveryIdentity();
  }

  /** @internal */
  _synchronizeRecoveryIdentity(): void {
    const nextIdentity = recoveryIdentity(this.accessToken);
    if (sameRecoveryIdentity(this._recoveryIdentity, nextIdentity)) {
      return;
    }
    this._recoveryIdentity = nextIdentity;
    for (const channel of this._channels.values()) {
      channel._resetForIdentityChange();
    }
  }

  /**
   * Disconnect from the realtime server
   */
  disconnect(): void {
    // Unsubscribe all channels first to clean up their timers
    for (const channel of this._channels.values()) {
      try {
        channel._dispose();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this._channels.clear();

    if (this._client !== null) {
      // Remove event handlers first to prevent memory leaks
      if (this._clientHandlers !== null) {
        detachConnectionHandlers(this._client, this._clientHandlers);
        this._clientHandlers = null;
      }

      // Manually trigger disconnect callbacks
      this._onDisconnect.forEach((cb) => {
        cb({ reason: 'manual' });
      });

      // Disconnect the client
      this._client.disconnect();
      this._client = null;
      this._connected = false;
    }
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
    const type = options.type ?? 'broadcast';
    const fullName = this._formatChannelName(name, type);

    const existing = this._channels.get(fullName);
    if (existing !== undefined) {
      return existing;
    }

    const channel = new RealtimeChannel(this, fullName, type, options);
    this._channels.set(fullName, channel);
    return channel;
  }

  /**
   * Format channel name for subscription
   * Format: type:name
   *
   * The server automatically adds the project ID prefix based on
   * the authenticated connection. Clients never need to know about project IDs.
   */
  /** @internal */
  _formatChannelName(name: string, type: ChannelType): string {
    return `${type}:${name}`;
  }

  /**
   * Handle publications from server-side subscriptions
   * The server uses project-prefixed channels: "projectId:type:name"
   * We extract the type:name portion and route to the SDK channel
   */
  /** @internal */
  _handleServerPublication(ctx: unknown): void {
    const route = serverEventRoute(ctx);
    if (route === null) {
      // Not a valid server channel format, ignore
      return;
    }

    // Find the SDK channel and deliver the message
    let channel = this._channels.get(route.sdkChannel);

    // Postgres changes are delivered on a per-user channel for RLS isolation:
    // projectId:postgres:schema:table:userID. onPostgresChanges takes schema and
    // table as separate single-identifier args, so a postgres channel is always
    // exactly postgres:schema:table and the per-user form is exactly 5 segments.
    // Match the base channel the client subscribed to by dropping the trailing
    // userID; otherwise the publication is silently dropped and onPostgresChanges
    // never fires. Requiring exactly 5 segments avoids over-matching anything
    // that isn't this well-defined per-user format.
    if (channel === undefined) {
      if (route.postgresBaseChannel !== null) {
        channel = this._channels.get(route.postgresBaseChannel);
      }
    }

    if (channel !== undefined) {
      channel._handlePublication(ctx);
    }
  }

  /** @internal */
  _activePresenceChannel(ctx: unknown): RealtimeChannel | null {
    const route = serverEventRoute(ctx);
    if (route === null) {
      return null;
    }
    const channel = this._channels.get(route.sdkChannel);
    return channel?._type === 'presence' && !channel._paused ? channel : null;
  }

  /**
   * Handle join events from server-side subscriptions
   */
  /** @internal */
  _handleServerJoin(ctx: unknown): void {
    const channel = this._activePresenceChannel(ctx);
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
  /** @internal */
  _handleServerLeave(ctx: unknown): void {
    const channel = this._activePresenceChannel(ctx);
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
  /** @internal */
  _handleServerSubscribed(ctx: unknown): void {
    const channel = this._activePresenceChannel(ctx);
    if (channel === null) {
      return;
    }
    const presence = property(property(ctx, 'data'), 'presence');
    if (record(presence)) {
      channel._presenceState = { ...presence };
      channel._triggerPresenceSync();
    }
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
    this._onConnect.push(callback);
    return () => {
      this._onConnect = this._onConnect.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register callback for disconnection events
   */
  onDisconnect(callback: (context: DisconnectContext) => void): UnsubscribeFunction {
    this._onDisconnect.push(callback);
    return () => {
      this._onDisconnect = this._onDisconnect.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register callback for error events
   */
  onError(callback: (context: ErrorContext) => void): UnsubscribeFunction {
    this._onError.push(callback);
    return () => {
      this._onError = this._onError.filter((cb) => cb !== callback);
    };
  }

  /**
   * Remove a specific channel
   * @param {string} name - Channel name
   * @param {string} [type='broadcast'] - Channel type
   */
  removeChannel(name: string, type: ChannelType = 'broadcast'): void {
    const fullName = this._formatChannelName(name, type);
    const channel = this._channels.get(fullName);
    if (channel !== undefined) {
      channel._dispose();
      this._channels.delete(fullName);
    }
  }

  /**
   * Remove all channels and listeners
   */
  removeAllChannels(): void {
    for (const channel of this._channels.values()) {
      channel._dispose();
    }
    this._channels.clear();
  }
}

export { VolcanoRealtime };
