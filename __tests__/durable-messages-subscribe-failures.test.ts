/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { deferred, signal } from './auth-concurrency-fixtures.ts';
import {
  message,
  mockClientFactory,
  page,
  refused,
  resolving,
  target,
  type TransportOperation,
} from './support/durable-messages-fixtures.ts';
import {
  connectedRealtime,
  fakeRealtime,
  latestTransport,
  resetFakeRealtime,
  until,
  useRetryTimers,
} from './support/durable-messages-realtime.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function refusesASecondSubscription(): void {
  test('refuses a second subscription to the same execution until the first ends', async () => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport();
    const first = await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });

    await expect(volcano.durable.messages.subscribe(target, jest.fn(), { realtime })).resolves.toEqual(
      refused('This realtime client already subscribes to the execution; unsubscribe first'),
    );
    await first.data?.unsubscribe();
    await first.data?.unsubscribe();
    await expect(volcano.durable.messages.subscribe(target, jest.fn(), { realtime })).resolves.toMatchObject({
      error: null,
    });
    realtime.disconnect();
  });
}

function endsOnAFailedFirstCatchUp(): void {
  test('ends the subscription and reports the failure when the first catch-up fails', async () => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: jest
        .fn<TransportOperation>()
        .mockRejectedValue(Object.assign(new Error('forbidden'), { status: 403 })),
    });

    await expect(volcano.durable.messages.subscribe(target, jest.fn(), { realtime })).resolves.toEqual({
      data: null,
      status: 403,
      error: new Error('forbidden'),
    });
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    realtime.disconnect();
  });

  test.each<[string, unknown]>([
    ['an error', new Error('handler failed')],
    ['a value that is not an error', 'handler failed'],
  ])('ends the subscription when the handler throws %s during the catch-up', async (_case, thrown) => {
    const realtime = await connectedRealtime();
    const { volcano } = clientWithTransport({
      listDurableMessagesFromApplication: resolving(page([message(1)])),
    });

    await expect(
      volcano.durable.messages.subscribe(
        target,
        () => {
          throw thrown;
        },
        { realtime },
      ),
    ).resolves.toEqual({ data: null, status: null, error: new Error('handler failed') });
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    realtime.disconnect();
  });
}

function dropsHeldMessagesWhenTheHandlerThrows(): void {
  test('delivers nothing it held once the handler throws during the first catch-up', async () => {
    const realtime = await connectedRealtime();
    const first = deferred<{ data: unknown; status: number }>();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => first.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(
      target,
      (delivered) => {
        received.push(delivered.seq);
        throw new Error('handler failed');
      },
      { realtime },
    );
    await until(() => list.mock.calls.length > 0);
    latestTransport().publication({ ...message(2), prev_seq: 1 });
    first.resolve({ data: page([message(1)]), status: 200 });

    await expect(pending).resolves.toEqual(refused('handler failed'));
    expect(received).toEqual([1]);
    realtime.disconnect();
  });
}

function dropsHeldMessagesWhenTheCatchUpFails(): void {
  test('delivers nothing it held once the first catch-up fails to read', async () => {
    const realtime = await connectedRealtime();
    const answer = signal();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(async () => {
      await answer.promise;
      throw Object.assign(new Error('forbidden'), { status: 403 });
    });
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const received: number[] = [];

    const pending = volcano.durable.messages.subscribe(target, (delivered) => received.push(delivered.seq), {
      realtime,
    });
    await until(() => list.mock.calls.length > 0);
    latestTransport().publication({ ...message(1), prev_seq: 0 });
    answer.resolve();

    await expect(pending).resolves.toEqual({
      data: null,
      status: 403,
      error: new Error('forbidden'),
    });
    expect(received).toEqual([]);
    realtime.disconnect();
  });
}

