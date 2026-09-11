const { verifyBroadcastPause } = require('./contract/broadcast-pause.js');

function createWorld(leak) {
  let handler;
  let paused = false;
  return {
    realtimeMessage: { event: 'message', value: 'contract' },
    subscriber: {
      on: jest.fn((_event, callback) => {
        handler = callback;
      }),
      unsubscribe: jest.fn(async () => {
        paused = true;
      }),
      subscribe: jest.fn(async () => {
        paused = false;
      }),
    },
    publisher: {
      send: jest.fn(async (message) => {
        if (leak || !paused) handler(message);
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
    const result = verifyBroadcastPause(createWorld(true)).catch((error) => error);
    await jest.runAllTimersAsync();
    await expect(result).resolves.toBeInstanceOf(Error);
  });
});
