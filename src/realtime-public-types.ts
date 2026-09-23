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
  getSubscription(channel: string): unknown;
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
  /** Primary key in a lightweight notification */
  id?: string | number;
  /** Present when row data has not been fetched */
  mode?: 'lightweight';
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

export type PresenceState = Record<string, PresenceInfo>;

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
  error?: Error | { code: number; message: string };
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
  /** Server connection metadata */
  connInfo?: Record<string, unknown>;
  /** Server subscription metadata */
  chanInfo?: Record<string, unknown>;
  /** Legacy transport data, when supplied */
  data?: Record<string, unknown>;
}

export type UnsubscribeFunction = () => void;
