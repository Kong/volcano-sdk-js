import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { RealtimeChannel, VolcanoRealtime } from '../src/realtime.ts';
import {
  deferredVoid,
  TestSubscription,
  TestTransportClient,
} from './realtime-transport-fixtures.ts';

describe('channel subscription readiness', () => {
  let client: TestTransportClient;
  let channel: RealtimeChannel;
  let transport: TestSubscription;

  beforeEach(() => {
    transport = new TestSubscription();
    client = new TestTransportClient();
    client.newSubscription.mockReturnValue(transport);
    const realtime = new VolcanoRealtime({
      apiUrl: 'https://api.example.com',
      anonKey: 'project.key',
    });
    jest.spyOn(realtime, 'getClient').mockReturnValue(client);
    channel = realtime.channel('room');
  });

  test('waits for readiness, including concurrent subscribe calls', async () => {
    const ready = deferredVoid();
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
    transport.ready.mockResolvedValue();
    await expect(channel.subscribe()).resolves.toBeUndefined();
    expect(transport.subscribe).toHaveBeenCalledTimes(2);
    expect(transport.ready).toHaveBeenCalledWith(10_000);
    expect(client.newSubscription).toHaveBeenCalledTimes(1);
  });

  test('does not pause a resumed subscription when an earlier wait rejects', async () => {
    const ready = deferredVoid();
    const observedRejection = ready.promise.catch((error: unknown) => error);
    transport.ready.mockReturnValue(ready.promise);
    const failed = channel.subscribe().catch((error: unknown) => error);
    channel.unsubscribe();
    transport.ready.mockResolvedValue();
    await channel.subscribe();
    ready.reject(new Error('cancelled'));
    await expect(observedRejection).resolves.toEqual(new Error('cancelled'));
    await expect(failed).resolves.toEqual(new Error('cancelled'));
    expect(transport.unsubscribe).toHaveBeenCalledTimes(1);
    expect(channel._subscription).toBe(transport);
    expect(channel._paused).toBe(false);
  });
});
