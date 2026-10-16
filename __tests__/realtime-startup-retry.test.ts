import { afterEach, expect, jest, test } from '@jest/globals';
import * as centrifuge from '../src/realtime-centrifuge.ts';
import { VolcanoRealtime } from '../src/realtime-client.ts';
import {
  deferred,
  deferredVoid,
  subscriptionAt,
  TestSubscription,
  TestTransportClient,
} from './realtime-transport-fixtures.ts';

type Listener = (...args: unknown[]) => void;
let started = deferred<StartupTransport>();

class StartupTransport extends TestTransportClient {
  readonly listeners = new Map<string, Set<Listener>>();

  constructor() {
    super();
    this.on.mockImplementation((event, listener) => {
      const listeners = this.listeners.get(event) ?? new Set<Listener>();
      listeners.add(listener);
      this.listeners.set(event, listeners);
    });
    this.off.mockImplementation((event, listener) => {
      this.listeners.get(event)?.delete(listener);
    });
    this.connect.mockImplementation(() => {
      started.resolve(this);
    });
  }

  emit(event: string, context: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(context);
    }
  }
}

async function failStartup(
  transport: StartupTransport,
  failure: 'terminal' | 'timeout',
): Promise<void> {
  if (failure === 'terminal') {
    transport.emit('disconnected', { code: 3507, reason: 'permission denied' });
  } else {
    await jest.advanceTimersByTimeAsync(10_000);
  }
}

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  started = deferred<StartupTransport>();
});

test.each([
  ['terminal', 'resolve', false],
  ['terminal', 'reject', false],
  ['timeout', 'resolve', false],
  ['timeout', 'reject', false],
  ['terminal', 'resolve', true],
  ['terminal', 'reject', true],
  ['timeout', 'resolve', true],
  ['timeout', 'reject', true],
] as const)(
  'resubscribes after %s, late %s, cleanup failure %s',
  async (failure, completion, cleanupFailure) => {
    jest.useFakeTimers();
    jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(StartupTransport);
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'anon',
      webSocket: WebSocket,
    });
    const oldReady = deferredVoid();
    try {
      const failed = realtime.connect().catch((error: unknown) => error);
      const original = await started.promise;
      const channel = realtime.channel('messages');
      const onMessage = jest.fn();
      channel.on('message', onMessage);
      const oldSubscription = new TestSubscription();
      oldSubscription.ready.mockReturnValue(oldReady.promise);
      if (cleanupFailure) {
        oldSubscription.unsubscribe.mockImplementationOnce(() => {
          throw new Error('unsubscribe failed');
        });
      }
      original.newSubscription.mockReturnValue(oldSubscription);
      const pendingSubscribe = channel.subscribe().catch((error: unknown) => error);
      expect(oldSubscription.ready).toHaveBeenCalledWith(10_000);

      await failStartup(original, failure);
      expect(await failed).toMatchObject({
        message: failure === 'terminal' ? 'permission denied' : 'Connection timeout',
      });
      expect(channel._subscription).toBeNull();
      expect(oldSubscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(oldSubscription.handlers.size).toBe(0);
      expect(original.removeSubscription).toHaveBeenCalledWith(oldSubscription);

      started = deferred<StartupTransport>();
      const retry = realtime.connect();
      const replacement = await started.promise;
      replacement.emit('connected', { client: 'replacement' });
      await retry;
      expect(realtime.channel('messages')).toBe(channel);
      await channel.subscribe();
      const newSubscription = subscriptionAt(replacement, 0);
      expect(newSubscription).not.toBe(oldSubscription);

      if (completion === 'resolve') {
        oldReady.resolve();
      } else {
        oldReady.reject(new Error('stale subscription failed'));
      }
      expect(await pendingSubscribe).toMatchObject({
        message:
          completion === 'resolve'
            ? 'Subscription changed before becoming ready'
            : 'stale subscription failed',
      });
      expect(newSubscription.unsubscribe).not.toHaveBeenCalled();
      oldSubscription.emit('publication', { data: { text: 'stale' } });
      newSubscription.emit('publication', { data: { text: 'fresh' } });
      expect(onMessage).toHaveBeenCalledTimes(1);
      expect(onMessage).toHaveBeenCalledWith({ text: 'fresh' }, { data: { text: 'fresh' } });
    } finally {
      oldReady.resolve();
      realtime.disconnect();
    }
  },
);
