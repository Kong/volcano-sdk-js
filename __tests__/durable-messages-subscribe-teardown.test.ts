/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import type { VolcanoRealtime } from '../src/realtime-client.ts';
import { deferred, signal } from './auth-concurrency-fixtures.ts';
import {
  message,
  mockClientFactory,
  page,
  refused,
  target,
  type TransportOperation,
} from './support/durable-messages-fixtures.ts';
import {
  connectedRealtime,
  latestSubscription,
  latestTransport,
  listed,
  resetFakeRealtime,
  settled,
  until,
  useRetryTimers,
} from './support/durable-messages-realtime.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function deliversNothingAfterTheClientIsDiscarded(): void {
  test.each<[string, (realtime: VolcanoRealtime) => void]>([
    [
      'disconnects',
      (realtime) => {
        realtime.disconnect();
      },
    ],
    [
      'removes all channels',
      (realtime) => {
        realtime.removeAllChannels();
      },
    ],
    [
      'switches identity',
      (realtime) => {
        realtime._adoptAccessToken('new-token');
      },
    ],
  ])('delivers nothing a catch-up reads after the realtime client %s', async (_case, discard) => {
    const realtime = await connectedRealtime();
    const reread = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([])))
      .mockImplementationOnce(() => reread.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await until(() => list.mock.calls.length > 1);
    discard(realtime);
    reread.resolve({ data: page([message(1)]), status: 200 });
    await settled();

    expect(received).toEqual([]);
    realtime.disconnect();
  });
}

function deliversNothingAfterUnsubscribing(): void {
  test('delivers nothing a catch-up reads after unsubscribing, and reads no more', async () => {
    const realtime = await connectedRealtime();
    const reread = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([])))
      .mockImplementationOnce(() => reread.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    const { data } = await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    jest.useFakeTimers({ timerLimit: 100 });

    latestSubscription().move('subscribing');
    latestTransport().publication(message(2));
    latestTransport().publication({ ...message(4), prev_seq: 3 });
    latestSubscription().move('subscribed');
    await data?.unsubscribe();
    reread.resolve({ data: page([message(1)]), status: 200 });
    await jest.advanceTimersByTimeAsync(60_000);

    expect(received).toEqual([]);
    expect(list).toHaveBeenCalledTimes(2);
  });
}

function retriesNothingAfterUnsubscribing(): void {
  test('retries nothing when a catch-up fails after unsubscribing', async () => {
    const realtime = await connectedRealtime();
    const answer = signal();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([])))
      .mockImplementationOnce(async () => {
        await answer.promise;
        throw new Error('unavailable');
      });
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const { data } = await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });
    jest.useFakeTimers({ timerLimit: 100 });
    jest.spyOn(console, 'error').mockImplementation(jest.fn());

    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await data?.unsubscribe();
    answer.resolve();
    await jest.advanceTimersByTimeAsync(60_000);

    expect(list).toHaveBeenCalledTimes(2);
  });
}

function endsWithItsChannel(): void {
  test('fails when its channels are removed during the first catch-up', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => first.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    await until(() => list.mock.calls.length > 0);
    realtime.removeAllChannels();
    first.resolve({ data: page([message(1)]), status: 200 });

    await expect(pending).resolves.toEqual(refused('The durable message subscription has ended'));
    expect(received).toEqual([]);
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    realtime.disconnect();
  });

  test('reads nothing for a broadcast that arrives after the server ends the subscription', async () => {
    const realtime = await connectedRealtime();
    const list = jest.fn<TransportOperation>().mockImplementation(() => listed(page([])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    jest.spyOn(console, 'error').mockImplementation(jest.fn());
    latestSubscription().move('unsubscribed');
    latestTransport().publication({ ...message(3), prev_seq: 2 });
    await settled();

    expect(received).toEqual([]);
    expect(list).toHaveBeenCalledTimes(1);
    realtime.disconnect();
  });
}

function reportsOnlyServerEndings(): void {
  test('reports a subscription the server ends and lets the execution be subscribed to again', async () => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: jest.fn<TransportOperation>().mockImplementation(() => listed(page([]))),
    });
    await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn());

    latestSubscription().move('unsubscribed');
    const again = await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });

    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith(
      '[Realtime] The server ended the durable message subscription; subscribe again to resume',
    );
    expect(again.error).toBeNull();
    realtime.disconnect();
  });

  test('reports nothing when the client ends the subscription', async () => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: jest.fn<TransportOperation>().mockImplementation(() => listed(page([]))),
    });
    const subscription = await volcano.durable.messages.subscribe(target, jest.fn(), {
      realtime,
    });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn());

    await subscription.data?.unsubscribe();

    expect(reported).not.toHaveBeenCalled();
    realtime.disconnect();
  });
}

describe('durable.messages.subscribe', () => {
  beforeEach(useRetryTimers);

  afterEach(resetFakeRealtime);

  deliversNothingAfterTheClientIsDiscarded();
  deliversNothingAfterUnsubscribing();
  retriesNothingAfterUnsubscribing();
  endsWithItsChannel();
  reportsOnlyServerEndings();
});
