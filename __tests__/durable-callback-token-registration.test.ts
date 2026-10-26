/** @jest-environment ./__tests__/node-environment.cjs */
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CallbackSubmitter } from '../src/durable-types.ts';
import {
  awaitPayment,
  bodyAt,
  callbackDouble,
  EXECUTION_ARN,
  failureOf,
  fetchMock,
  mockCallbackRuntime,
  noRetry,
  onlyCallbackCall,
  record,
  resetCallbackDouble,
  restoreCallbackDouble,
  run,
  type RuntimeSteps,
  submitted,
  timedOut,
  TOKEN,
} from './support/durable-callback-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockCallbackRuntime(), { virtual: true });

beforeEach(resetCallbackDouble);

afterEach(restoreCallbackDouble);

function registersTheCallback(): void {
  it('registers the callback, hands its token to the submitter, and resolves with the result', async () => {
    const result = await run(awaitPayment(record));

    expect(result).toEqual({ charge: 'ch_1042' });
    expect(submitted).toEqual([TOKEN]);
    const { name, config } = onlyCallbackCall();
    expect(name).toBe('payment');
    expect(Object.keys(config)).toEqual(['retryStrategy']);
    noRetry(config);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(fetchMock().mock.calls[0]?.[0]).toBe('https://api.test.com/durable-callbacks');
    expect(fetchMock().mock.calls[0]?.[1]?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'payment',
    });
  });

  it('passes the timeout and heartbeat timeout to the callback', async () => {
    await run(awaitPayment(record, { timeout: { hours: 2 }, heartbeatTimeout: { minutes: 5 } }));

    const { config } = onlyCallbackCall();
    expect(config['timeout']).toEqual({ hours: 2 });
    expect(config['heartbeatTimeout']).toEqual({ minutes: 5 });
  });

  it('resolves null when the callback times out', async () => {
    callbackDouble.outcome = () => Promise.reject(timedOut());

    await expect(run(awaitPayment(record))).resolves.toBeNull();
  });
}

function namesTheOperation(): void {
  // A submitter interrupted before its registration landed registers for the
  // first time on a replay, when its callback may be far back in the history.
  it('names the operation an earlier invocation opened the callback under', async () => {
    callbackDouble.steps = { next: '3', checkpointed: ['3-1'] };

    await run(awaitPayment(record));

    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'payment',
      operation_id: createHash('md5').update('3-1').digest('hex').slice(0, 16),
    });
  });

  it.each<[string, RuntimeSteps]>([
    ['this invocation opens the callback', { next: '3', checkpointed: ['2-1'] }],
    ['the runtime keeps no step cursor', { checkpointed: ['3-1'] }],
    ['the runtime keeps no checkpoint', { next: '3' }],
  ])('names no operation when %s', async (_case, steps) => {
    callbackDouble.steps = steps;

    await run(awaitPayment(record));

    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'payment',
    });
  });
}

function awaitsTheSubmitter(): void {
  it('awaits an asynchronous submitter before waiting', async () => {
    const order: string[] = [];
    callbackDouble.outcome = () => {
      order.push('waiting');
      return Promise.resolve('"done"');
    };

    await run(
      awaitPayment(async () => {
        await Promise.resolve();
        order.push('submitted');
      }),
    );

    expect(order).toEqual(['submitted', 'waiting']);
  });

  it('ignores what the submitter returns', async () => {
    const result = await run(
      awaitPayment(async (token) => {
        await Promise.resolve();
        return { queued: submitted.push(token) };
      }),
    );

    expect(result).toEqual({ charge: 'ch_1042' });
    expect(submitted).toEqual([TOKEN]);
  });
}

function withholdsTheTokenOnARefusal(): void {
  it('skips the submitter when the callback closed before it registered', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'callback is no longer open', code: 'callback_closed' }, { status: 409 }),
    );
    callbackDouble.outcome = () => Promise.reject(timedOut());
    const submitter = jest.fn<CallbackSubmitter>();

    await expect(run(awaitPayment(submitter))).resolves.toBeNull();

    expect(submitter).not.toHaveBeenCalled();
  });

  it('fails without calling the submitter when Volcano refuses the registration', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'callback is registered', code: 'callback_taken' }, { status: 409 }),
    );
    callbackDouble.outcome = () => Promise.resolve('"unreached"');
    const submitter = jest.fn<CallbackSubmitter>();

    const error = await failureOf(run(awaitPayment(submitter)));

    expect(error).toMatchObject({
      message: 'Volcano refused the callback (409 callback_taken): callback is registered',
    });
    expect(submitter).not.toHaveBeenCalled();
  });

  it.each([
    ['without a token', { expires_at: null }],
    ['with an empty token', { token: '', expires_at: null }],
    ['with a token that is not text', { token: 42, expires_at: null }],
    ['with a bare token instead of an object', `vcb_${'A'.repeat(43)}`],
  ])('fails when Volcano answers %s', async (_case, answer) => {
    fetchMock().mockResolvedValueOnce(Response.json(answer, { status: 201 }));
    const submitter = jest.fn<CallbackSubmitter>();

    await expect(failureOf(run(awaitPayment(submitter)))).resolves.toThrow(
      'Volcano registered the callback with a token this SDK cannot read',
    );
    expect(submitter).not.toHaveBeenCalled();
  });
}

function retriesTheRegistration(): void {
  it('retries until Volcano sees the callback waiting', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'not ready', code: 'callback_not_ready' }, { status: 409 }),
    );

    const pending = run(awaitPayment(record));
    await jest.advanceTimersByTimeAsync(500);

    await expect(pending).resolves.toEqual({ charge: 'ch_1042' });
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    expect(bodyAt(1)).toEqual(bodyAt(0));
    expect(submitted).toEqual([TOKEN]);
  });

  it('names the registration when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(run(awaitPayment(record)));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to register the callback: fetch failed',
    });
    expect(submitted).toEqual([]);
  });
}

describe('ctx.waitForCallback()', () => {
  registersTheCallback();
  namesTheOperation();
  awaitsTheSubmitter();
  withholdsTheTokenOnARefusal();
  retriesTheRegistration();
});
