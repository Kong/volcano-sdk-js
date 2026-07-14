import type { VolcanoClient } from './index.types.js';

export interface CentrifugeClient {
  connect(): void;
  disconnect(): void;
  on(event: string, callback: (...args: unknown[]) => void): void;
  off(event: string, callback: (...args: unknown[]) => void): void;
  newSubscription(channel: string, options?: Record<string, unknown>): unknown;
  getSubscription(channel: string): unknown | undefined;
  removeSubscription(subscription: unknown): void;
}

export interface FetchConfig {
  batchWindowMs?: number;
  maxBatchSize?: number;
  enabled?: boolean;
}

export type WebSocketConstructor = new (
  address: string | URL,
  protocols?: string | string[],
  options?: unknown,
) => unknown;

export interface RealtimeConfig {
  apiUrl: string;
  anonKey: string;
  accessToken?: string;
  getToken?: () => Promise<string>;
  volcanoClient?: VolcanoClient;
  databaseName?: string;
  fetchConfig?: FetchConfig;
  webSocket?: WebSocketConstructor;
}

export interface ChannelOptions {
  type?: 'broadcast' | 'presence' | 'postgres';
  autoFetch?: boolean;
  fetchBatchWindowMs?: number;
  fetchMaxBatchSize?: number;
}

export interface PostgresChange {
  table: string;
  schema: string;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record?: Record<string, unknown>;
  old_record?: Record<string, unknown>;
  columns?: string[];
  timestamp: string;
}

export type PresenceState = Record<string, Record<string, unknown>>;

export interface PublicationContext<T = unknown> {
  data: T;
  offset?: number;
  tags?: Record<string, string>;
}

export interface ConnectContext {
  client?: string;
  latency?: number;
}

export interface DisconnectContext {
  code?: number;
  reason?: string;
  reconnect?: boolean;
}

export interface ErrorContext {
  error?: Error;
  message?: string;
  code?: number;
}

export type UnsubscribeFunction = () => void;

export declare class RealtimeChannel {
  readonly name: string;
  subscribe(): Promise<void>;
  unsubscribe(): void;
  on(
    event: string,
    callback: (data: unknown, context?: PublicationContext) => void,
  ): UnsubscribeFunction;
  send(data: Record<string, unknown>): Promise<void>;
  onPostgresChanges(
    event: 'INSERT' | 'UPDATE' | 'DELETE' | '*',
    schema: string,
    table: string,
    callback: (data: PostgresChange, context?: PublicationContext) => void,
  ): UnsubscribeFunction;
  onPresenceSync(callback: (state: PresenceState) => void): UnsubscribeFunction;
  track(state?: Record<string, unknown>): Promise<void>;
  getPresenceState(): PresenceState;
}

export declare class VolcanoRealtime {
  constructor(config: RealtimeConfig);
  readonly wsUrl: string;
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  channel(name: string, options?: ChannelOptions): RealtimeChannel;
  onConnect(callback: (context: ConnectContext) => void): UnsubscribeFunction;
  onDisconnect(callback: (context: DisconnectContext) => void): UnsubscribeFunction;
  onError(callback: (context: ErrorContext) => void): UnsubscribeFunction;
  removeAllChannels(): void;
  removeChannel(name: string, type?: 'broadcast' | 'presence' | 'postgres'): void;
  getClient(): CentrifugeClient | null;
  setVolcanoClient(volcanoClient: VolcanoClient): void;
  getVolcanoClient(): VolcanoClient | null;
  getFetchConfig(): FetchConfig;
  setDatabaseName(databaseName: string): void;
  getDatabaseName(): string | null;
}
