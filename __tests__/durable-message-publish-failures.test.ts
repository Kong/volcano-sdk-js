/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  callbackCalls,
  failureOf,
  mockDurableRuntime,
  published,
  publishRequests,
  requestAt,
  resetRuntimeDouble,
  restoreRuntimeDouble,
  run,
  runtimeDouble,
  SESSION,
  unreadable,
} from './support/durable-message-fixtures.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

const fetchMock = () => jest.mocked(globalThis.fetch);

beforeEach(resetRuntimeDouble);

afterEach(restoreRuntimeDouble);

function refusesUnsupportedRuntimes(): void {
  it('explains that the platform URL is missing', async () => {
    Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');

    await expect(run((_input, ctx) => ctx.publish('progress'))).rejects.toThrow(
      'ctx.publish() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to publish messages.',
    );
  });

  it('refuses when the runtime did not report the execution', async () => {
    await expect(run((_input, ctx) => ctx.publish('progress'), {})).rejects.toThrow(
      'ctx.publish() cannot tell which execution is running: the durable runtime did not report it',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('refuses a runtime without callbacks', async () => {
    runtimeDouble.contextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCallback');
      return context;
    };

    await expect(run((_input, ctx) => ctx.publish('progress'))).rejects.toThrow(
      'The durable runtime does not support messages',
    );
  });
}

function refusesUnreadableSessions(): void {
  it.each([
    ['text that is not JSON', 'vdms_session'],
    ['no token', JSON.stringify({})],
    ['an empty token', JSON.stringify({ token: '' })],
    ['a numeric token', JSON.stringify({ token: 7 })],
    ['JSON null', 'null'],
  ])('refuses a session resumed with %s', async (_case, result) => {
    runtimeDouble.callbackOutcome = () => Promise.resolve(result);

    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress')));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'Volcano opened the messages session with a token this SDK cannot read',
    });
    expect(publishRequests()).toHaveLength(0);
  });

  it('keeps the parse error behind a session token that is not JSON', async () => {
    runtimeDouble.callbackOutcome = () => Promise.resolve('{');

    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress')));

    expect(failure instanceof Error ? failure.cause : undefined).toBeInstanceOf(SyntaxError);
  });

  it('names the session when Volcano refuses it', async () => {
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'execution has ended', code: 'execution_ended' }, { status: 409 }),
    );

    await expect(failureOf(run((_input, ctx) => ctx.publish('progress')))).resolves.toMatchObject({
      message: 'Volcano refused the messages session (409 execution_ended): execution has ended',
    });
  });
}

function retriesSessions(): void {
  it('treats a closed session callback as opened and uses the runtime outcome', async () => {
    fetchMock().mockResolvedValueOnce(Response.json({ error: 'closed', code: 'callback_closed' }, { status: 409 }));

    await run((_input, ctx) => ctx.publish('progress'));

    expect(publishRequests()).toHaveLength(1);
  });

  it('retries a session callback Volcano cannot see yet', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockResolvedValueOnce(
      Response.json({ error: 'not ready', code: 'callback_not_ready' }, { status: 409 }),
    );

    const pending = run((_input, ctx) => ctx.publish('progress'));
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    expect(requestAt(1).url).toBe('https://api.test.com/durable-messages/sessions');
    expect(publishRequests()).toHaveLength(1);
  });

  it('names the session when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock().mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(run((_input, ctx) => ctx.publish('progress')));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to open the messages session: fetch failed',
    });
  });
}

function failsRefusedPublishes(): void {
  it.each([
    [401, { error: 'invalid durable session' }, 'Volcano refused the message (401): invalid durable session'],
    [
      409,
      { error: 'execution is not running', code: 'execution_not_running' },
      'Volcano refused the message (409 execution_not_running): execution is not running',
    ],
    [
      409,
      { error: 'too many messages', code: 'too_many_published_messages' },
      'Volcano refused the message (409 too_many_published_messages): too many messages',
    ],
    // Publishing has no callback, so no conflict is worth retrying.
    [409, { error: 'conflict' }, 'Volcano refused the message (409): conflict'],
    [
      409,
      { error: 'not ready', code: 'callback_not_ready' },
      'Volcano refused the message (409 callback_not_ready): not ready',
    ],
  ])('fails the publish at once on a %d refusal', async (status, body, message) => {
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(body, { status }));

    await expect(failureOf(run((_input, ctx) => ctx.publish('progress')))).resolves.toMatchObject({
      status,
      message,
    });
    expect(publishRequests()).toHaveLength(1);
  });
}

function retriesPublishes(): void {
  it('retries a publish Volcano could not answer, with the same key', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json({ error: 'unavailable' }, { status: 503 }));

    const pending = run((_input, ctx) => ctx.publish('progress'));
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    const [first, second] = publishRequests();
    expect(second).toEqual(first);
  });

  it('retries a publish whose answer cannot be read, with the same key', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(unreadable(201));

    let result: unknown;
    const pending = run(async (_input, ctx) => {
      result = await ctx.publish('progress');
    });
    await jest.advanceTimersByTimeAsync(500);
    await pending;

    const [first, second] = publishRequests();
    expect(second).toEqual(first);
    expect(result).toEqual({ id: 'msg-2', seq: 4 });
  });

  it('names the message when its answer cannot be read', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockImplementation(() => Promise.resolve(unreadable(201)));

    const failure = failureOf(run((_input, ctx) => ctx.publish('progress')));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to publish the message: The operation timed out',
    });
  });
}

function failsAfterSessionFailures(): void {
  it('fails every later publish in the context once the session failed to open', async () => {
    fetchMock().mockResolvedValueOnce(Response.json({ error: 'malformed request' }, { status: 400 }));

    await run(async (_input, ctx) => {
      await expect(ctx.publish('first')).rejects.toThrow(
        'Volcano refused the messages session (400): malformed request',
      );
      await expect(ctx.publish('second')).rejects.toThrow(
        'Volcano refused the messages session (400): malformed request',
      );
    });

    expect(callbackCalls.map((call) => call.name)).toEqual([SESSION]);
    expect(publishRequests()).toEqual([]);
  });

  it('names the message when Volcano cannot be reached', async () => {
    jest.useFakeTimers({ timerLimit: 100 });
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockRejectedValue(new TypeError('fetch failed'));

    const failure = failureOf(run((_input, ctx) => ctx.publish('progress')));
    await jest.advanceTimersByTimeAsync(30_000);

    expect(await failure).toMatchObject({
      message: 'Could not reach Volcano to publish the message: fetch failed',
    });
  });
}

function refusesUnreadableAnswers(): void {
  it.each([
    ['no body', null],
    ['no id', published({ id: undefined })],
    ['a numeric id', published({ id: 2 })],
    ['no seq', published({ seq: undefined })],
    ['a textual seq', published({ seq: '4' })],
  ])('refuses an answer with %s', async (_case, body) => {
    fetchMock()
      .mockResolvedValueOnce(Response.json({ id: 'ses-1' }, { status: 201 }))
      .mockResolvedValueOnce(Response.json(body, { status: 201 }));

    const failure = await failureOf(run((_input, ctx) => ctx.publish('progress')));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'Volcano answered the publish with a message this SDK cannot read',
    });
  });
}

describe('ctx.publish()', () => {
  refusesUnsupportedRuntimes();
  refusesUnreadableSessions();
  retriesSessions();
  failsRefusedPublishes();
  retriesPublishes();
  failsAfterSessionFailures();
  refusesUnreadableAnswers();
});
