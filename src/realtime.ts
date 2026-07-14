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

import type {
  Centrifuge as CentrifugeInstance,
  ConnectedContext,
  DisconnectedContext,
  ErrorContext as CentrifugeErrorContext,
  JoinContext,
  LeaveContext,
  PublicationContext as CentrifugePublicationContext,
  ServerJoinContext,
  ServerLeaveContext,
  ServerPublicationContext,
  ServerSubscribedContext,
  SubscribedContext,
  Subscription,
} from 'centrifuge';
import type {
  ChannelOptions,
  ConnectContext,
  DisconnectContext,
  ErrorContext,
  FetchConfig,
  PostgresChange,
  PresenceState,
  PublicationContext,
  RealtimeChannelContract,
  RealtimeConfig,
  UnsubscribeFunction,
  VolcanoRealtimeContract,
  WebSocketConstructor,
} from './realtime-types.js';
import type { VolcanoClient } from './types.js';

export type * from './realtime-types.js';

type CentrifugeConstructor = (typeof import('centrifuge'))['Centrifuge'];
type ChannelType = NonNullable<ChannelOptions['type']>;
type RealtimeRecord = Record<string, unknown>;
type RealtimeCallback = (data: unknown, context?: PublicationContext) => void;

interface PendingFetchCallback {
  reject(reason?: unknown): void;
  resolve(value: RealtimeRecord): void;
}

interface PendingFetchBatch {
  ids: Map<string, PendingFetchCallback>;
  schema: string;
  table: string;
  timer: ReturnType<typeof setTimeout> | null;
}

const asRealtimeRecord = (value: unknown): RealtimeRecord =>
  value && typeof value === 'object' ? (value as RealtimeRecord) : {};

// Centrifuge client - dynamically imported
let Centrifuge: CentrifugeConstructor | null = null;

/**
 * Dynamically imports the Centrifuge client
 */
async function loadCentrifuge(): Promise<CentrifugeConstructor> {
  if (Centrifuge) {
    return Centrifuge;
  }

  try {
    // Try ES module import
    const module = await import('centrifuge');
    Centrifuge = module.Centrifuge;
    return Centrifuge;
  } catch {
    throw new Error(
      'Unable to load the SDK realtime dependency. Reinstall @volcano.dev/sdk or check that package dependencies were installed.',
    );
  }
}

