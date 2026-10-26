/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  bodyAt,
  callbackCalls,
  callWith,
  childCalls,
  circular,
  EXECUTION_ARN,
  failureOf,
  mockDurableRuntime,
  noRetry,
  onlyCallbackCall,
  published,
  publishRequests,
  requestAt,
  resetRuntimeDouble,
  restoreRuntimeDouble,
  run,
  runtimeDouble,
  SESSION,
  SESSION_HASH,
  SESSION_TOKEN,
} from './support/durable-message-fixtures.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

const fetchMock = () => jest.mocked(globalThis.fetch);

beforeEach(resetRuntimeDouble);

afterEach(restoreRuntimeDouble);

function opensSessions(): void {
  it('opens a session, then publishes in a child context that carries its token and key', async () => {
    let result: unknown;
    await run(async (_input, ctx) => {
      result = await ctx.publish('progress', { percent: 50 });
    });

    expect(result).toStrictEqual({ id: 'msg-2', seq: 4 });
    const { name, config } = onlyCallbackCall();
    expect(name).toBe(SESSION);
    expect(Object.keys(config)).toEqual(['retryStrategy']);
    noRetry(config);
    expect(requestAt(0)).toEqual({
      url: 'https://api.test.com/durable-messages/sessions',
      init: expect.objectContaining({ headers: { 'Content-Type': 'application/json' } }),
    });
    expect(bodyAt(0)).toStrictEqual({ execution_ref: EXECUTION_ARN, callback_id: 'cb-1' });

    expect(childCalls).toEqual(['progress']);
    expect(requestAt(1)).toEqual({
      url: 'https://api.test.com/durable-messages/publish',
      init: expect.objectContaining({
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Volcano-Durable-Session': SESSION_TOKEN,
          'Idempotency-Key': `${SESSION_HASH}:1`,
        },
      }),
    });
    expect(bodyAt(1)).toStrictEqual({ name: 'progress', data: { percent: 50 } });
  });
}

function reusesSessions(): void {
  it('reuses the session and numbers each publish in the context', async () => {
    await run(async (_input, ctx) => {
      await ctx.publish('progress', 1);
      await Promise.all([ctx.publish('progress', 2), ctx.publish('done')]);
    });

    expect(onlyCallbackCall().name).toBe(SESSION);
    expect(publishRequests()).toEqual([
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': `${SESSION_HASH}:1` }),
        body: { name: 'progress', data: 1 },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': `${SESSION_HASH}:2` }),
        body: { name: 'progress', data: 2 },
      }),
      expect.objectContaining({
        headers: expect.objectContaining({ 'Idempotency-Key': `${SESSION_HASH}:3` }),
        body: { name: 'done', data: null },
      }),
    ]);
    expect(childCalls).toEqual(['progress', 'progress', 'done']);
  });

  it('opens one session for concurrent first publishes', async () => {
    await run(async (_input, ctx) => {
      await Promise.all([ctx.publish('a'), ctx.publish('b')]);
    });

    expect(onlyCallbackCall().name).toBe(SESSION);
    expect(publishRequests().map(({ body }) => body)).toEqual([
      { name: 'a', data: null },
      { name: 'b', data: null },
    ]);
  });
}

function nestsSessions(): void {
  it('gives each nested context its own session', async () => {
    runtimeDouble.sessionTokens = [SESSION_TOKEN, 'vdms_child'];

    await run(async (_input, ctx) => {
      await ctx.publish('root');
      await ctx.child('stage', (child) => child.publish('child'));
    });

    expect(callbackCalls.map((call) => call.name)).toEqual([SESSION, SESSION]);
    expect(publishRequests().map(({ headers }) => headers)).toEqual([
      expect.objectContaining({
        'X-Volcano-Durable-Session': SESSION_TOKEN,
        'Idempotency-Key': `${SESSION_HASH}:1`,
      }),
      expect.objectContaining({
        'X-Volcano-Durable-Session': 'vdms_child',
        'Idempotency-Key': 'db3f706c48bc5b4f102adfa6af7e6e537a584516b11460462993b47c342e5350:1',
      }),
    ]);
  });

  it('accepts a session token the runtime already parsed', async () => {
    runtimeDouble.callbackOutcome = () => Promise.resolve({ token: 'vdms_session' });

    await run((_input, ctx) => ctx.publish('progress'));

    expect(publishRequests()[0]?.headers).toMatchObject({
      'X-Volcano-Durable-Session': SESSION_TOKEN,
    });
  });

  it.each([200, 201])('resolves a %d answer', async (status) => {
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(published({ seq: 9 }), { status }));

    let result: unknown;
    await run(async (_input, ctx) => {
      result = await ctx.publish('progress');
    });
    expect(result).toEqual({ id: 'msg-2', seq: 9 });
  });
}

