import {
  deliverFetchedNotification,
  deliverPayload,
  fetchRow,
  flushFetch,
  handleLightweightNotification,
  handlePublication,
} from './realtime-channel-delivery.ts';
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
  EventHandler,
  InternalChannelType,
  PendingBatch,
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
import { isPresenceState, isPublicationContext, matchesPostgresChange, property, record } from './realtime-values.ts';

/**
 * RealtimeChannel - Represents a subscription to a realtime channel
 */
class RealtimeChannel {
  /** @internal */
  readonly _realtime: VolcanoRealtime;
  /** @internal */
  readonly _name: string;
  /** @internal */
  readonly _type: InternalChannelType;
  /** @internal */
  readonly _options: ChannelOptions;
  /** @internal */
  _subscribeData: Record<string, string> | null = null;
  /** @internal */
  _onSubscriptionState: ((state: string) => void) | null = null;
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
  constructor(realtime: VolcanoRealtime, name: string, type: InternalChannelType, options: ChannelOptions) {
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

  /** @internal */
  _handlePublication(ctx: unknown): void {
    handlePublication(this, ctx);
  }

  /** @internal */
  _handleLightweightNotification(data: LightweightNotification, ctx: unknown): Promise<void> {
    return handleLightweightNotification(this, data, ctx);
  }

  /** @internal */
  _deliverFetchedNotification(data: LightweightNotification, ctx: unknown, lifecycleVersion: number): Promise<void> {
    return deliverFetchedNotification(this, data, ctx, lifecycleVersion);
  }

  /** @internal */
  _fetchRow(schema: string, table: string, id: unknown): Promise<unknown> {
    return fetchRow(this, schema, table, id);
  }

  /** @internal */
  _flushFetch(schema: string, table: string): Promise<void> {
    return flushFetch(this, schema, table);
  }

  /** @internal */
  _deliverPayload(data: unknown, ctx: unknown): void {
    deliverPayload(this, data, ctx);
  }

  /**
   * Listen for events on the channel
   * @param {string} event - Event name or '*' for all events
   * @param {Function} callback - Callback function
   */
  on(event: string, callback: (data: unknown, context?: PublicationContext) => void): UnsubscribeFunction {
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
