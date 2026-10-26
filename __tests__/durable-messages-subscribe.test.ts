/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { deferred, signal } from './auth-concurrency-fixtures.ts';
import {
  message,
  mockClientFactory,
  options,
  page,
  resolving,
  target,
  type TransportOperation,
} from './support/durable-messages-fixtures.ts';
import {
  connectedRealtime,
  fakeRealtime,
  latestSubscription,
  latestTransport,
  listed,
  resetFakeRealtime,
  settled,
  until,
  useRetryTimers,
} from './support/durable-messages-realtime.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function catchesUpThenDeliversLive(): void {
  test('catches up on what was published before, then delivers live messages once each, in order', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1), message(2)], true)))
      .mockImplementationOnce(() => listed(page([message(3)])));
    const { volcano, transport } = clientWithTransport({
      listDurableMessagesFromApplication: list,
    });
    const received: number[] = [];

    const result = await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    expect(result).toEqual({
      data: { unsubscribe: expect.any(Function) },
      status: 200,
      error: null,
    });
    expect(received).toEqual([1, 2, 3]);
    expect(latestSubscription().channel).toBe('durable:exec-1');
    expect(latestSubscription().options).toEqual({
      joinLeave: false,
      data: { client_token: 'ct-1' },
    });
    expect(list.mock.calls.map((call) => call[2])).toEqual([
      { direction: 'out', after: 0 },
      { direction: 'out', after: 2 },
    ]);
    expect(list.mock.calls[0]?.[3]).toEqual(options(volcano, 'anon', { 'X-Volcano-Client-Token': 'ct-1' }));

    const live = latestTransport();
    live.publication(message(3));
    live.publication(message(5));
    live.publication(message(4));
    live.publication(message(6, { direction: 'in' }));
    live.publication(message(8), 'proj-1:durable:exec-2');
    live.publication(message(9));
    expect(received).toEqual([1, 2, 3, 5, 9]);
    expect(transport.listDurableMessagesFromApplication).toHaveBeenCalledTimes(2);

    await result.data?.unsubscribe();
    live.publication(message(10));
    expect(received).toEqual([1, 2, 3, 5, 9]);
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    realtime.disconnect();
  });
}

function readsBackUnreadablePublications(): void {
  test.each([
    ['null', null],
    ['a seq alone', { seq: 2 }],
    ['an incomplete message', { direction: 'out', seq: 2, prev_seq: 1 }],
  ])('reads back a publication that does not read as a message: %s', async (_name, data) => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => listed(page([message(2)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    latestTransport().publication(data);
    await until(() => received.length === 2);

    expect(received).toEqual([1, 2]);
    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });
    realtime.disconnect();
  });

  test('leaves a publication that does not read as a message to the catch-up after resubscribing', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => listed(page([message(2)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    latestSubscription().move('subscribing');
    latestTransport().publication({ seq: 2 });
    latestSubscription().move('subscribed');
    await until(() => received.length === 2);

    expect(received).toEqual([1, 2]);
    expect(list).toHaveBeenCalledTimes(2);
    realtime.disconnect();
  });
}

function readsBackDuringTheCatchUp(): void {
  test('reads back publications that do not read as messages during a catch-up once', async () => {
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
    latestTransport().publication({ seq: 2 });
    latestTransport().publication({ seq: 3 });
    first.resolve({ data: page([message(1)]), status: 200 });
    await pending;
    await until(() => received.length === 3);

    expect(received).toEqual([1, 2, 3]);
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });
    realtime.disconnect();
  });
}

function holdsLiveMessagesDuringTheCatchUp(): void {
  test('holds live messages that arrive during the catch-up and delivers them after it', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => first.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(
      { functionName: 'checkout', executionId: 'exec-1' },
      (delivered) => received.push(delivered.seq),
      { realtime },
    );
    await until(() => list.mock.calls.length > 0);
    latestTransport().publication(message(4));
    latestTransport().publication(message(2));
    latestTransport().publication(message(3));
    expect(received).toEqual([]);
    first.resolve({ data: page([message(1), message(2)]), status: 200 });
    await pending;

    expect(received).toEqual([1, 2, 3, 4]);
    expect(latestSubscription().options).toStrictEqual({ joinLeave: false });
    realtime.disconnect();
  });
}

function catchesUpAgainAfterResubscribing(): void {
  test('catches up again after resubscribing, holding live messages until it has', async () => {
    const realtime = await connectedRealtime();
    const reread = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => reread.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];
    await volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });

    const subscription = latestSubscription();
    subscription.move('subscribing');
    latestTransport().publication(message(4));
    await settled();
    expect(received).toEqual([1]);
    expect(list).toHaveBeenCalledTimes(1);
    subscription.move('subscribed');
    latestTransport().publication(message(5));
    await until(() => list.mock.calls.length > 1);
    expect(list.mock.calls[1]?.[2]).toEqual({ direction: 'out', after: 1 });
    expect(received).toEqual([1]);
    reread.resolve({ data: page([message(2), message(3)]), status: 200 });
    await settled();

    expect(received).toEqual([1, 2, 3, 4, 5]);
    latestTransport().publication(message(6));
    expect(received).toEqual([1, 2, 3, 4, 5, 6]);
    expect(list).toHaveBeenCalledTimes(2);
    realtime.disconnect();
  });
}

function holdsMessagesBeforeSubscribing(): void {
  test('holds live messages that arrive before the channel is subscribed', async () => {
    const realtime = await connectedRealtime();
    const ready = signal();
    fakeRealtime.nextReady = ready.promise;
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => listed(page([message(1), message(2)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    await until(() => latestTransport().subscriptions.length > 0);
    latestTransport().publication(message(2));
    ready.resolve();
    await pending;

    expect(received).toEqual([1, 2]);
    realtime.disconnect();
  });
}

function listsThroughTheProject(): void {
  test('lists through the project when the target names one', async () => {
    const realtime = await connectedRealtime();
    const { volcano, transport } = clientWithTransport(
      { listDurableMessages: resolving(page([message(1)])) },
      { accessToken: 'owner-token' },
    );
    const received: number[] = [];

    await volcano.durable.messages.subscribe(
      { ...target, projectId: 'proj-1' },
      (delivered) => received.push(delivered.seq),
      { realtime },
    );

    expect(received).toEqual([1]);
    expect(transport.listDurableMessages.mock.calls[0]?.slice(0, 3)).toEqual(['proj-1', 'checkout', 'exec-1']);
    realtime.disconnect();
  });
}

describe('durable.messages.subscribe', () => {
  beforeEach(useRetryTimers);

  afterEach(resetFakeRealtime);

  catchesUpThenDeliversLive();
  readsBackUnreadablePublications();
  readsBackDuringTheCatchUp();
  holdsLiveMessagesDuringTheCatchUp();
  catchesUpAgainAfterResubscribing();
  holdsMessagesBeforeSubscribing();
  listsThroughTheProject();
});
