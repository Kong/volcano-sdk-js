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
  latestTransport,
  listed,
  resetFakeRealtime,
  settled,
  until,
  useRetryTimers,
} from './support/durable-messages-realtime.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

type Handler = (delivered: DurableMessage) => unknown;

const deliveredSeqs = (handler: jest.Mock<Handler>): number[] => handler.mock.calls.map(([delivered]) => delivered.seq);

function reportsHandlersThatThrowDuringCatchUps(): void {
  test('reports a handler that throws during a later catch-up and delivers the rest of the page', async () => {
    const realtime = await connectedRealtime();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => listed(page([message(2), message(3), message(4)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const thrown = new Error('handler failed');
    // Deliveries arrive in seq order, so the second delivery is seq 2.
    const handler = jest
      .fn<Handler>()
      .mockImplementationOnce(jest.fn())
      .mockImplementationOnce(() => {
        throw thrown;
      });
    await volcano.durable.messages.subscribe(target, handler, { realtime });
    jest.useFakeTimers({ timerLimit: 100 });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestTransport().publication({ ...message(5), prev_seq: 4 });
    await jest.advanceTimersByTimeAsync(0);
    expect(deliveredSeqs(handler)).toEqual([1, 2, 3, 4, 5]);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(list).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('[Realtime] Error in durable message handler:', thrown);
    realtime.disconnect();
  });
}

function reportsHandlersThatThrowOnReleasedMessages(): void {
  test('reports a handler that throws on a released message and delivers the ones after it', async () => {
    const realtime = await connectedRealtime();
    const reread = deferred<{ data: unknown; status: number }>();
    const list = jest
      .fn<TransportOperation>()
      .mockImplementationOnce(() => listed(page([message(1)])))
      .mockImplementationOnce(() => reread.promise);
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const thrown = new Error('handler failed');
    // Deliveries arrive in seq order, so the third delivery is seq 3.
    const handler = jest
      .fn<Handler>()
      .mockImplementationOnce(jest.fn())
      .mockImplementationOnce(jest.fn())
      .mockImplementationOnce(() => {
        throw thrown;
      });
    await volcano.durable.messages.subscribe(target, handler, { realtime });
    jest.useFakeTimers({ timerLimit: 100 });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestTransport().publication({ ...message(3), prev_seq: 2 });
    latestTransport().publication({ ...message(4), prev_seq: 3 });
    reread.resolve({ data: page([message(2)]), status: 200 });
    await jest.advanceTimersByTimeAsync(0);
    expect(deliveredSeqs(handler)).toEqual([1, 2, 3, 4]);
    await jest.advanceTimersByTimeAsync(60_000);

    expect(list).toHaveBeenCalledTimes(2);
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('[Realtime] Error in durable message handler:', thrown);
    realtime.disconnect();
  });
}

function reportsHandlersThatThrowOnLiveMessages(): void {
  test('reports a handler that throws on a live message and delivers the next one', async () => {
    const realtime = await connectedRealtime();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => listed(page([])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const thrown = new Error('handler failed');
    const handler = jest.fn<Handler>().mockImplementationOnce(() => {
      throw thrown;
    });
    await volcano.durable.messages.subscribe(target, handler, { realtime });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestTransport().publication(message(1));
    latestTransport().publication(message(2));

    expect(deliveredSeqs(handler)).toEqual([1, 2]);
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('[Realtime] Error in durable message handler:', thrown);
    expect(list).toHaveBeenCalledTimes(1);
    realtime.disconnect();
  });
}

function reportsRejectingAsyncHandlers(): void {
  test('reports an async handler that rejects on a live message and delivers the next one', async () => {
    const realtime = await connectedRealtime();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => listed(page([])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const thrown = new Error('handler failed');
    const handler = jest.fn<Handler>(settled).mockImplementationOnce(async () => {
      await settled();
      throw thrown;
    });
    await volcano.durable.messages.subscribe(target, handler, { realtime });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestTransport().publication(message(1));
    latestTransport().publication(message(2));
    expect(deliveredSeqs(handler)).toEqual([1, 2]);
    await until(() => reported.mock.calls.length > 0);

    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('[Realtime] Error in durable message handler:', thrown);
    realtime.disconnect();
  });
}

function runsReturnedThenables(): void {
  test('runs a thenable a handler returns and reports its rejection', async () => {
    const realtime = await connectedRealtime();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => listed(page([])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const thrown = new Error('handler failed');
    const then = jest.fn((_resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      reject(thrown);
    });
    // oxlint-disable-next-line unicorn/no-thenable -- Delivery must adopt a handler's non-Promise thenable.
    const thenable = { then };
    await volcano.durable.messages.subscribe(target, () => thenable, { realtime });
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());

    latestTransport().publication(message(1));
    await until(() => reported.mock.calls.length > 0);

    expect(then).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('[Realtime] Error in durable message handler:', thrown);
    realtime.disconnect();
  });
}

function reportsRejectionsDuringTheFirstCatchUp(): void {
  test('reports an async handler that rejects while subscribe catches up, without ending it', async () => {
    const realtime = await connectedRealtime();
    const list = jest.fn<TransportOperation>().mockImplementationOnce(() => listed(page([message(1), message(2)])));
    const { volcano } = clientWithTransport({ listDurableMessagesFromApplication: list });
    const thrown = new Error('handler failed');
    const reported = jest.spyOn(console, 'error').mockImplementation(jest.fn<typeof console.error>());
    const handler = jest.fn<Handler>(settled).mockImplementationOnce(async () => {
      await settled();
      throw thrown;
    });

    const result = await volcano.durable.messages.subscribe(target, handler, { realtime });
    await until(() => reported.mock.calls.length > 0);

    expect(result.error).toBeNull();
    expect(deliveredSeqs(handler)).toEqual([1, 2]);
    expect(reported).toHaveBeenCalledTimes(1);
    expect(reported).toHaveBeenCalledWith('[Realtime] Error in durable message handler:', thrown);
    realtime.disconnect();
  });
}

describe('durable.messages.subscribe', () => {
  beforeEach(useRetryTimers);

  afterEach(resetFakeRealtime);

  reportsHandlersThatThrowDuringCatchUps();
  reportsHandlersThatThrowOnReleasedMessages();
  reportsHandlersThatThrowOnLiveMessages();
  reportsRejectingAsyncHandlers();
  runsReturnedThenables();
  reportsRejectionsDuringTheFirstCatchUp();
});