function sendsCheckedData(): void {
  it('sends the data it checked', async () => {
    let serialized = 0;
    const data = {
      toJSON() {
        serialized += 1;
        return serialized === 1 ? { percent: 50 } : 'x'.repeat(70_000);
      },
    };

    await run((_input, ctx) => ctx.publish('progress', data));

    expect(publishRequests()[0]?.body).toEqual({ name: 'progress', data: { percent: 50 } });
  });

  it.each([false, 0, '', null])('sends falsy data %p as it is', async (data) => {
    await run((_input, ctx) => ctx.publish('progress', data));

    expect(publishRequests()[0]?.body).toStrictEqual({ name: 'progress', data });
  });

  it('accepts data of exactly 64 KiB as JSON', async () => {
    // Two quotes around the string.
    await run((_input, ctx) => ctx.publish('progress', 'd'.repeat(64 * 1024 - 2)));

    expect(publishRequests()).toHaveLength(1);
  });

  it.each([
    ['one byte over', 'd'.repeat(64 * 1024 - 1)],
    ['over in UTF-8 but not in characters', 'é'.repeat(32 * 1024)],
  ])('refuses data %s 64 KiB', async (_case, data) => {
    await expect(run((_input, ctx) => ctx.publish('progress', data))).rejects.toThrow(
      new TypeError('ctx.publish() data must be at most 64 KiB as JSON'),
    );
    expect(callbackCalls).toHaveLength(0);
  });
}

function refusesInvalidData(): void {
  it.each([
    ['in a string', 'a\0b'],
    ['in a key', { ok: 1, 'a\0b': 2 }],
    ['nested in an array', { items: [1, ['ok', 'a\0b']] }],
  ])('refuses data holding a NUL %s before opening a session', async (_case, data) => {
    await expect(run((_input, ctx) => ctx.publish('progress', data))).rejects.toThrow(
      new TypeError('ctx.publish() data must not contain NUL characters'),
    );
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('accepts data that spells out an escaped NUL', async () => {
    await run((_input, ctx) => ctx.publish('progress', { note: '\\u0000' }));

    expect(publishRequests()[0]?.body).toEqual({ name: 'progress', data: { note: '\\u0000' } });
  });

  it.each([
    ['with a BigInt', { total: 10n }, 'BigInt'],
    ['that are circular', circular(), 'circular structure'],
  ])('refuses data %s, keeping the reason', async (_case, data, reason) => {
    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress', data)));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'ctx.publish() data must be serializable as JSON',
      cause: expect.objectContaining({ message: expect.stringContaining(reason) }),
    });
    expect(callbackCalls).toHaveLength(0);
  });

  it.each([
    ['an empty name', [''], 'ctx.publish() requires a non-empty name'],
    ['a non-string name', [null], 'ctx.publish() requires a non-empty name'],
    ['a long name', ['n'.repeat(238)], 'ctx.publish() name must be at most 237 characters'],
    ['a name outside ASCII', ['progrès'], 'ctx.publish() name must be printable ASCII'],
    ['data that serializes to nothing', ['ok', () => 1], 'ctx.publish() data must be serializable as JSON'],
    ['a symbol', ['ok', Symbol('data')], 'ctx.publish() data must be serializable as JSON'],
  ])('refuses %s before opening a session', async (_case, args, message) => {
    await expect(run(callWith((ctx) => Reflect.apply(ctx.publish.bind(ctx), undefined, args)))).rejects.toThrow(
      new TypeError(message),
    );
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });
}

describe('ctx.publish()', () => {
  opensSessions();
  reusesSessions();
  nestsSessions();
  sendsCheckedData();
  refusesInvalidData();
});
