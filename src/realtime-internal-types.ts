import type { ChannelOptions } from './realtime-public-types.ts';

export type ChannelType = NonNullable<ChannelOptions['type']>;
export type ChannelCallback = (data: unknown, context?: unknown) => void;
export type EventHandler = (context: unknown) => void;
export type RecoveryIdentity =
  | { kind: 'user'; projectId: string; subject: string }
  | { kind: 'credential'; token: unknown };

export interface ActiveFetchConfig {
  batchWindowMs: number;
  maxBatchSize: number;
  enabled: boolean;
}

export interface ClientHandlers {
  connected(context: unknown): void;
  disconnected(context: unknown): void;
  error(context: unknown): void;
  publication(context: unknown): void;
  join(context: unknown): void;
  leave(context: unknown): void;
  subscribed(context: unknown): void;
}

export interface TransportSubscription {
  on(event: string, handler: EventHandler): void;
  off(event: string, handler: EventHandler): void;
  subscribe(): void;
  unsubscribe(): void;
  ready(timeout: number): Promise<void>;
  setData(data: Record<string, unknown>): void;
  state: string;
  publish(data: Record<string, unknown>): Promise<unknown>;
}

export interface TransportClient {
  connect(): void;
  disconnect(): void;
  on(event: string, handler: (...args: unknown[]) => void): void;
  off(event: string, handler: (...args: unknown[]) => void): void;
  newSubscription(name: string, options?: Record<string, unknown>): TransportSubscription;
  getSubscription(name: string): unknown;
  removeSubscription(subscription: unknown): void;
  presence(name: string): Promise<unknown>;
}

export interface PendingRow {
  resolve(value: unknown): void;
  reject(error: unknown): void;
}

export interface PendingBatch {
  ids: Map<string, PendingRow>;
  timer: ReturnType<typeof setTimeout> | null;
  schema: string;
  table: string;
}
