import { jest } from '@jest/globals';
import { VolcanoRealtime } from '../../src/realtime-client.ts';
import type { ConnectionOptions } from '../../src/realtime-connection.ts';

type Listener = (context: unknown) => void;

const transports: MockTransport[] = [];
let ready = true;

export class MockTransport {
  readonly listeners = new Map<string, Set<Listener>>();
  readonly url: string;
  readonly options: ConnectionOptions;
  readonly disconnect = jest.fn();
  readonly removed: unknown[] = [];

  constructor(url: string, options: ConnectionOptions) {
    this.url = url;
    this.options = options;
    transports.push(this);
  }

  on(event: string, listener: Listener): void {
    const listeners = this.listeners.get(event) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(event, listeners);
  }

  off(event: string, listener: Listener): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: string, context: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(context);
    }
  }

  connect(): void {
    if (ready) {
      this.emit('connected', { client: 'connected', latency: 1 });
    }
  }

  newSubscription(): unknown {
    return undefined;
  }

  getSubscription(): unknown {
    return undefined;
  }

  removeSubscription(subscription: unknown): void {
    this.removed.push(subscription);
  }

  presence(): Promise<unknown> {
    return Promise.resolve({ clients: {} });
  }
}

export function latestTransport(): MockTransport {
  const latest = transports.at(-1);
  if (latest === undefined) {
    throw new Error('transport was not constructed');
  }
  return latest;
}

export function client(): VolcanoRealtime {
  return new VolcanoRealtime({
    apiUrl: 'https://api.example.com/',
    anonKey: 'a b',
    webSocket: WebSocket,
  });
}

export function deferTransportConnection(): void {
  ready = false;
}

export function resetTransports(): void {
  transports.length = 0;
  ready = true;
}
