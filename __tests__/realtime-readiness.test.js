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

  test('cleans up a failed subscription and propagates its error', async () => {
    const failure = { code: 1, message: 'timeout' };
    transport.ready.mockRejectedValue(failure);
    await expect(channel.subscribe()).rejects.toBe(failure);
    expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
    expect(client.removeSubscription).toHaveBeenCalledWith(transport);
    expect(channel._subscription).toBeNull();
  });

  test('allows a fresh subscription after readiness fails', async () => {
    transport.ready.mockRejectedValue(new Error('denied'));
    await expect(channel.subscribe()).rejects.toThrow('denied');
    const next = subscription();
    client.newSubscription.mockReturnValue(next);
    await expect(channel.subscribe()).resolves.toBeUndefined();
    expect(next.subscribe).toHaveBeenCalledTimes(1);
    expect(next.ready).toHaveBeenCalledWith(10_000);
  });

  test('does not remove a replacement subscription when an earlier wait rejects', async () => {
    const ready = deferred();
    ready.promise.catch(() => undefined);
    transport.ready.mockReturnValue(ready.promise);
    const failed = channel.subscribe().catch((error) => error);
    channel.unsubscribe();
    const next = subscription();
    client.newSubscription.mockReturnValue(next);
    await channel.subscribe();
    ready.reject(new Error('cancelled'));
    await expect(failed).resolves.toEqual(new Error('cancelled'));
    expect(next.unsubscribe).not.toHaveBeenCalled();
    expect(channel._subscription).toBe(next);
  });
});
