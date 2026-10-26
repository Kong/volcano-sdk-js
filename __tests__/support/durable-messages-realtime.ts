import { jest } from '@jest/globals';
import * as centrifuge from '../../src/realtime-centrifuge.ts';
import { VolcanoRealtime } from '../../src/realtime-client.ts';
import type { DurableMessageList } from '../../src/sdk-public-types.ts';
import { Emitter } from './durable-messages-emitter.ts';
import { FakeSubscription } from './durable-messages-subscription.ts';

const transports: FakeTransport[] = [];

export const fakeRealtime: { nextReady: Promise<void> } = { nextReady: Promise.resolve() };

class FakeTransport extends Emitter {
  readonly subscriptions: FakeSubscription[] = [];

  constructor() {
    super();
    transports.push(this);
  }

  connect(): void {
    this.emit('connected', { client: 'connected', latency: 1 });
  }

  disconnect(): void {
    this.emit('disconnected', { reason: 'manual' });
  }

  newSubscription(channel: string, options?: Record<string, unknown>): FakeSubscription {
    const subscription = new FakeSubscription(channel, options);
    subscription.readyResult = fakeRealtime.nextReady;
    this.subscriptions.push(subscription);
    return subscription;
  }

  getSubscription(): unknown {
    return undefined;
  }

  removeSubscription(): void {
    // Nothing is retained.
  }

  presence(): Promise<unknown> {
    return Promise.resolve({ clients: {} });
  }

  publication(data: unknown, channel = 'proj-1:durable:exec-1'): void {
    this.emit('publication', { channel, data });
  }
}

export function latestTransport(): FakeTransport {
  const latest = transports.at(-1);
  if (latest === undefined) {
    throw new Error('transport was not constructed');
  }
  return latest;
}

export function latestSubscription(): FakeSubscription {
  const latest = latestTransport().subscriptions.at(-1);
  if (latest === undefined) {
    throw new Error('subscription was not created');
  }
  return latest;
}

const realtimes: VolcanoRealtime[] = [];

export async function connectedRealtime(): Promise<VolcanoRealtime> {
  jest.spyOn(centrifuge, 'loadCentrifuge').mockResolvedValue(FakeTransport);
  const realtime = new VolcanoRealtime({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    webSocket: WebSocket,
  });
  realtimes.push(realtime);
  await soon(realtime.connect());
  return realtime;
}

export const settled = (): Promise<void> =>
  new Promise((resolve) => {
    setImmediate(resolve);
  });

// Bounded so a wait that can never finish fails at once instead of at the test
// timeout, which mutation testing reports as a timeout rather than a kill.
export async function until(condition: () => boolean): Promise<void> {
  for (let turn = 0; turn < 20; turn += 1) {
    if (condition()) {
      return;
    }
    await settled();
  }
  throw new Error('condition not reached');
}

// The fake transport connects at once, so a connection still pending after a
// few turns never will; its own timeout is longer than a test's.
function soon<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  const finish = (): void => {
    done = true;
  };
  void promise.then(finish, finish);
  return Promise.race([promise, until(() => done).then(() => promise)]);
}

export const listed = (data: DurableMessageList): Promise<{ data: DurableMessageList; status: number }> =>
  Promise.resolve({ data, status: 200 });

/**
 * A retry a mutant leaves running would otherwise fire during a later test in
 * the same worker; fake timers end with the test that set them.
 */
export function useRetryTimers(): void {
  jest.useFakeTimers({
    doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'queueMicrotask'],
  });
}

/**
 * A test that fails before disconnecting would leave its retries running into
 * the next suite.
 */
export function resetFakeRealtime(): void {
  for (const realtime of realtimes.splice(0)) {
    realtime.disconnect();
  }
  jest.useRealTimers();
  jest.restoreAllMocks();
  transports.length = 0;
  fakeRealtime.nextReady = Promise.resolve();
}
