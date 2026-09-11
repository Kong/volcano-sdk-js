const { VolcanoRealtime } = require('../src/realtime.js');

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function subscription() {
  return {
    on: jest.fn(),
    off: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    ready: jest.fn().mockResolvedValue(undefined),
  };
}

describe('channel subscription readiness', () => {
  let client;
  let channel;
  let transport;

  beforeEach(() => {
    transport = subscription();
    client = {
      newSubscription: jest.fn().mockReturnValue(transport),
      removeSubscription: jest.fn(),
    };
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project.key',
    });
    jest.spyOn(realtime, 'getClient').mockReturnValue(client);
    channel = realtime.channel('room');
  });

  test('waits for readiness, including concurrent subscribe calls', async () => {
    const ready = deferred();
    transport.ready.mockReturnValue(ready.promise);
    const completed = jest.fn();
    const first = channel.subscribe().then(completed);
    const second = channel.subscribe().then(completed);
    await Promise.resolve();
    expect(completed).not.toHaveBeenCalled();
    expect(client.newSubscription).toHaveBeenCalledTimes(1);
    expect(transport.ready).toHaveBeenCalledWith(10_000);
    ready.resolve();
    await Promise.all([first, second]);
    expect(completed).toHaveBeenCalledTimes(2);
  });

  test('pauses a failed subscription and propagates its error', async () => {
    const failure = { code: 1, message: 'timeout' };
    transport.ready.mockRejectedValue(failure);
    await expect(channel.subscribe()).rejects.toBe(failure);
    expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.removeSubscription).not.toHaveBeenCalled();
    expect(channel._subscription).toBe(transport);
    expect(channel._paused).toBe(true);
  });

  test('retries the retained subscription after readiness fails', async () => {
    transport.ready.mockRejectedValue(new Error('denied'));
    await expect(channel.subscribe()).rejects.toThrow('denied');
    transport.ready.mockResolvedValue(undefined);
    await expect(channel.subscribe()).resolves.toBeUndefined();
    expect(transport.subscribe).toHaveBeenCalledTimes(2);
    expect(transport.ready).toHaveBeenCalledWith(10_000);
    expect(client.newSubscription).toHaveBeenCalledTimes(1);
  });

  test('does not pause a resumed subscription when an earlier wait rejects', async () => {
    const ready = deferred();
    ready.promise.catch(() => undefined);
    transport.ready.mockReturnValue(ready.promise);
    const failed = channel.subscribe().catch((error) => error);
    channel.unsubscribe();
    transport.ready.mockResolvedValue(undefined);
    await channel.subscribe();
    ready.reject(new Error('cancelled'));
    await expect(failed).resolves.toEqual(new Error('cancelled'));
    expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
    expect(channel._subscription).toBe(transport);
    expect(channel._paused).toBe(false);
  });
});
