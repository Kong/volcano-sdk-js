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

// Centrifuge client - dynamically imported
let Centrifuge = null;

/**
 * Dynamically imports the Centrifuge client
 */
async function loadCentrifuge() {
  if (Centrifuge) {
    return Centrifuge;
  }

  try {
    // Try ES module import
    const module = await import('centrifuge');
    Centrifuge = module.Centrifuge || module.default;
    return Centrifuge;
  } catch {
    throw new Error(
      'Unable to load the SDK realtime dependency. Reinstall @volcano.dev/sdk or check that package dependencies were installed.',
    );
  }
}

// Load WebSocket for Node.js environments
let WebSocketImpl = null;
async function loadWebSocket() {
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
    WebSocketImpl = ws.default || ws.WebSocket || ws;
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
class VolcanoRealtime {
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
  constructor(config) {
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

    this._client = null;
    this._channels = new Map();
    this._connected = false;
    this._connectionPromise = null;

    // Callbacks
    this._onConnect = [];
    this._onDisconnect = [];
    this._onError = [];

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
   * Set the VolcanoAuth client for auto-fetching
   * @param {Object} volcanoClient - VolcanoAuth client instance
   */
  setVolcanoClient(volcanoClient) {
    this._volcanoClient = volcanoClient;
  }

  /**
   * Get the configured VolcanoAuth client
   * @returns {Object|null} The VolcanoAuth client or null
   */
  getVolcanoClient() {
    return this._volcanoClient;
  }

  /**
   * Get the fetch configuration
   * @returns {Object} The fetch configuration
   */
  getFetchConfig() {
    return { ...this._fetchConfig };
  }

  /**
   * Set the database name for auto-fetch queries
   * @param {string} databaseName
   */
  setDatabaseName(databaseName) {
    this._databaseName = databaseName;
  }

  /**
   * Get the configured database name
   * @returns {string|null}
   */
  getDatabaseName() {
    return this._databaseName;
  }

  /**
   * Get the WebSocket URL for realtime connections
   */
  get wsUrl() {
    const url = new URL(this.apiUrl);
    const protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${url.host}/realtime/v1/websocket`;
  }

  /**
   * Connect to the realtime server
   */
  async connect() {
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

  async _doConnect() {
    const CentrifugeClient = await loadCentrifuge();
    const WebSocket = this._webSocket || (await loadWebSocket());

    const wsUrl = `${this.wsUrl}?apikey=${encodeURIComponent(this.anonKey)}`;

    this._client = new CentrifugeClient(wsUrl, {
      token: this.accessToken,
      getToken: this.getToken
        ? async () => {
            const token = await this.getToken();
            this.accessToken = token;
            return token;
          }
        : undefined,
      debug: false,
      websocket: WebSocket,
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
    return new Promise((resolve, reject) => {
      const client = this._client;
      const timeout = setTimeout(() => {
        reject(new Error('Connection timeout'));
      }, 10000);

      function cleanupConnectionListeners() {
        clearTimeout(timeout);
        client.off('connected', onConnected);
        client.off('error', onError);
      }

      function onConnected() {
        cleanupConnectionListeners();
        resolve();
      }

      function onError(ctx) {
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
  disconnect() {
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
  isConnected() {
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
  channel(name, options = {}) {
    const type = options.type || 'broadcast';
    const fullName = this._formatChannelName(name, type);

    if (this._channels.has(fullName)) {
      return this._channels.get(fullName);
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
  _formatChannelName(name, type) {
    return `${type}:${name}`;
  }

  /**
   * Handle publications from server-side subscriptions
   * The server uses project-prefixed channels: "projectId:type:name"
   * We extract the type:name portion and route to the SDK channel
   */
  _handleServerPublication(ctx) {
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
  _handleServerJoin(ctx) {
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
        channel._presenceState[ctx.info.client] = ctx.info;
      }
      channel._triggerPresenceSync();
      channel._triggerEvent('join', ctx.info);
    }
  }

  /**
   * Handle leave events from server-side subscriptions
   */
  _handleServerLeave(ctx) {
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
  _handleServerSubscribed(ctx) {
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
          channel._presenceState[clientId] = info;
        }
        channel._triggerPresenceSync();
      }
    }
  }

  /**
   * Get the underlying Centrifuge client
   */
  getClient() {
    return this._client;
  }

  /**
   * Register callback for connection events
   */
  onConnect(callback) {
    this._onConnect.push(callback);
    return () => {
      this._onConnect = this._onConnect.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register callback for disconnection events
   */
  onDisconnect(callback) {
    this._onDisconnect.push(callback);
    return () => {
      this._onDisconnect = this._onDisconnect.filter((cb) => cb !== callback);
    };
  }

  /**
   * Register callback for error events
   */
  onError(callback) {
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
  removeChannel(name, type = 'broadcast') {
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
  removeAllChannels() {
    for (const channel of this._channels.values()) {
      channel.unsubscribe();
    }
    this._channels.clear();
  }
}

/**
 * RealtimeChannel - Represents a subscription to a realtime channel
 */
class RealtimeChannel {
  constructor(realtime, name, type, options) {
    this._realtime = realtime;
    this._name = name;
    this._type = type;
    this._options = options;
    this._subscription = null;
    this._callbacks = new Map();
    this._presenceState = {};

    // Auto-fetch support (Phase 3)
    const parentFetchConfig = realtime.getFetchConfig();
    this._fetchConfig = {
      batchWindowMs: options.fetchBatchWindowMs || parentFetchConfig.batchWindowMs,
      maxBatchSize: options.fetchMaxBatchSize || parentFetchConfig.maxBatchSize,
      enabled: options.autoFetch !== false && parentFetchConfig.enabled,
    };
    this._pendingFetches = new Map(); // table -> { ids: Map<id, {resolve, reject}>, timer }

    // Event handler references for cleanup
    this._eventHandlers = {};
    this._presenceTimeoutId = null;
  }

  /**
   * Get channel name
   */
  get name() {
    return this._name;
  }

  /**
   * Subscribe to the channel
   */
  async subscribe() {
    if (this._subscription) {
      return;
    }

    const client = this._realtime.getClient();
    if (!client) {
      throw new Error('Not connected to realtime server');
    }

    this._subscription = client.newSubscription(this._name, {
      // Enable presence for presence channels
      presence: this._type === 'presence',
      joinLeave: this._type === 'presence',
      // Enable recovery for all channels
      recover: true,
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
      this._eventHandlers.presence = (ctx) => {
        this._updatePresenceState(ctx);
        this._triggerPresenceSync();
      };
      this._subscription.on('presence', this._eventHandlers.presence);

      this._eventHandlers.join = (ctx) => {
        this._presenceState[ctx.info.client] = ctx.info.data;
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
                  this._presenceState[clientId] = info;
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
  unsubscribe() {
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
      for (const [event, handler] of Object.entries(this._eventHandlers)) {
        try {
          this._subscription.off(event, handler);
        } catch {
          // Ignore errors if listener already removed
        }
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
  _handlePublication(ctx) {
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
  async _handleLightweightNotification(data, ctx) {
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
        err.message,
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
  _fetchRow(schema, table, id) {
    const tableKey = `${schema}.${table}`;

    return new Promise((resolve, reject) => {
      // Get or create pending batch for this table
      if (!this._pendingFetches.has(tableKey)) {
        this._pendingFetches.set(tableKey, {
          ids: new Map(),
          timer: null,
          schema,
          table,
        });
      }

      const batch = this._pendingFetches.get(tableKey);

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
  async _flushFetch(schema, table) {
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

      if (!volcanoClient?.from || typeof volcanoClient.from !== 'function') {
        throw new Error('volcanoClient.from not available');
      }

      const databaseName =
        this._realtime.getDatabaseName?.() || volcanoClient._currentDatabaseName || null;
      let dbClient = volcanoClient;
      if (databaseName) {
        if (typeof volcanoClient.database !== 'function') {
          throw new TypeError('volcanoClient.database not available');
        }
        dbClient = volcanoClient.database(databaseName);
      } else if (typeof volcanoClient.database === 'function') {
        throw new TypeError(
          'Database name not set. Call volcanoClient.database(name) or pass databaseName to VolcanoRealtime.',
        );
      }

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
      const recordMap = new Map();
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
  _deliverPayload(data, ctx) {
    const event = data?.event || data?.type || 'message';
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
  on(event, callback) {
    if (!this._callbacks.has(event)) {
      this._callbacks.set(event, []);
    }
    this._callbacks.get(event).push(callback);

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
  async send(data) {
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
  onPostgresChanges(event, schema, table, callback) {
    if (this._type !== 'postgres') {
      throw new Error('onPostgresChanges() is only available for postgres channels');
    }

    // Filter callback to only match the requested event type
    return this.on('*', (data, ctx) => {
      if (data.schema !== schema || data.table !== table) {
        return;
      }
      if (event !== '*' && data.type !== event) {
        return;
      }
      callback(data, ctx);
    });
  }

  /**
   * Listen for presence state sync
   * @param {Function} callback - Callback with presence state
   */
  onPresenceSync(callback) {
    if (this._type !== 'presence') {
      throw new Error('onPresenceSync() is only available for presence channels');
    }

    return this.on('presence_sync', callback);
  }

  /**
   * Track this client's presence
   * @param {Object} state - Presence state data (optional, for client-side state tracking)
   *
   * Note: Presence data is automatically sent from the server based on your
   * user metadata (from sign-up). Custom presence data should be included
   * when creating the anonymous user.
   */
  async track(state = {}) {
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
  getPresenceState() {
    return { ...this._presenceState };
  }

  _updatePresenceState(ctx) {
    this._presenceState = {};
    if (ctx.clients) {
      for (const [clientId, info] of Object.entries(ctx.clients)) {
        this._presenceState[clientId] = info.data;
      }
    }
  }

  _triggerPresenceSync() {
    this._triggerEvent('presence_sync', this._presenceState);
  }

  _triggerEvent(event, data) {
    const callbacks = this._callbacks.get(event) || [];
    callbacks.forEach((cb) => {
      cb(data);
    });
  }
}

export { RealtimeChannel, VolcanoRealtime };