// Load WebSocket for Node.js environments
let WebSocketImpl: WebSocketConstructor | null = null;
async function loadWebSocket(): Promise<WebSocketConstructor> {
  if (WebSocketImpl) {
    return WebSocketImpl;
  }

  // Check if we're in a browser environment
  if (typeof window !== 'undefined' && window.WebSocket) {
    WebSocketImpl = window.WebSocket;
    return WebSocketImpl;
  }

  // Node.js environment - try to load ws package
  try {
    const ws = await import('ws');
    WebSocketImpl = (ws.default || ws.WebSocket) as unknown as WebSocketConstructor;
    return WebSocketImpl;
  } catch {
    throw new Error(
      'Unable to load a WebSocket implementation. In Node.js, reinstall @volcano.dev/sdk or pass a custom webSocket implementation.',
    );
  }
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
class VolcanoRealtime implements VolcanoRealtimeContract {
  readonly apiUrl: string;
  readonly anonKey: string;
  accessToken?: string;
  readonly getToken?: () => Promise<string>;
  private readonly _webSocket: WebSocketConstructor | null;
  private _client: CentrifugeInstance | null = null;
  private readonly _channels = new Map<string, RealtimeChannel>();
  private _connected = false;
  private _connectionPromise: Promise<void> | null = null;
  private _clientHandlers: {
    connected(context: ConnectedContext): void;
    disconnected(context: DisconnectedContext): void;
    error(context: CentrifugeErrorContext): void;
    join(context: ServerJoinContext): void;
    leave(context: ServerLeaveContext): void;
    publication(context: ServerPublicationContext): void;
    subscribed(context: ServerSubscribedContext): void;
  } | null = null;
  private _onConnect: ((context: ConnectContext) => void)[] = [];
  private _onDisconnect: ((context: DisconnectContext) => void)[] = [];
  private _onError: ((context: ErrorContext) => void)[] = [];
  private _volcanoClient: VolcanoClient | null;
  private readonly _fetchConfig: Required<FetchConfig>;
  private _databaseName: string | null;

  /**
   * Create a new VolcanoRealtime client
   * @param {Object} config - Configuration options
   * @param {string} config.apiUrl - Volcano API URL
   * @param {string} [config.anonKey] - Anon key (required for user tokens, optional for service keys)
   * @param {string} config.accessToken - Access token (user JWT) or service role key (sk-...)
   * @param {Function} [config.getToken] - Function to get/refresh token
   * @param {Object} [config.volcanoClient] - Volcano client for auto-fetching lightweight notifications
   * @param {string} [config.databaseName] - Database name for auto-fetch queries
   * @param {Object} [config.fetchConfig] - Configuration for auto-fetch behavior
   * @param {Function} [config.webSocket] - Optional WebSocket implementation for Node.js tests/advanced usage
   */
  constructor(config: RealtimeConfig) {
    if (!config.apiUrl) {
      throw new Error('apiUrl is required');
    }
    // anonKey is optional for service role keys (they contain project ID)
    // But we need either anonKey or accessToken
    if (config.anonKey === undefined) {
      throw new Error('anonKey is required');
    }

    this.apiUrl = config.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    this.anonKey = config.anonKey || ''; // Allow empty string for service keys
    this.accessToken = config.accessToken;
    this.getToken = config.getToken;
    this._webSocket = config.webSocket || null;

    // Auto-fetch support (Phase 3)
    this._volcanoClient = config.volcanoClient || null;
    this._fetchConfig = {
      batchWindowMs: config.fetchConfig?.batchWindowMs || 20,
      maxBatchSize: config.fetchConfig?.maxBatchSize || 50,
      enabled: config.fetchConfig?.enabled !== false,
    };

    // Database name for auto-fetch queries (optional)
    this._databaseName = config.databaseName || null;
  }

  /**
   * Set the Volcano client for auto-fetching
   * @param {Object} volcanoClient - Volcano client instance
   */
  setVolcanoClient(volcanoClient: VolcanoClient): void {
    this._volcanoClient = volcanoClient;
  }

  /**
   * Get the configured Volcano client
   * @returns {Object|null} The Volcano client or null
   */
  getVolcanoClient(): VolcanoClient | null {
    return this._volcanoClient;
  }

  /**
   * Get the fetch configuration
   * @returns {Object} The fetch configuration
   */
  getFetchConfig(): Required<FetchConfig> {
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
    const url = new URL(this.apiUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/realtime/v1/websocket`;
  }

  /**
   * Connect to the realtime server
   */
  async connect(): Promise<void> {
    if (this._connected) {
      return;
    }
    if (this._connectionPromise) {
      return this._connectionPromise;
    }

    this._connectionPromise = this._doConnect();
    try {
      await this._connectionPromise;
    } finally {
      this._connectionPromise = null;
    }
  }

  private async _doConnect(): Promise<void> {
    const CentrifugeClient = await loadCentrifuge();
    const WebSocket = this._webSocket || (await loadWebSocket());

    const wsUrl = `${this.wsUrl}?apikey=${encodeURIComponent(this.anonKey)}`;

    const getToken = this.getToken;
    this._client = new CentrifugeClient(wsUrl, {
      token: this.accessToken,
      getToken: getToken
        ? async () => {
            const token = await getToken();
            this.accessToken = token;
            return token;
          }
        : undefined,
      debug: false,
      websocket: WebSocket as never,
    });

    // Set up event handlers (store references for cleanup)
    this._clientHandlers = {
      connected: (ctx) => {
        this._connected = true;
        this._onConnect.forEach((cb) => {
          cb(ctx);
        });
      },
      disconnected: (ctx) => {
        this._connected = false;
        this._onDisconnect.forEach((cb) => {
          cb(ctx);
        });
      },
      error: (ctx) => {
        this._onError.forEach((cb) => {
          cb(ctx);
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

    this._client.on('connected', this._clientHandlers.connected);
    this._client.on('disconnected', this._clientHandlers.disconnected);
    this._client.on('error', this._clientHandlers.error);
    this._client.on('publication', this._clientHandlers.publication);
    this._client.on('join', this._clientHandlers.join);
    this._client.on('leave', this._clientHandlers.leave);
    this._client.on('subscribed', this._clientHandlers.subscribed);

    // Connect and wait for connected event
    const client = this._client;
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      function cleanupConnectionListeners(): void {
        clearTimeout(timeout);
        client.off('connected', onConnected);
        client.off('error', onError);
      }

      function onConnected(): void {
        cleanupConnectionListeners();
        resolve();
      }

      function onError(ctx: CentrifugeErrorContext): void {
        cleanupConnectionListeners();
        reject(new Error(ctx.error?.message || 'Connection failed'));
      }

      client.on('connected', onConnected);
      client.on('error', onError);
      client.connect();
    });
  }

  /**
   * Disconnect from the realtime server
   */
  disconnect(): void {
    // Unsubscribe all channels first to clean up their timers
    for (const channel of this._channels.values()) {
      try {
        channel.unsubscribe();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this._channels.clear();

    if (this._client) {
      // Remove event handlers first to prevent memory leaks
      if (this._clientHandlers) {
        this._client.off('connected', this._clientHandlers.connected);
        this._client.off('disconnected', this._clientHandlers.disconnected);
        this._client.off('error', this._clientHandlers.error);
        this._client.off('publication', this._clientHandlers.publication);
        this._client.off('join', this._clientHandlers.join);
        this._client.off('leave', this._clientHandlers.leave);
        this._client.off('subscribed', this._clientHandlers.subscribed);
        this._clientHandlers = null;
      }

      // Manually trigger disconnect callbacks
      this._onDisconnect.forEach((cb) => {
        cb({ code: 0, reason: 'manual' });
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
    const type = options.type || 'broadcast';
    const fullName = this._formatChannelName(name, type);

    if (this._channels.has(fullName)) {
      return this._channels.get(fullName)!;
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
  private _formatChannelName(name: string, type: ChannelType): string {
    return `${type}:${name}`;
  }

  /**
   * Handle publications from server-side subscriptions
   * The server uses project-prefixed channels: "projectId:type:name"
   * We extract the type:name portion and route to the SDK channel
   */
  private _handleServerPublication(ctx: ServerPublicationContext): void {
    const serverChannel = ctx.channel;

    // Server channel format: projectId:type:name
    // We need to extract type:name to match our SDK channel
    const parts = serverChannel.split(':');
    if (parts.length < 3) {
      // Not a valid server channel format, ignore
      return;
    }

    // Skip projectId, reconstruct type:name
    const sdkChannel = parts.slice(1).join(':');

    // Find the SDK channel and deliver the message
    const channel = this._channels.get(sdkChannel);
    if (channel) {
      channel._handlePublication(ctx);
    }
  }

  /**
   * Handle join events from server-side subscriptions
   */
  private _handleServerJoin(ctx: ServerJoinContext): void {
    const serverChannel = ctx.channel;
    const parts = serverChannel.split(':');
    if (parts.length < 3) {
      return;
    }

    const sdkChannel = parts.slice(1).join(':');
    const channel = this._channels.get(sdkChannel);
    if (channel && channel._type === 'presence') {
      // Update presence state
      if (ctx.info) {
        channel._presenceState[ctx.info.client] = ctx.info as unknown as RealtimeRecord;
      }
      channel._triggerPresenceSync();
      channel._triggerEvent('join', ctx.info);
    }
  }

  /**
   * Handle leave events from server-side subscriptions
   */
  private _handleServerLeave(ctx: ServerLeaveContext): void {
    const serverChannel = ctx.channel;
    const parts = serverChannel.split(':');
    if (parts.length < 3) {
      return;
    }

    const sdkChannel = parts.slice(1).join(':');
    const channel = this._channels.get(sdkChannel);
    if (channel && channel._type === 'presence') {
      // Update presence state
      if (ctx.info) {
        delete channel._presenceState[ctx.info.client];
      }
      channel._triggerPresenceSync();
      channel._triggerEvent('leave', ctx.info);
    }
  }

  /**
   * Handle subscribed events - includes initial presence state
   */
  private _handleServerSubscribed(ctx: ServerSubscribedContext): void {
    const serverChannel = ctx.channel;
    const parts = serverChannel.split(':');
    if (parts.length < 3) {
      return;
    }

    const sdkChannel = parts.slice(1).join(':');
    const channel = this._channels.get(sdkChannel);

    // For presence channels, populate initial state from subscribe response
    if (channel && channel._type === 'presence' && ctx.data) {
      // data contains initial presence information
      if (ctx.data.presence) {
        channel._presenceState = {};
        for (const [clientId, info] of Object.entries(ctx.data.presence)) {
          channel._presenceState[clientId] = info as RealtimeRecord;
        }
        channel._triggerPresenceSync();
      }
    }
  }

  /**
   * Get the underlying Centrifuge client
   */
  getClient(): CentrifugeInstance | null {
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
    if (channel) {
      channel.unsubscribe();
      this._channels.delete(fullName);
    }
  }

  /**
   * Remove all channels and listeners
   */
  removeAllChannels(): void {
    for (const channel of this._channels.values()) {
      channel.unsubscribe();
    }
    this._channels.clear();
  }
}

/**
 * RealtimeChannel - Represents a subscription to a realtime channel
 */
class RealtimeChannel implements RealtimeChannelContract {
  readonly _realtime: VolcanoRealtime;
  readonly _name: string;
  readonly _type: ChannelType;
  readonly _options: ChannelOptions;
  _subscription: Subscription | null = null;
  readonly _callbacks = new Map<string, RealtimeCallback[]>();
  _presenceState: PresenceState = {};
  private _myPresenceState: RealtimeRecord = {};
  private readonly _fetchConfig: Required<FetchConfig>;
  private readonly _pendingFetches = new Map<string, PendingFetchBatch>();
  private _eventHandlers: Partial<{
    join(context: JoinContext): void;
    leave(context: LeaveContext): void;
    publication(context: CentrifugePublicationContext): void;
    subscribed(context: SubscribedContext): void;
  }> = {};
  private _presenceTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(realtime: VolcanoRealtime, name: string, type: ChannelType, options: ChannelOptions) {
    this._realtime = realtime;
    this._name = name;
    this._type = type;
    this._options = options;
    // Auto-fetch support (Phase 3)
    const parentFetchConfig = realtime.getFetchConfig();
    this._fetchConfig = {
      batchWindowMs: options.fetchBatchWindowMs || parentFetchConfig.batchWindowMs,
      maxBatchSize: options.fetchMaxBatchSize || parentFetchConfig.maxBatchSize,
      enabled: options.autoFetch !== false && parentFetchConfig.enabled,
    };
  }

  /**
   * Get channel name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Subscribe to the channel
   */
  async subscribe(): Promise<void> {
    if (this._subscription) {
      return;
    }

    const client = this._realtime.getClient();
    if (!client) {
      throw new Error('Not connected to realtime server');
    }

    this._subscription = client.newSubscription(this._name, {
      joinLeave: this._type === 'presence',
      // Enable recovery for all channels
      recoverable: true,
    });

    // Set up message handler (store reference for cleanup)
    this._eventHandlers.publication = (ctx) => {
      const event = ctx.data?.event || 'message';
      const callbacks = this._callbacks.get(event) || [];
      callbacks.forEach((cb) => {
        cb(ctx.data, ctx);
      });

      // Also trigger wildcard listeners
      const wildcardCallbacks = this._callbacks.get('*') || [];
      wildcardCallbacks.forEach((cb) => {
        cb(ctx.data, ctx);
      });
    };
    this._subscription.on('publication', this._eventHandlers.publication);

    // Set up presence handlers for presence channels
    if (this._type === 'presence') {
      this._eventHandlers.join = (ctx) => {
        this._presenceState[ctx.info.client] = asRealtimeRecord(ctx.info.chanInfo ?? ctx.info);
        this._triggerPresenceSync();
        this._triggerEvent('join', ctx.info);
      };
      this._subscription.on('join', this._eventHandlers.join);

      this._eventHandlers.leave = (ctx) => {
        delete this._presenceState[ctx.info.client];
        this._triggerPresenceSync();
        this._triggerEvent('leave', ctx.info);
      };
      this._subscription.on('leave', this._eventHandlers.leave);

      // After subscribing, immediately fetch current presence for late joiners
      // For server-side subscriptions, use client.presence() not subscription.presence()
      this._eventHandlers.subscribed = async () => {
        // Small delay to ensure subscription is fully active
        this._presenceTimeoutId = setTimeout(async () => {
          this._presenceTimeoutId = null;
          try {
            const client = this._realtime.getClient();
            if (client && this._subscription) {
              // Use client-level presence() for server-side subscriptions
              const presence = await client.presence(this._name);

              // Centrifuge returns presence data in `clients` field
              if (presence && presence.clients) {
                this._presenceState = {};
                for (const [clientId, info] of Object.entries(presence.clients)) {
                  this._presenceState[clientId] = asRealtimeRecord(info.chanInfo ?? info);
                }
                this._triggerPresenceSync();
              }
            }
          } catch {
            // Ignore errors - presence might not be available yet
          }
        }, 150);
      };
      this._subscription.on('subscribed', this._eventHandlers.subscribed);
    }

    await this._subscription.subscribe();
  }

  /**
   * Unsubscribe from the channel
   */
  unsubscribe(): void {
    // Cancel pending presence fetch timeout
    if (this._presenceTimeoutId) {
      clearTimeout(this._presenceTimeoutId);
      this._presenceTimeoutId = null;
    }

    // Clear all pending fetch timers to prevent memory leaks
    if (this._pendingFetches) {
      for (const batch of this._pendingFetches.values()) {
        if (batch.timer) {
          clearTimeout(batch.timer);
        }
        // Reject any pending promises
        for (const { reject } of batch.ids.values()) {
          reject(new Error('Channel unsubscribed'));
        }
      }
      this._pendingFetches.clear();
    }

    if (this._subscription) {
      // Remove event listeners before unsubscribing
      const handlers = this._eventHandlers;
      if (handlers.publication) {
        this._subscription.off('publication', handlers.publication);
      }
      if (handlers.join) {
        this._subscription.off('join', handlers.join);
      }
      if (handlers.leave) {
        this._subscription.off('leave', handlers.leave);
      }
      if (handlers.subscribed) {
        this._subscription.off('subscribed', handlers.subscribed);
      }
      this._eventHandlers = {};

      this._subscription.unsubscribe();
      // Also remove from Centrifuge client registry to allow re-subscription
      const client = this._realtime.getClient();
      if (client) {
        try {
          client.removeSubscription(this._subscription);
        } catch {
          // Ignore errors if subscription already removed
        }
      }
      this._subscription = null;
    }
    this._callbacks.clear();
    this._presenceState = {};
  }

  /**
   * Handle publication from server-side subscription
   * Called by VolcanoRealtime when a message arrives on the internal channel
   */
  _handlePublication(ctx: ServerPublicationContext): void {
    const data = ctx.data;

    // Check if this is a lightweight notification (Phase 3)
    if (data?.mode === 'lightweight') {
      this._handleLightweightNotification(data, ctx);
      return;
    }

    // Full payload - deliver immediately
    this._deliverPayload(data, ctx);
  }

  /**
   * Handle a lightweight notification by auto-fetching the record data
   * @param {Object} data - Lightweight notification data
   * @param {Object} ctx - Publication context
   */
  private async _handleLightweightNotification(
    data: RealtimeRecord,
    ctx: PublicationContext,
  ): Promise<void> {
    const volcanoClient = this._realtime.getVolcanoClient();

    // DELETE notifications may include old_record, deliver immediately
    if (data.type === 'DELETE') {
      // Convert lightweight DELETE to full format for backward compatibility
      const oldRecord =
        data.old_record !== undefined
          ? data.old_record
          : data.id !== undefined
            ? { id: data.id }
            : undefined;
      const fullPayload = {
        type: data.type,
        schema: data.schema,
        table: data.table,
        old_record: oldRecord,
        id: data.id,
        timestamp: data.timestamp,
      };
      this._deliverPayload(fullPayload, ctx);
      return;
    }

    // If no volcanoClient or auto-fetch disabled, deliver lightweight as-is
    if (!volcanoClient || !this._fetchConfig.enabled) {
      this._deliverPayload(data, ctx);
      return;
    }

    // Auto-fetch the record for INSERT/UPDATE
    try {
      if (typeof data.schema !== 'string' || typeof data.table !== 'string') {
        this._deliverPayload(data, ctx);
        return;
      }
      const record = await this._fetchRow(data.schema, data.table, data.id);

      // Convert to full payload format for backward compatibility
      const fullPayload = {
        type: data.type,
        schema: data.schema,
        table: data.table,
        record,
        timestamp: data.timestamp,
      };

      this._deliverPayload(fullPayload, ctx);
    } catch (err) {
      // On fetch error, still deliver the lightweight notification
      // so the client knows something changed, even if we couldn't get the data
      console.warn(
        `[Realtime] Failed to fetch record for ${data.schema}.${data.table}:${data.id}:`,
        err instanceof Error ? err.message : err,
      );
      this._deliverPayload(data, ctx);
    }
  }

  /**
   * Fetch a row from the database, batching requests for efficiency
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @param {*} id - Primary key value
   * @returns {Promise<Object>} The fetched record
   */
  private _fetchRow(schema: string, table: string, id: unknown): Promise<RealtimeRecord> {
    const tableKey = `${schema}.${table}`;

    return new Promise<RealtimeRecord>((resolve, reject) => {
      // Get or create pending batch for this table
      if (!this._pendingFetches.has(tableKey)) {
        this._pendingFetches.set(tableKey, {
          ids: new Map(),
          timer: null,
          schema,
          table,
        });
      }

      const batch = this._pendingFetches.get(tableKey)!;

      // Add this ID to the batch
      batch.ids.set(String(id), { resolve, reject });

      // Check if we should flush due to size
      if (batch.ids.size >= this._fetchConfig.maxBatchSize) {
        this._flushFetch(schema, table);
        return;
      }

      // Set timer for batch window if not already set
      if (!batch.timer) {
        batch.timer = setTimeout(() => {
          this._flushFetch(schema, table);
        }, this._fetchConfig.batchWindowMs);
      }
    });
  }

  /**
   * Flush pending fetch requests for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   */
  private async _flushFetch(schema: string, table: string): Promise<void> {
    const tableKey = `${schema}.${table}`;
    const batch = this._pendingFetches.get(tableKey);

    if (!batch || batch.ids.size === 0) {
      return;
    }

    // Clear timer and remove from pending
    if (batch.timer) {
      clearTimeout(batch.timer);
    }
    this._pendingFetches.delete(tableKey);

    // Get all IDs to fetch
    const idsToFetch = Array.from(batch.ids.keys());
    const callbacks = new Map(batch.ids);

    try {
      const volcanoClient = this._realtime.getVolcanoClient();

      const databaseName = this._realtime.getDatabaseName?.() || null;
      if (!databaseName) {
        throw new TypeError('Database name not set. Pass databaseName to VolcanoRealtime.');
      }
      if (typeof volcanoClient?.database !== 'function') {
        throw new TypeError('volcanoClient.database not available');
      }
      const dbClient = volcanoClient.database(databaseName);

      const tableName = schema && schema !== 'public' ? `${schema}.${table}` : table;

      // Fetch all records in a single query using IN clause
      // Assumes primary key column is 'id' - this is a common convention
      const { data, error } = await dbClient.from(tableName).select('*').in('id', idsToFetch);

      if (error) {
        // Reject all pending callbacks
        for (const cb of callbacks.values()) {
          cb.reject(new Error(error.message || 'Database fetch failed'));
        }
        return;
      }

      // Build a map of id -> record
      const recordMap = new Map<string, RealtimeRecord>();
      for (const record of data || []) {
        recordMap.set(String(record.id), record);
      }

      // Resolve callbacks
      for (const [id, cb] of callbacks) {
        const record = recordMap.get(id);
        if (record) {
          cb.resolve(record);
        } else {
          // Record not found - could be RLS denial or row deleted
          cb.reject(new Error(`Record not found or access denied: ${table}:${id}`));
        }
      }
    } catch (err) {
      // Reject all pending callbacks on error
      for (const cb of callbacks.values()) {
        cb.reject(err);
      }
    }
  }

  /**
   * Deliver a payload to registered callbacks
   * @param {Object} data - Payload data
   * @param {Object} ctx - Publication context
   */
  private _deliverPayload(data: unknown, ctx: PublicationContext): void {
    const record = asRealtimeRecord(data);
    const event =
      (typeof record.event === 'string' && record.event) ||
      (typeof record.type === 'string' && record.type) ||
      'message';
    const callbacks = this._callbacks.get(event) || [];
    callbacks.forEach((cb) => {
      cb(data, ctx);
    });

    // Also trigger wildcard listeners
    const wildcardCallbacks = this._callbacks.get('*') || [];
    wildcardCallbacks.forEach((cb) => {
      cb(data, ctx);
    });
  }

  /**
   * Listen for events on the channel
   * @param {string} event - Event name or '*' for all events
   * @param {Function} callback - Callback function
   */
  on(event: string, callback: RealtimeCallback): UnsubscribeFunction {
    if (!this._callbacks.has(event)) {
      this._callbacks.set(event, []);
    }
    this._callbacks.get(event)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this._callbacks.get(event) || [];
      this._callbacks.set(
        event,
        callbacks.filter((cb) => cb !== callback),
      );
    };
  }

  /**
   * Send a message to the channel (broadcast only)
   * @param {Object} data - Message data
   */
  async send(data: RealtimeRecord): Promise<void> {
    if (this._type !== 'broadcast') {
      throw new Error('send() is only available for broadcast channels');
    }

    if (!this._subscription) {
      throw new Error('Channel not subscribed');
    }

    await this._subscription.publish(data);
  }

  /**
   * Listen for database changes (postgres channels only)
   * @param {string} event - Event type: 'INSERT', 'UPDATE', 'DELETE', or '*'
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   * @param {Function} callback - Callback function
   */
  onPostgresChanges(
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    schema: string,
    table: string,
    callback: (data: PostgresChange, context?: PublicationContext) => void,
  ): UnsubscribeFunction {
    if (this._type !== 'postgres') {
      throw new Error('onPostgresChanges() is only available for postgres channels');
    }

    // Filter callback to only match the requested event type
    return this.on('*', (data, ctx) => {
      const change = asRealtimeRecord(data);
      if (change.schema !== schema || change.table !== table) {
        return;
      }
      if (event !== '*' && change.type !== event) {
        return;
      }
      callback(change as unknown as PostgresChange, ctx);
    });
  }

  /**
   * Listen for presence state sync
   * @param {Function} callback - Callback with presence state
   */
  onPresenceSync(callback: (state: PresenceState) => void): UnsubscribeFunction {
    if (this._type !== 'presence') {
      throw new Error('onPresenceSync() is only available for presence channels');
    }

    return this.on('presence_sync', (state) => callback(state as PresenceState));
  }

  /**
   * Track this client's presence
   * @param {Object} state - Presence state data (optional, for client-side state tracking)
   *
   * Note: Presence data is automatically sent from the server based on your
   * user metadata (from sign-up). Custom presence data should be included
   * when creating the anonymous user.
   */
  async track(state: RealtimeRecord = {}): Promise<void> {
    if (this._type !== 'presence') {
      throw new Error('track() is only available for presence channels');
    }

    // Store local presence state for client-side access
    this._myPresenceState = state;

    // Presence is automatically managed by Centrifuge based on subscription
    // The connection data (from user metadata) is what other clients see
    // Note: Custom state is stored locally for client-side access
  }

  /**
   * Get current presence state
   */
  getPresenceState(): PresenceState {
    return { ...this._presenceState };
  }

  private _updatePresenceState(ctx: { clients?: Record<string, { data: RealtimeRecord }> }): void {
    this._presenceState = {};
    if (ctx.clients) {
      for (const [clientId, info] of Object.entries(ctx.clients)) {
        this._presenceState[clientId] = info.data;
      }
    }
  }

  _triggerPresenceSync(): void {
    this._triggerEvent('presence_sync', this._presenceState);
  }

  _triggerEvent(event: string, data: unknown): void {
    const callbacks = this._callbacks.get(event) || [];
    callbacks.forEach((cb) => {
      cb(data);
    });
  }
}

export { RealtimeChannel, VolcanoRealtime };
