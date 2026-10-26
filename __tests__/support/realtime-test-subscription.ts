import { jest } from '@jest/globals';
import type { EventHandler, TransportSubscription } from '../../src/realtime-internal-types.ts';

function emptyResult(): Promise<unknown> {
  return Promise.resolve();
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
