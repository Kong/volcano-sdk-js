import { jest } from '@jest/globals';
import type {
  EventHandler,
  TransportClient,
  TransportSubscription,
} from '../src/realtime-internal-types.ts';

function uninitialized(): never {
  throw new Error('Promise executor did not initialize');
}

function emptyResult(): Promise<unknown> {
  return Promise.resolve();
}

function noSubscription(): null {
  return null;
}

function emptyPresence(): Promise<unknown> {
  return Promise.resolve({ clients: {} });
}

export function deferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
} {
  let resolve: (value: T) => void = uninitialized;
  let reject: (error: Error) => void = uninitialized;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function deferredVoid(): {
  promise: Promise<void>;
  resolve(): void;
  reject(error: Error): void;
} {
  let resolve: () => void = uninitialized;
  let reject: (error: Error) => void = uninitialized;
  const promise = new Promise<void>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export class TestSubscription implements TransportSubscription {
  readonly handlers = new Map<string, EventHandler>();
  state = 'unsubscribed';
  readonly on = jest.fn<(event: string, handler: EventHandler) => void>((event, handler) => {
    this.handlers.set(event, handler);
  });
  readonly off = jest.fn<(event: string, handler: EventHandler) => void>((event, handler) => {
    if (this.handlers.get(event) === handler) {
      this.handlers.delete(event);
    }
  });
  readonly subscribe = jest.fn<() => void>(() => {
    this.state = 'subscribing';
  });
  readonly unsubscribe = jest.fn<() => void>(() => {
    this.state = 'unsubscribed';
  });
  readonly ready = jest.fn<(timeout: number) => Promise<void>>(() => {
    this.state = 'subscribed';
    return Promise.resolve();
  });
  readonly publish = jest.fn<(data: Record<string, unknown>) => Promise<unknown>>(emptyResult);

  emit(event: string, data?: unknown): void {
    this.handlers.get(event)?.(data);
  }
}

export class TestTransportClient implements TransportClient {
  readonly subscriptions: TestSubscription[] = [];
  readonly connect = jest.fn<() => void>();
  readonly disconnect = jest.fn<() => void>();
  readonly on = jest.fn<(event: string, handler: (...args: unknown[]) => void) => void>();
  readonly off = jest.fn<(event: string, handler: (...args: unknown[]) => void) => void>();
  readonly newSubscription = jest.fn<
    (name: string, options?: Record<string, unknown>) => TestSubscription
  >(() => {
    const subscription = new TestSubscription();
    this.subscriptions.push(subscription);
    return subscription;
  });
  readonly getSubscription = jest.fn<(name: string) => unknown>(noSubscription);
  readonly removeSubscription = jest.fn<(subscription: unknown) => void>();
  readonly presence = jest.fn<(name: string) => Promise<unknown>>(emptyPresence);
}

export function subscriptionAt(client: TestTransportClient, index: number): TestSubscription {
  const subscription = client.subscriptions[index];
  if (subscription === undefined) {
    throw new Error(`Missing subscription ${String(index)}`);
  }
  return subscription;
}
