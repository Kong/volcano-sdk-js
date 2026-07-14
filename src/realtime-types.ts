import type {
  Centrifuge,
  ConnectedContext,
  DisconnectedContext,
  ErrorContext as CentrifugeErrorContext,
  PublicationContext as CentrifugePublicationContext,
} from 'centrifuge';
import type { VolcanoClient } from './types.js';

export type CentrifugeClient = Centrifuge;

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

export interface PublicationContext<T = unknown> extends Omit<
  CentrifugePublicationContext,
  'data'
> {
  data: T;
}

export type ConnectContext = ConnectedContext;
export type DisconnectContext = DisconnectedContext;
export type ErrorContext = CentrifugeErrorContext;

export type UnsubscribeFunction = () => void;

export interface RealtimeChannelContract {
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

export interface VolcanoRealtimeContract {
  readonly wsUrl: string;
  connect(): Promise<void>;
  disconnect(): void;
  isConnected(): boolean;
  channel(name: string, options?: ChannelOptions): RealtimeChannelContract;
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
