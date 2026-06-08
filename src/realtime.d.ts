/**
 * Volcano Realtime SDK - TypeScript type definitions
 */

import type { VolcanoAuth } from './index';

/**
 * External Centrifuge client type (from centrifuge package)
 * We only expose minimal interface for type safety
 */
export interface CentrifugeClient {
  connect(): void;
  disconnect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  newSubscription(channel: string, options?: Record<string, unknown>): unknown;
  getSubscription(channel: string): unknown | undefined;
  removeSubscription(subscription: unknown): void;
}

/**
 * Configuration for auto-fetch behavior in lightweight notification mode
 */
export interface FetchConfig {
  /** Batch window in milliseconds (default: 20) */
  batchWindowMs?: number;
  /** Maximum batch size before forced flush (default: 50) */
  maxBatchSize?: number;
  /** Enable auto-fetch (default: true) */
  enabled?: boolean;
}

/**
 * Custom WebSocket constructor, mainly for Node.js tests or advanced server-side
 * usage where callers need to pass custom headers.
 */
export type WebSocketConstructor = new (
  address: string | URL,
  protocols?: string | string[],
  options?: unknown,
) => unknown;

/**
 * Lightweight notification payload (Phase 2)
 * Sent when server is in lightweight mode - contains only metadata, not full record
 */
export interface LightweightNotification {
  /** Change type: INSERT, UPDATE, DELETE */
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  /** Schema name */
  schema: string;
  /** Table name */
  table: string;
  /** Primary key value */
  id: unknown;
  /** Timestamp of the change */
  timestamp: string;
  /** Mode indicator - always "lightweight" for these notifications */
  mode: 'lightweight';
  /** Old record (only present for DELETE since row cannot be fetched) */
  old_record?: Record<string, unknown>;
}

export interface RealtimeConfig {
  /** Volcano API URL */
  apiUrl: string;
  /**
   * Anon key for project identification.
   * Required for user tokens, optional for service role keys.
   * Service role keys contain the project ID, so empty string is allowed.
   */
  anonKey: string;
  /**
   * Access token for authentication.
   * Can be a user JWT (from auth sign-in) or a service role key (sk-...).
   */
  accessToken?: string;
  /** Function to get/refresh token */
  getToken?: () => Promise<string>;
  /**
   * VolcanoAuth client instance for auto-fetching lightweight notifications.
   * Required for auto-fetch to work.
   */
  volcanoClient?: VolcanoAuth;
  /**
   * Database name for auto-fetch queries (required for VolcanoAuth).
   * You can also call volcanoClient.database(name) before passing it in.
   */
  databaseName?: string;
  /** Configuration for auto-fetch behavior */
  fetchConfig?: FetchConfig;
  /** Optional WebSocket implementation for Node.js tests or advanced usage */
  webSocket?: WebSocketConstructor;
}

export interface ChannelOptions {
  /** Channel type: 'broadcast', 'presence', or 'postgres' */
  type?: 'broadcast' | 'presence' | 'postgres';
  /** Enable auto-fetch for lightweight notifications (default: true) */
  autoFetch?: boolean;
  /** Batch window in milliseconds for fetch requests (overrides global config) */
  fetchBatchWindowMs?: number;
  /** Maximum batch size for fetch requests (overrides global config) */
  fetchMaxBatchSize?: number;
}

export interface PostgresChange {
  /** Table name */
  table: string;
  /** Schema name */
  schema: string;
  /** Change type: INSERT, UPDATE, DELETE */
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  /** New record (for INSERT/UPDATE) */
  record?: Record<string, unknown>;
  /** Old record (for UPDATE/DELETE) */
  old_record?: Record<string, unknown>;
  /** Changed columns (for UPDATE) */
  columns?: string[];
  /** Timestamp of the change */
  timestamp: string;
}

export type PresenceState = Record<string, Record<string, unknown>>;

export interface PublicationContext<T = unknown> {
  /** Publication data */
  data: T;
  /** Publication offset in stream */
  offset?: number;
  /** Publication tags */
  tags?: Record<string, string>;
}

/** Context for connection events */
export interface ConnectContext {
  /** Client ID assigned by server */
  client?: string;
  /** Connection latency in milliseconds */
  latency?: number;
}

/** Context for disconnection events */
export interface DisconnectContext {
  /** Disconnect reason code */
  code?: number;
  /** Disconnect reason message */
  reason?: string;
  /** Whether reconnect will be attempted */
  reconnect?: boolean;
}

/** Context for error events */
export interface ErrorContext {
  /** Error object */
  error?: Error;
  /** Error message */
  message?: string;
  /** Error code */
  code?: number;
}

