/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  bodyAt,
  EXECUTION_ARN,
  failureOf,
  mockDurableRuntime,
  noRetry,
  onlyCallbackCall,
  receive,
  requestAt,
  resetRuntimeDouble,
  restoreRuntimeDouble,
  run,
  sent,
  unreadable,
} from './support/durable-message-fixtures.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

const fetchMock = () => jest.mocked(globalThis.fetch);

beforeEach(resetRuntimeDouble);

afterEach(restoreRuntimeDouble);

function registersWaits(): void {
  it('registers the wait with Volcano and resolves with the message', async () => {
    const message = await receive(() => Promise.resolve(JSON.stringify(sent())));

    expect(message).toEqual({
      id: 'msg-1',
      name: 'address-confirmed',
      data: { address_id: 'addr_19' },
      sender: { type: 'user', userId: 'user-1' },
      sentAt: '2026-10-12T09:30:00Z',
    });
    const { name, config } = onlyCallbackCall();
    expect(name).toBe('address-confirmed');
    expect(Object.keys(config)).toEqual(['retryStrategy']);
    noRetry(config);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const { url, init } = requestAt(0);
    expect(url).toBe('https://api.test.com/durable-messages/waits');
    expect(init?.method).toBe('POST');
    // The callback id is what authorizes the route.
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'address-confirmed',
    });
  });

  it('passes the timeout to the callback', async () => {
    await run((_input, ctx) => ctx.waitForMessage('address-confirmed', { timeout: { hours: 2 } }));

    expect(onlyCallbackCall().config['timeout']).toEqual({ hours: 2 });
  });

  it('resolves null when the wait times out', async () => {
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(receive(() => Promise.reject(timeout))).resolves.toBeNull();
  });
}

function settlesRegistrations(): void {
  it('treats a closed wait as registered and resolves the callback outcome', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'wait is no longer open', code: 'callback_closed' }, { status: 409 }),
    );
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(receive(() => Promise.reject(timeout))).resolves.toBeNull();
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('retries until Volcano sees the callback waiting', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'not ready', code: 'callback_not_ready' }, { status: 409 }),
    );

    const pending = receive(() => Promise.resolve(sent()));
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(bodyAt(1)).toEqual(bodyAt(0));
  });

  it('settles the registration without reading what Volcano answered', async () => {
    fetchMock().mockResolvedValueOnce(unreadable(201));

    await expect(receive(() => Promise.resolve(sent()))).resolves.toMatchObject({ id: 'msg-1' });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
}

function releasesUnreadAnswers(): void {
  it('lets go of the answer it does not read', async () => {
    let cancelled = 0;
    const body = new ReadableStream({
      cancel() {
        cancelled += 1;
      },
    });
    fetchMock().mockResolvedValueOnce(new Response(body, { status: 201 }));

    await receive(() => Promise.resolve(sent()));

    expect(cancelled).toBe(1);
  });

  it('settles the registration when its answer cannot be let go of', async () => {
    const body = new ReadableStream({
      cancel() {
        throw new Error('connection already gone');
      },
    });
    fetchMock().mockResolvedValueOnce(new Response(body, { status: 201 }));

    await expect(receive(() => Promise.resolve(sent()))).resolves.toMatchObject({ id: 'msg-1' });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('settles a registration answered with no body', async () => {
    fetchMock().mockResolvedValueOnce(new Response(null, { status: 201 }));

    await expect(receive(() => Promise.resolve(sent()))).resolves.toMatchObject({ id: 'msg-1' });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });
}

function namesWaitFailures(): void {
  it('names the wait in a final refusal', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'too many open waits', code: 'too_many_message_waits' }, { status: 409 }),
    );

    await expect(failureOf(receive(() => Promise.resolve(sent())))).resolves.toMatchObject({
      status: 409,
      message: 'Volcano refused the message wait (409 too_many_message_waits): too many open waits',
    });
  });

  it('names the wait when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(receive(() => Promise.resolve(sent())));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to register the message wait: fetch failed',
    });
  });

  it.each([
    ['another callback failure', Object.assign(new Error('boom'), { errorType: 'CallbackError' })],
    ['a plain error', new Error('boom')],
    ['a thrown string', 'boom'],
  ])('rethrows %s', async (_case, failure) => {
    await expect(receive(() => rejectWithForeignValue(failure))).rejects.toBe(failure);
  });
}

describe('ctx.waitForMessage()', () => {
  registersWaits();
  settlesRegistrations();
  releasesUnreadAnswers();
  namesWaitFailures();
});
