import { type BroadcastMessage, verifyBroadcastPause } from './contract/broadcast-pause.ts';

function createWorld(leak: boolean) {
  let handler: ((message: unknown) => void) | null = null;
  let paused = false;
  return {
    realtimeMessage: { event: 'message', value: 'contract' },
    subscriber: {
      on: jest.fn((_event: 'message', callback: (message: unknown) => void) => {
        handler = callback;
      }),
      unsubscribe: jest.fn(() => {
        paused = true;
        return Promise.resolve();
      }),
      subscribe: jest.fn(() => {
        paused = false;
        return Promise.resolve();
      }),
    },
    publisher: {
      send: jest.fn((message: BroadcastMessage) => {
        if (leak || !paused) {
          const receive = handler;
          if (receive === null) {
            throw new Error('Subscriber was not registered');
          }
          receive(message);
        }
        return Promise.resolve();
      }),
    },
  };
}

describe('broadcast pause acceptance checks', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('accepts silence and resumes through the original handler', async () => {
    const world = createWorld(false);
    const result = verifyBroadcastPause(world);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toEqual(world.realtimeMessage);
    expect(world.subscriber.on).toHaveBeenCalledTimes(1);
  });

  test('rejects a publication delivered while paused', async () => {
    const result = verifyBroadcastPause(createWorld(true));
    await jest.runAllTimersAsync();
    await expect(result).rejects.toBeInstanceOf(Error);
  });
});
