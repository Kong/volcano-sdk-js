/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import type { DurableMessage } from '../src/sdk-public-types.ts';
import { deferred } from './auth-concurrency-fixtures.ts';
import {
  message,
  mockClientFactory,
  page,
  target,
  type TransportOperation,
} from './support/durable-messages-fixtures.ts';
import {
  connectedRealtime,
  latestSubscription,
  latestTransport,
  listed,
  resetFakeRealtime,
  until,
  useRetryTimers,
} from './support/durable-messages-realtime.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function readsAgainUntilTheGapCloses(): void {
  test('reads again when a catch-up does not reach what a held message follows', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => listed(page([message(2), message(3)])))
      .mockImplementationOnce(() => listed(page([])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    await until(() => list.mock.calls.length > 0);
    latestTransport().publication({ ...message(3), prev_seq: 2 });
    jest.useFakeTimers({ timerLimit: 100 });
    first.resolve({ data: page([message(1)]), status: 200 });
    await pending;
    expect(received).toEqual([1]);
    await jest.advanceTimersByTimeAsync(500);

    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });
    expect(received).toEqual([1, 2, 3]);
    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(0);
    expect(list.mock.calls[2]?.[2]).toEqual({ direction: 'out', after: 3 });
    realtime.disconnect();
  });
}

function dropsTheOldestHeldMessages(): void {
  test('drops the oldest of more than 128 held messages and reads them back', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => listed(page([message(2), message(3)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    await until(() => list.mock.calls.length > 0);
    const live = latestTransport();
    live.publication({ ...message(131), prev_seq: 130 });
    for (let seq = 2; seq <= 130; seq += 1) {
      live.publication({ ...message(seq), prev_seq: seq - 1 });
    }
    jest.useFakeTimers({ timerLimit: 100 });
    first.resolve({ data: page([message(1)]), status: 200 });
    await pending;
    expect(received).toEqual([1]);
    await jest.advanceTimersByTimeAsync(500);

    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });
    expect(received).toEqual(Array.from({ length: 131 }, (_, index) => index + 1));
    realtime.disconnect();
  });
}

function stopsAtPagesWithNothingNew(): void {
  test('stops at an empty page even if it claims more', async () => {
    const realtime = await connectedRealtime();
    // Answers once, so a read that goes on fails instead of spinning.
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => listed(page([], true)));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });

    const { error } = await volcano.durable.messages.subscribe(target, jest.fn(), {
      realtime,
    });

    expect(error).toBeNull();
    expect(list).toHaveBeenCalledTimes(1);
    realtime.disconnect();
  });

  test('stops at a page that claims more but delivers nothing new', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)], true)))
      .mockImplementationOnce(() => listed(page([message(1)], true)));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const { error } = await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    expect(error).toBeNull();
    expect(received).toEqual([1]);
    expect(list.mock.calls.map((call) => call[2])).toEqual([
      { direction: 'out', after: 0 },
      { direction: 'out', after: 1 },
    ]);
    realtime.disconnect();
  });
}

function catchesUpOnAnnouncedPublishes(): void {
  test('catches up when a broadcast names a publish it has not delivered', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => listed(page([message(2), message(3)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: DurableMessage[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered), {
      realtime,
    });

    const live = latestTransport();
    live.publication({ ...message(3), prev_seq: 2 });
    expect(received.map((delivered) => delivered.seq)).toEqual([1]);
    await until(() => received.length === 3);
    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });

    live.publication({ ...message(2), prev_seq: 1 });
    live.publication({ ...message(4), prev_seq: 3 });
    live.publication({ ...message(5), prev_seq: '9' });
    live.publication(message(6));

    expect(received.map((delivered) => delivered.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(received[3]).toStrictEqual(message(4));
    expect(list).toHaveBeenCalledTimes(2);
    realtime.disconnect();
  });
}

function holdsBroadcastsUntilARetryReads(): void {
  test('holds a broadcast that started a catch-up until a retry reads what it follows', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')))
      .mockImplementationOnce(() => listed(page([message(2), message(3)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    jest.useFakeTimers({ timerLimit: 100 });
    jest.spyOn(console, 'error').mockImplementation(jest.fn());

    latestTransport().publication({ ...message(3), prev_seq: 2 });
    await jest.advanceTimersByTimeAsync(0);
    latestTransport().publication(message(4));
    expect(received).toEqual([1]);
    await jest.advanceTimersByTimeAsync(500);

    expect(received).toEqual([1, 2, 3, 4]);
    realtime.disconnect();
  });
}

function stopsRetryingOnResubscribe(): void {
  test('stops retrying once the channel resubscribes, and catches up then', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')))
      .mockImplementationOnce(() => listed(page([message(2), message(3)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    jest.useFakeTimers({ timerLimit: 100 });
    jest.spyOn(console, 'error').mockImplementation(jest.fn());

    latestTransport().publication({ ...message(3), prev_seq: 2 });
    await jest.advanceTimersByTimeAsync(0);
    latestSubscription().move('subscribing');
    await jest.advanceTimersByTimeAsync(60_000);
    expect(list).toHaveBeenCalledTimes(2);
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(0);

    expect(received).toEqual([1, 2, 3]);
    realtime.disconnect();
  });
}

describe('durable.messages.subscribe', () => {
  beforeEach(useRetryTimers);

  afterEach(resetFakeRealtime);

  readsAgainUntilTheGapCloses();
  dropsTheOldestHeldMessages();
  stopsAtPagesWithNothingNew();
  catchesUpOnAnnouncedPublishes();
  holdsBroadcastsUntilARetryReads();
  stopsRetryingOnResubscribe();
});
