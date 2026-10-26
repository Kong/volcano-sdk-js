import { jest } from '@jest/globals';
import type { TransportClient } from '../src/realtime-internal-types.ts';
import { TestSubscription } from './support/realtime-test-subscription.ts';

function uninitialized(): never {
  throw new Error('Promise executor did not initialize');
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

export class TestTransportClient implements TransportClient {
  readonly subscriptions: TestSubscription[] = [];
  readonly connect = jest.fn<() => void>();
  readonly disconnect = jest.fn<() => void>();
  readonly on = jest.fn<(event: string, handler: (...args: unknown[]) => void) => void>();
  readonly off = jest.fn<(event: string, handler: (...args: unknown[]) => void) => void>();
  readonly newSubscription = jest.fn<(name: string, options?: Record<string, unknown>) => TestSubscription>(() => {
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
