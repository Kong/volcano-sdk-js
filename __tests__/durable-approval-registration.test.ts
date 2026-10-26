/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  bodyAt,
  decide,
  failureOf,
  fetchMock,
  mockApprovalRuntime,
  registered,
  requestAt,
  resetApprovalDouble,
  respond,
  restoreApprovalDouble,
} from './support/durable-approval-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockApprovalRuntime(), { virtual: true });

beforeEach(resetApprovalDouble);

afterEach(restoreApprovalDouble);

function registers(): void {
  it.each([200, 201])('treats %d as registered', async (status) => {
    fetchMock().mockResolvedValueOnce(respond(status));

    await registered();

    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('bounds each attempt with a request timeout', async () => {
    const timeout = jest.spyOn(AbortSignal, 'timeout');

    await registered();

    expect(timeout).toHaveBeenCalledWith(10_000);
    expect(requestAt(0).init?.signal).toBe(timeout.mock.results[0]?.value);
  });

  it('retries until the approval is ready, backing off from half a second', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    const notReady = { error: 'execution is not ready', code: 'approval_not_ready' };
    fetchMock()
      .mockResolvedValueOnce(respond(409, notReady))
      .mockResolvedValueOnce(respond(409, notReady))
      .mockResolvedValueOnce(respond(201));

    const pending = registered();
    await jest.advanceTimersByTimeAsync(499);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(999);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(1);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(3);
    expect(bodyAt(2)).toEqual(bodyAt(0));
  });
}

function retriesWhileUnavailable(): void {
  it.each([
    [
      'yet to record the execution',
      () => Promise.resolve(respond(404, { error: 'no running durable execution matches execution_ref' })),
    ],
    ['throttled', () => Promise.resolve(respond(429, { error: 'slow down' }))],
    ['failing', () => Promise.resolve(respond(500, { error: 'internal error' }))],
    ['unavailable', () => Promise.resolve(respond(503, { error: 'unavailable' }))],
    ['unreachable', () => Promise.reject(new TypeError('fetch failed'))],
  ])('retries while Volcano is %s', async (_case, failure) => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockImplementationOnce(failure).mockResolvedValueOnce(respond(201));

    const pending = registered();
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it('succeeds on the last attempt the budget allows', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    for (let attempt = 0; attempt < 8; attempt += 1) {
      fetchMock().mockResolvedValueOnce(respond(503, { error: 'unavailable' }));
    }
    fetchMock().mockResolvedValueOnce(respond(201));

    const pending = registered();
    await jest.advanceTimersByTimeAsync(27_500);
    await pending;

    expect(fetchMock()).toHaveBeenCalledTimes(9);
  });
}

function handlesRefusals(): void {
  it('treats a closed approval as registered and resolves the callback outcome', async () => {
    fetchMock().mockResolvedValueOnce(
      respond(409, { error: 'approval request is no longer open', code: 'approval_closed' }),
    );
    const timeout = Object.assign(new Error('Callback timed out'), {
      errorType: 'CallbackTimeoutError',
    });

    await expect(decide(() => Promise.reject(timeout))).resolves.toEqual({
      approved: false,
      status: 'expired',
      comment: '',
      decidedBy: null,
      decidedAt: null,
    });
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it.each([
    [400, { error: 'title is required' }, undefined],
    [409, { error: 'execution has ended', code: 'execution_ended' }, 'execution_ended'],
    [409, { error: 'too many pending approvals', code: 'too_many_pending_approvals' }, 'too_many_pending_approvals'],
    // Only a conflict means "not yet" or "closed"; the same code on another
    // status is final.
    [400, { error: 'not ready', code: 'approval_not_ready' }, 'approval_not_ready'],
    [400, { error: 'closed', code: 'approval_closed' }, 'approval_closed'],
    [413, { error: 'request too large' }, undefined],
  ])('fails at once on a %d refusal', async (status, body, code) => {
    fetchMock().mockResolvedValueOnce(respond(status, body));

    const failure = await failureOf(registered());

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({
      status,
      message: `Volcano refused the approval request (${[status, code].filter(Boolean).join(' ')}): ${body.error}`,
    });
    expect(failure instanceof Error ? Reflect.get(failure, 'code') : 'not an error').toBe(code);
    expect(fetchMock()).toHaveBeenCalledTimes(1);
  });

  it('describes a refusal with no readable body', async () => {
    fetchMock().mockResolvedValueOnce(new Response('<html>', { status: 400 }));

    await expect(registered()).rejects.toThrow('Volcano refused the approval request (400): Request failed');
  });
}

describe('approval registration', () => {
  registers();
  retriesWhileUnavailable();
  handlesRefusals();
});
