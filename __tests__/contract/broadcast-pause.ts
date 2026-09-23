import { setTimeout as delay } from 'node:timers/promises';

export interface BroadcastMessage {
  event: string;
  value: string;
}

interface BroadcastWorld {
  realtimeMessage: BroadcastMessage;
  subscriber: {
    on(event: 'message', callback: (message: unknown) => void): unknown;
    unsubscribe(): Promise<unknown>;
    subscribe(): Promise<unknown>;
  };
  publisher: { send(message: BroadcastMessage): Promise<unknown> };
}

class BroadcastMailbox {
  readonly listeners = new Map<string, (message: BroadcastMessage) => void>();

  emit(message: BroadcastMessage): void {
    this.listeners.get(message.value)?.(message);
  }

  wait(value: string, signal: AbortSignal): Promise<BroadcastMessage> {
    return new Promise((resolve, reject) => {
      const abort = (): void => {
        this.listeners.delete(value);
        reject(new Error('Broadcast message did not arrive within 10 seconds'));
      };
      signal.addEventListener('abort', abort, { once: true });
      this.listeners.set(value, (message) => {
        signal.removeEventListener('abort', abort);
        this.listeners.delete(value);
        resolve(message);
      });
    });
  }
}

async function publishAndReceive(
  publisher: BroadcastWorld['publisher'],
  messages: BroadcastMailbox,
  message: BroadcastMessage,
): Promise<BroadcastMessage> {
  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10_000);
  try {
    const received = messages.wait(message.value, controller.signal);
    const [, data] = await Promise.all([publisher.send(message), received]);
    expect(data).toEqual(message);
    return data;
  } finally {
    clearTimeout(timeout);
    controller.abort();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isBroadcastMessage(value: unknown): value is BroadcastMessage {
  return (
    isRecord(value) && typeof value['value'] === 'string' && typeof value['event'] === 'string'
  );
}

async function verifyBroadcastPause(world: BroadcastWorld): Promise<BroadcastMessage> {
  const messages = new BroadcastMailbox();
  const delivered: BroadcastMessage[] = [];
  world.subscriber.on('message', (message) => {
    if (!isBroadcastMessage(message)) {
      throw new Error('Broadcast message was invalid');
    }
    delivered.push(message);
    messages.emit(message);
  });
  const baseline = { ...world.realtimeMessage, value: `${world.realtimeMessage.value}-baseline` };
  await publishAndReceive(world.publisher, messages, baseline);
  await world.subscriber.unsubscribe();
  delivered.length = 0;
  await world.publisher.send({
    ...world.realtimeMessage,
    value: `${world.realtimeMessage.value}-paused`,
  });
  await delay(1_000);
  expect(delivered).toEqual([]);
  await world.subscriber.subscribe();
  return publishAndReceive(world.publisher, messages, world.realtimeMessage);
}

export { verifyBroadcastPause };
