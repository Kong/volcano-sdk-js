import {
  deletePayload,
  recordsFromQuery,
  rejectBatch,
  runBatchQuery,
  settleBatch,
} from './realtime-autofetch.ts';
import {
  activateChannelSubscription,
  disposeChannel,
  resetChannelForIdentityChange,
  subscribeChannel,
  unsubscribeChannel,
} from './realtime-channel-lifecycle.ts';
import type { VolcanoRealtime } from './realtime-client.ts';
import { channelFetchConfig } from './realtime-config.ts';
import type {
  ActiveFetchConfig,
  ChannelCallback,
  ChannelType,
  EventHandler,
  PendingBatch,
  PendingRow,
  TransportSubscription,
} from './realtime-internal-types.ts';
import type {
  ChannelOptions,
  LightweightNotification,
  PostgresChange,
  PresenceState,
  PublicationContext,
  UnsubscribeFunction,
} from './realtime-public-types.ts';
import {
  isLightweightNotification,
  isPresenceState,
  isPublicationContext,
  matchesPostgresChange,
  payloadEvent,
  property,
  record,
} from './realtime-values.ts';

/**
 * RealtimeChannel - Represents a subscription to a realtime channel
 */
class RealtimeChannel {
  /** @internal */
  readonly _realtime: VolcanoRealtime;
  /** @internal */
  readonly _name: string;
  /** @internal */
  readonly _type: ChannelType;
  /** @internal */
  readonly _options: ChannelOptions;
  /** @internal */
  _subscription: TransportSubscription | null = null;
  /** @internal */
  _lifecycleVersion = 0;
  /** @internal */
  _paused = false;
  /** @internal */
  _callbacks = new Map<unknown, ChannelCallback[]>();
  /** @internal */
  _presenceState: Record<string, unknown> = {};
  /** @internal */
  readonly _fetchConfig: ActiveFetchConfig;
  /** @internal */
  _pendingFetches = new Map<string, PendingBatch>();
  /** @internal */
  _eventHandlers: Record<string, EventHandler> = {};
  /** @internal */
  _presenceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  /** @internal */
  _myPresenceState: Record<string, unknown> = {};

  /** @internal */
  constructor(realtime: VolcanoRealtime, name: string, type: ChannelType, options: ChannelOptions) {
    this._realtime = realtime;
    this._name = name;
    this._type = type;
    this._options = options;
    // Auto-fetch support (Phase 3)
    const parentFetchConfig = realtime._fetchConfig;
    this._fetchConfig = channelFetchConfig(parentFetchConfig, options);
  }

  /**
   * Get channel name
   */
  get name(): string {
    return this._name;
  }

  /**
   * Subscribe to the channel and resolve once it is ready
   */
  async subscribe(): Promise<void> {
    await subscribeChannel(this);
  }

  /** @internal */
  async _activateSubscription(): Promise<void> {
    if (this._subscription === null) {
      throw new Error('Subscription missing');
    }
    await activateChannelSubscription(this, this._subscription);
  }

  unsubscribe(): void {
    unsubscribeChannel(this);
  }

  /** @internal */
  _dispose(): void {
    disposeChannel(this);
  }

  /** @internal */
  _resetForIdentityChange(): void {
    resetChannelForIdentityChange(this);
  }