function endsWhenSubscribingFails(): void {
  const refusal = { code: 103, message: 'permission denied' };
  test.each([
    ['an error', new Error('Subscription refused'), new Error('Subscription refused')],
    ['a value that is not an error', 'permission denied', new Error('permission denied')],
    ["the realtime server's refusal", refusal, new Error('permission denied', { cause: refusal })],
    ['an object without a message', { code: 3 }, new Error('[object Object]')],
    ['null', null, new Error('null')],
  ])('ends the subscription when subscribing fails with %s', async (_case, failure, error) => {
    fakeRealtime.nextReady = rejectWithForeignValue(failure);
    const realtime = await connectedRealtime();
    const { volcano, transport } = clientWithTransport();

    const result = await volcano.durable.messages.subscribe(target, jest.fn(), { realtime });

    expect(result).toEqual({ data: null, status: null, error });
    expect(result.error?.cause).toBe(error.cause);
    expect(realtime._channels.has('durable:exec-1')).toBe(false);
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
    realtime.disconnect();
  });
}

function endsWhenTheChannelIsDiscarded(): void {
  // The channel can be discarded after it is ready but before subscribe()
  // returns to the subscription, which then must not catch up.
  test('ends the subscription when its channel is discarded while it subscribes', async () => {
    class DiscardedWhileSubscribing {
      _onSubscriptionState: ((state: string) => void) | null = null;
      readonly on = jest.fn();

      subscribe(): Promise<void> {
        this._onSubscriptionState?.('unsubscribed');
        return Promise.resolve();
      }
    }
    const channel = new DiscardedWhileSubscribing();
    const removeDurableChannel = jest.fn();
    const realtime = {
      _durableChannel: () => channel,
      _removeDurableChannel: removeDurableChannel,
    };
    const { volcano, transport } = clientWithTransport();
    const { messages } = volcano.durable;
    const handler = jest.fn();

    const result: unknown = Reflect.apply(messages.subscribe.bind(messages), undefined, [
      target,
      handler,
      { realtime },
    ]);

    await expect(result).resolves.toEqual(refused('The durable message subscription has ended'));
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
    expect(handler).not.toHaveBeenCalled();
    expect(removeDurableChannel).toHaveBeenCalledTimes(1);
    expect(removeDurableChannel).toHaveBeenCalledWith(channel);
  });
}

function refusesInvalidArguments(): void {
  test.each([
    ['an invalid target', [{ functionName: 'checkout' }, jest.fn(), {}], 'executionId must be a non-empty string'],
    ['no handler', [target, 'handler', {}], 'subscribe requires a handler function'],
    ['no options', [target, jest.fn()], 'subscribe requires options.realtime, a connected VolcanoRealtime'],
    [
      'a realtime without durable channels',
      [target, jest.fn(), { realtime: { _durableChannel: () => null } }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a realtime that cannot open durable channels',
      [target, jest.fn(), { realtime: { _removeDurableChannel: jest.fn() } }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a null realtime',
      [target, jest.fn(), { realtime: null }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
    [
      'a realtime that is not an object',
      [target, jest.fn(), { realtime: 'wss://realtime' }],
      'subscribe requires options.realtime, a connected VolcanoRealtime',
    ],
  ])('refuses %s', async (_case, args, error) => {
    const { volcano, transport } = clientWithTransport();
    const { messages } = volcano.durable;

    const result: unknown = Reflect.apply(messages.subscribe.bind(messages), undefined, args);

    await expect(result).resolves.toEqual(refused(error));
    expect(transport.listDurableMessagesFromApplication).not.toHaveBeenCalled();
  });
}

describe('durable.messages.subscribe', () => {
  beforeEach(useRetryTimers);

  afterEach(resetFakeRealtime);

  refusesASecondSubscription();
  endsOnAFailedFirstCatchUp();
  dropsHeldMessagesWhenTheHandlerThrows();
  dropsHeldMessagesWhenTheCatchUpFails();
  endsWhenSubscribingFails();
  endsWhenTheChannelIsDiscarded();
  refusesInvalidArguments();
});
