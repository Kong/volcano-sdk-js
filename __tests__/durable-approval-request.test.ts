/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { expectInstanceOf } from './support/assertions.ts';
import {
  bodyAt,
  callbackCalls,
  EXECUTION_ARN,
  fetchMock,
  mockApprovalRuntime,
  onlyCallbackCall,
  requestAt,
  resetApprovalDouble,
  restoreApprovalDouble,
  run,
  shipping,
} from './support/durable-approval-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockApprovalRuntime(), { virtual: true });

beforeEach(resetApprovalDouble);

afterEach(restoreApprovalDouble);

function registersTheApproval(): void {
  it('registers the approval with Volcano and resolves with the decision', async () => {
    let decision: unknown;
    await run(async (_input, ctx) => {
      decision = await ctx.waitForApproval('ship-order', {
        title: 'Ship order 42?',
        description: 'Over the auto-ship limit',
        details: { order_id: 42, total: 1250 },
      });
    });

    expect(decision).toEqual({
      approved: true,
      status: 'approved',
      comment: 'Address checked',
      decidedBy: { id: 'user-1', email: 'owner@example.com' },
      decidedAt: '2026-10-06T12:05:00Z',
    });
    expect(onlyCallbackCall().name).toBe('ship-order');
    expect(fetchMock()).toHaveBeenCalledTimes(1);
    const { url, init } = requestAt(0);
    expect(url).toBe('https://api.test.com/durable-approvals');
    expect(init?.method).toBe('POST');
    // The route takes no credential: the callback id is what authorizes it.
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(bodyAt(0)).toEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'ship-order',
      title: 'Ship order 42?',
      description: 'Over the auto-ship limit',
      details: { order_id: 42, total: 1250 },
    });
  });

  it('leaves out what the caller did not set', async () => {
    await run(shipping);

    expect(bodyAt(0)).toStrictEqual({
      execution_ref: EXECUTION_ARN,
      callback_id: 'cb-1',
      name: 'ship-order',
      title: 'Ship order 42?',
    });
    const { config } = onlyCallbackCall();
    expect(Object.keys(config)).toEqual(['retryStrategy']);
  });
}

function forwardsTheOptions(): void {
  it('keeps a null details value and an empty description', async () => {
    await run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', description: '', details: null }));

    expect(bodyAt(0)).toMatchObject({ description: '', details: null });
  });

  it('passes the timeout to the callback and leaves retries to the registration', async () => {
    await run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', timeout: { hours: 48 } }));

    const { config } = onlyCallbackCall();
    expect(config['timeout']).toEqual({ hours: 48 });
    const retryStrategy = config['retryStrategy'];
    expectInstanceOf(retryStrategy, Function);
    expect(Reflect.apply(retryStrategy, undefined, [new Error('refused'), 1])).toEqual({
      shouldRetry: false,
    });
  });

  it('refuses a timeout outside the execution lifetime', async () => {
    await expect(
      run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', timeout: '367d' })),
    ).rejects.toThrow('timeout must be at most 31622400 seconds (366 days)');
    expect(callbackCalls).toHaveLength(0);
  });

  it('accepts the longest name, title, and description the platform stores', async () => {
    await run((_input, ctx) =>
      ctx.waitForApproval(`${' ~'.repeat(118)}n`, {
        title: 't'.repeat(200),
        description: 'd'.repeat(4000),
      }),
    );

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    expect(bodyAt(0)).toMatchObject({ name: `${' ~'.repeat(118)}n` });
  });
}

function measuresTheRequest(): void {
  // Volcano counts code points; each of these emoji is two UTF-16 units.
  it('counts lengths in characters rather than UTF-16 units', async () => {
    await run((_input, ctx) =>
      ctx.waitForApproval('ship-order', {
        title: '👍'.repeat(200),
        description: '📦'.repeat(4000),
      }),
    );

    expect(fetchMock()).toHaveBeenCalledTimes(1);
    await expect(run((_input, ctx) => ctx.waitForApproval('ship', { title: '👍'.repeat(201) }))).rejects.toThrow(
      'ctx.waitForApproval() title must be at most 200 characters',
    );
  });

  it('accepts a request of exactly 64 KiB, allowing for the longest callback id', async () => {
    const fields = { name: 'ship-order', title: 'Ship?' };
    const empty = JSON.stringify({
      execution_ref: EXECUTION_ARN,
      callback_id: 'x'.repeat(1024),
      ...fields,
      details: '',
    });
    const room = 64 * 1024 - empty.length;

    await run((_input, ctx) => ctx.waitForApproval(fields.name, { title: fields.title, details: 'd'.repeat(room) }));
    expect(fetchMock()).toHaveBeenCalledTimes(1);

    await expect(
      run((_input, ctx) => ctx.waitForApproval(fields.name, { title: fields.title, details: 'd'.repeat(room + 1) })),
    ).rejects.toThrow('ctx.waitForApproval() request must be at most 64 KiB, details included');
    // Two bytes each in UTF-8, so half as many fit.
    await expect(
      run((_input, ctx) => ctx.waitForApproval(fields.name, { title: fields.title, details: 'é'.repeat(room) })),
    ).rejects.toThrow('ctx.waitForApproval() request must be at most 64 KiB, details included');
    expect(callbackCalls).toHaveLength(1);
  });
}

function sendsTheDetails(): void {
  it('sends the details it checked', async () => {
    const details = {
      toJSON: jest.fn<() => unknown>().mockReturnValueOnce({ total: 1250 }).mockReturnValue('x'.repeat(70_000)),
    };

    await run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', details }));

    expect(bodyAt(0)).toMatchObject({ details: { total: 1250 } });
  });

  it('sends details that only spell out an escaped NUL', async () => {
    const details = { note: String.raw`\u0000`, items: [1, null, true], nested: { ok: 'yes' } };

    await run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', details }));

    expect(bodyAt(0)).toMatchObject({ details });
  });
}

describe('ctx.waitForApproval()', () => {
  registersTheApproval();
  forwardsTheOptions();
  measuresTheRequest();
  sendsTheDetails();
});