  /**
   * Handle publication from server-side subscription
   * Called by VolcanoRealtime when a message arrives on the internal channel
   */
  /** @internal */
  _handlePublication(ctx: unknown): void {
    if (this._paused) {
      return;
    }
    const data = property(ctx, 'data');

    // Check if this is a lightweight notification (Phase 3)
    if (isLightweightNotification(data)) {
      void this._handleLightweightNotification(data, ctx);
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
  /** @internal */
  async _handleLightweightNotification(data: LightweightNotification, ctx: unknown): Promise<void> {
    // DELETE notifications may include old_record, deliver immediately
    if (data.type === 'DELETE') {
      this._deliverPayload(deletePayload(data), ctx);
      return;
    }

    // If no volcanoClient or auto-fetch disabled, deliver lightweight as-is
    const volcanoClient = this._realtime.getVolcanoClient();
    if (volcanoClient === null || !this._fetchConfig.enabled) {
      this._deliverPayload(data, ctx);
      return;
    }

    await this._deliverFetchedNotification(data, ctx, this._lifecycleVersion);
  }

  /** @internal */
  async _deliverFetchedNotification(
    data: LightweightNotification,
    ctx: unknown,
    lifecycleVersion: number,
  ): Promise<void> {
    // Auto-fetch the record for INSERT/UPDATE
    try {
      const record = await this._fetchRow(data.schema, data.table, data.id);
      if (lifecycleVersion !== this._lifecycleVersion) {
        return;
      }

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
      if (lifecycleVersion !== this._lifecycleVersion) {
        return;
      }
      // On fetch error, still deliver the lightweight notification
      // so the client knows something changed, even if we couldn't get the data
      console.warn(
        `[Realtime] Failed to fetch record for ${data.schema}.${data.table}:${String(data.id)}:`,
        err instanceof Error ? err.message : String(err),
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
  /** @internal */
  _fetchRow(schema: string, table: string, id: unknown): Promise<unknown> {
    const tableKey = `${schema}.${table}`;

    return new Promise<unknown>((resolve, reject) => {
      // Get or create pending batch for this table
      let batch = this._pendingFetches.get(tableKey);
      if (batch === undefined) {
        batch = {
          ids: new Map<string, PendingRow>(),
          timer: null,
          schema,
          table,
        };
        this._pendingFetches.set(tableKey, batch);
      }

      // Add this ID to the batch
      batch.ids.set(String(id), { resolve, reject });

      // Check if we should flush due to size
      if (batch.ids.size >= this._fetchConfig.maxBatchSize) {
        void this._flushFetch(schema, table);
        return;
      }

      // Set timer for batch window if not already set
      batch.timer ??= setTimeout(() => {
        void this._flushFetch(schema, table);
      }, this._fetchConfig.batchWindowMs);
    });
  }

  /**
   * Flush pending fetch requests for a table
   * @param {string} schema - Schema name
   * @param {string} table - Table name
   */
  /** @internal */
  async _flushFetch(schema: string, table: string): Promise<void> {
    const tableKey = `${schema}.${table}`;
    const batch = this._pendingFetches.get(tableKey);

    if (batch === undefined || batch.ids.size === 0) {
      return;
    }

    // Clear timer and remove from pending
    if (batch.timer !== null) {
      clearTimeout(batch.timer);
    }
    this._pendingFetches.delete(tableKey);

    try {
      const result: unknown = await runBatchQuery(this._realtime, schema, table, [
        ...batch.ids.keys(),
      ]);
      settleBatch(batch.ids, recordsFromQuery(result), table);
    } catch (err) {
      rejectBatch(batch.ids, err);
    }
  }

  /**
   * Deliver a payload to registered callbacks
   * @param {Object} data - Payload data
   * @param {Object} ctx - Publication context
   */
  /** @internal */
  _deliverPayload(data: unknown, ctx: unknown): void {
    const event = payloadEvent(data);
    const callbacks = this._callbacks.get(event) ?? [];
    callbacks.forEach((cb) => {
      cb(data, ctx);
    });

    // Also trigger wildcard listeners
    const wildcardCallbacks = this._callbacks.get('*') ?? [];
    wildcardCallbacks.forEach((cb) => {
      cb(data, ctx);
    });
  }

  /**
   * Listen for events on the channel
   * @param {string} event - Event name or '*' for all events
   * @param {Function} callback - Callback function
   */
  on(
    event: string,
    callback: (data: unknown, context?: PublicationContext) => void,
  ): UnsubscribeFunction {
    const deliver: ChannelCallback = (data, context) => {
      callback(data, isPublicationContext(context) ? context : undefined);
    };
    let callbacks = this._callbacks.get(event);
    if (callbacks === undefined) {
      callbacks = [];
      this._callbacks.set(event, callbacks);
    }
    callbacks.push(deliver);

    // Return unsubscribe function
    return () => {
      const callbacks = this._callbacks.get(event) ?? [];
      this._callbacks.set(
        event,
        callbacks.filter((cb) => cb !== deliver),
      );
    };
  }

  /**
   * Send a message to the channel (broadcast only)
   * @param {Object} data - Message data
   */
  async send(data: Record<string, unknown>): Promise<void> {
    if (this._type !== 'broadcast') {
      throw new Error('send() is only available for broadcast channels');
    }

    if (this._paused || this._subscription?.state !== 'subscribed') {
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
      if (!matchesPostgresChange(data, event, schema, table)) {
        return;
      }
      callback(data, ctx);
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

    return this.on('presence_sync', (state) => {
      if (isPresenceState(state)) {
        callback(state);
      }
    });
  }

  /**
   * Track this client's presence
   * @param {Object} state - Presence state data (optional, for client-side state tracking)
   *
   * Note: Presence data is automatically sent from the server based on your
   * user metadata (from sign-up). Custom presence data should be included
   * when creating the anonymous user.
   */
  track(state: Record<string, unknown> = {}): Promise<void> {
    if (this._type !== 'presence') {
      return Promise.reject(new Error('track() is only available for presence channels'));
    }

    // Store local presence state for client-side access
    this._myPresenceState = state;

    // Presence is automatically managed by Centrifuge based on subscription
    // The connection data (from user metadata) is what other clients see
    // Note: Custom state is stored locally for client-side access
    return Promise.resolve();
  }

  /**
   * Get current presence state
   */
  getPresenceState(): PresenceState {
    const state = { ...this._presenceState };
    return isPresenceState(state) ? state : {};
  }

  /** @internal */
  _updatePresenceState(ctx: unknown): void {
    this._presenceState = {};
    const clients = property(ctx, 'clients');
    if (record(clients)) {
      this._presenceState = { ...clients };
    }
  }

  /** @internal */
  _triggerPresenceSync(): void {
    this._triggerEvent('presence_sync', this._presenceState);
  }

  /** @internal */
  _triggerEvent(event: string, data: unknown): void {
    const callbacks = this._callbacks.get(event) ?? [];
    callbacks.forEach((cb) => {
      cb(data);
    });
  }
}

export { RealtimeChannel };