export interface PresenceInfo {
  /** Client ID */
  client: string;
  /** User ID */
  user?: string;
  /** Connection data */
  data?: Record<string, unknown>;
}

export type UnsubscribeFunction = () => void;

/**
 * Realtime channel for subscribing to events
 */
export declare class RealtimeChannel {
  /**
   * Channel name in format "type:name"
   * Server automatically prefixes with project ID from anon key
   */
  readonly name: string;

  /**
   * Subscribe to the channel
   */
  subscribe(): Promise<void>;

  /**
   * Unsubscribe from the channel
   */
  unsubscribe(): void;

  /**
   * Listen for events on the channel
   * @param event - Event name or '*' for all events
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  on(
    event: string,
    callback: (data: unknown, ctx?: PublicationContext) => void,
  ): UnsubscribeFunction;

  /**
   * Send a message to the channel (broadcast only)
   * @param data - Message data
   */
  send(data: Record<string, unknown>): Promise<void>;

  /**
   * Listen for database changes (postgres channels only)
   * @param event - Event type: 'INSERT', 'UPDATE', 'DELETE', or '*'
   * @param schema - Schema name
   * @param table - Table name
   * @param callback - Callback function
   * @returns Unsubscribe function
   */
  onPostgresChanges(
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    schema: string,
    table: string,
    callback: (data: PostgresChange, ctx?: PublicationContext) => void,
  ): UnsubscribeFunction;

  /**
   * Listen for presence state sync
   * @param callback - Callback with presence state
   * @returns Unsubscribe function
   */
  onPresenceSync(callback: (state: PresenceState) => void): UnsubscribeFunction;

  /**
   * Track this client's presence
   * @param state - Presence state data
   */
  track(state?: Record<string, unknown>): Promise<void>;

  /**
   * Get current presence state
   */
  getPresenceState(): PresenceState;
}

/**
 * Main realtime client
 */
export declare class VolcanoRealtime {
  /**
   * Create a new VolcanoRealtime client
   * @param config - Configuration options
   */
  constructor(config: RealtimeConfig);

  /** WebSocket URL for realtime connections */
  readonly wsUrl: string;

  /**
   * Connect to the realtime server
   */
  connect(): Promise<void>;

  /**
   * Disconnect from the realtime server
   */
  disconnect(): void;

  /**
   * Check if connected to the realtime server
   */
  isConnected(): boolean;

  /**
   * Create or get a channel
   * @param name - Channel name (without project prefix)
   * @param options - Channel options
   */
  channel(name: string, options?: ChannelOptions): RealtimeChannel;

  /**
   * Register callback for connection events
   * @param callback - Callback function receiving connection context
   * @returns Unsubscribe function
   */
  onConnect(callback: (ctx: ConnectContext) => void): UnsubscribeFunction;

  /**
   * Register callback for disconnection events
   * @param callback - Callback function receiving disconnect context
   * @returns Unsubscribe function
   */
  onDisconnect(callback: (ctx: DisconnectContext) => void): UnsubscribeFunction;

  /**
   * Register callback for error events
   * @param callback - Callback function receiving error context
   * @returns Unsubscribe function
   */
  onError(callback: (ctx: ErrorContext) => void): UnsubscribeFunction;

  /**
   * Remove all channels and listeners
   */
  removeAllChannels(): void;

  /**
   * Remove a specific channel
   * @param name - Channel name
   * @param type - Channel type (default: 'broadcast')
   */
  removeChannel(name: string, type?: 'broadcast' | 'presence' | 'postgres'): void;

  /**
   * Get the underlying Centrifuge client
   * @returns The Centrifuge client or null if not connected
   */
  getClient(): CentrifugeClient | null;

  /**
   * Set the VolcanoAuth client for auto-fetching lightweight notifications
   * @param volcanoClient - VolcanoAuth client instance
   */
  setVolcanoClient(volcanoClient: VolcanoAuth): void;

  /**
   * Get the configured VolcanoAuth client
   * @returns The VolcanoAuth client or null
   */
  getVolcanoClient(): VolcanoAuth | null;

  /**
   * Get the fetch configuration
   * @returns The fetch configuration
   */
  getFetchConfig(): FetchConfig;

  /**
   * Set the database name for auto-fetch queries
   * @param databaseName - Database name
   */
  setDatabaseName(databaseName: string): void;

  /**
   * Get the configured database name
   * @returns The database name or null
   */
  getDatabaseName(): string | null;
}

export default VolcanoRealtime;
