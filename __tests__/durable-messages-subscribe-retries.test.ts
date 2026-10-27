/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
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
  settled,
  until,
  useRetryTimers,
} from './support/durable-messages-realtime.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function releasesHeldMessagesAfterEveryCatchUp(): void {
  test('releases held messages only once every pending catch-up has read', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const second = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    const subscription = latestSubscription();
    subscription.move('subscribing');
    subscription.move('subscribed');
    subscription.move('subscribing');
    subscription.move('subscribed');
    latestTransport().publication(message(4));
    await until(() => list.mock.calls.length > 1);
    first.resolve({ data: page([message(2)]), status: 200 });
    await until(() => list.mock.calls.length > 2);

    expect(received).toEqual([1, 2]);
    expect(list.mock.calls[2]?.[2]).toEqual({ direction: 'out', after: 2 });
    second.resolve({ data: page([message(3)]), status: 200 });
    await settled();
    expect(received).toEqual([1, 2, 3, 4]);
    realtime.disconnect();
  });
}

function retriesFailedCatchUpsPastAGap(): void {
  test('retries a catch-up that fails after resubscribing, holding live messages past the gap', async () => {
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
    jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestSubscription().move('subscribing');
    latestTransport().publication({ ...message(3), prev_seq: 2 });
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(499);
    expect(list).toHaveBeenCalledTimes(2);
    expect(received).toEqual([1]);
    await jest.advanceTimersByTimeAsync(1);

    expect(list.mock.calls[2]?.[2]).toEqual({ direction: 'out', after: 1 });
    expect(received).toEqual([1, 2, 3]);
    latestTransport().publication({ ...message(4), prev_seq: 3 });
    expect(received).toEqual([1, 2, 3, 4]);
    realtime.disconnect();
  });
}

function reportsFailedCatchUpsWithNothingHeld(): void {
  test('reports and retries a catch-up that fails after resubscribing with nothing held', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')))
      .mockImplementationOnce(() => listed(page([message(2)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    jest.useFakeTimers({ timerLimit: 100 });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(499);
    expect(list).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenCalledWith(
      '[Realtime] Durable message catch-up failed:',
      expect.objectContaining({ message: 'unavailable' }),
    );
    await jest.advanceTimersByTimeAsync(1);

    expect(list.mock.calls[2]?.[2]).toEqual({ direction: 'out', after: 1 });
    expect(received).toEqual([1, 2]);
    expect(reported).toHaveBeenCalledTimes(1);
    realtime.disconnect();
  });
}

function catchesUpAtOncePastAGap(): void {
  test('catches up at once on a broadcast past a gap, replacing a waiting retry', async () => {
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
    jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(0);
    latestTransport().publication({ ...message(3), prev_seq: 2 });
    await jest.advanceTimersByTimeAsync(0);
    expect(received).toEqual([1, 2, 3]);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(list).toHaveBeenCalledTimes(3);
    realtime.disconnect();
  });
}

function releasesFollowingMessagesOnFailure(): void {
  test('releases a held message that follows on even when the catch-up fails', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    jest.useFakeTimers({ timerLimit: 100 });
    jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestSubscription().move('subscribing');
    latestTransport().publication({ ...message(2), prev_seq: 1 });
    latestTransport().publication({ ...message(4), prev_seq: 3 });
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(0);

    expect(received).toEqual([1, 2]);
    realtime.disconnect();
  });
}

function backsOffBetweenRetries(): void {
  test('backs off between retries, doubling from half a second to 30 seconds', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockRejectedValue(new Error('unavailable'));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });
    jest.useFakeTimers({ timerLimit: 100 });
    jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestTransport().publication({ ...message(3), prev_seq: 2 });
    await jest.advanceTimersByTimeAsync(0);
    // A retry is still pending a millisecond before its delay and fires at it.
    const steps = [500, 1000, 2000, 4000, 8000, 16_000, 30_000, 30_000].flatMap((delay) => [
      { advance: delay - 1, retries: 0 },
      { advance: 1, retries: 1 },
    ]);
    for (const { advance, retries } of steps) {
      const calls = list.mock.calls.length;
      // oxlint-disable-next-line eslint/no-await-in-loop -- Fake time must advance step by step to observe each backoff delay.
      await jest.advanceTimersByTimeAsync(advance);
      expect(list).toHaveBeenCalledTimes(calls + retries);
    }

    realtime.disconnect();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(list).toHaveBeenCalledTimes(10);
  });
}

function restartsTheBackoff(): void {
  test('starts the backoff over once a catch-up succeeds', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')))
      .mockImplementationOnce(() => Promise.reject(new Error('unavailable')))
      .mockImplementationOnce(() => listed(page([])))
      .mockRejectedValue(new Error('unavailable'));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });
    jest.useFakeTimers({ timerLimit: 100 });
    jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(1500);
    expect(list).toHaveBeenCalledTimes(4);
    latestSubscription().move('subscribing');
    latestSubscription().move('subscribed');
    await jest.advanceTimersByTimeAsync(499);
    expect(list).toHaveBeenCalledTimes(5);
    await jest.advanceTimersByTimeAsync(1);

    expect(list).toHaveBeenCalledTimes(6);
    realtime.disconnect();
  });
}

describe('durable.messages.subscribe', () => {
  beforeEach(useRetryTimers);

  afterEach(resetFakeRealtime);

  releasesHeldMessagesAfterEveryCatchUp();
  retriesFailedCatchUpsPastAGap();
  reportsFailedCatchUpsWithNothingHeld();
  catchesUpAtOncePastAGap();
  releasesFollowingMessagesOnFailure();
  backsOffBetweenRetries();
  restartsTheBackoff();
});
