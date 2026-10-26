/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  bodyAt,
  callbackCalls,
  callWith,
  EXECUTION_ARN,
  failureOf,
  mockDurableRuntime,
  receive,
  resetRuntimeDouble,
  restoreRuntimeDouble,
  run,
  runtimeDouble,
  sent,
  waitForAddress,
  waiting,
} from './support/durable-message-fixtures.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockDurableRuntime(), { virtual: true });

const fetchMock = () => jest.mocked(globalThis.fetch);

beforeEach(resetRuntimeDouble);

afterEach(restoreRuntimeDouble);

function readsMessages(): void {
  it('accepts a message the runtime already parsed', async () => {
    await expect(receive(() => Promise.resolve(sent({ data: [1, 2] })))).resolves.toMatchObject({
      data: [1, 2],
    });
  });

  it.each([
    ['left out', {}],
    ['sent as null', { data: null }],
  ])('resolves null data when it is %s', async (_case, overrides) => {
    const message = sent(overrides);
    if (!('data' in overrides)) {
      Reflect.deleteProperty(message, 'data');
    }

    await expect(receive(() => Promise.resolve(message))).resolves.toMatchObject({ data: null });
  });

  it.each([false, 0, ''])('keeps falsy data %p', async (data) => {
    await expect(receive(() => Promise.resolve(sent({ data })))).resolves.toMatchObject({ data });
  });

  it.each([
    ['null', { type: 'anon', user_id: null }, { type: 'anon', userId: null }],
    ['absent', { type: 'service_key' }, { type: 'service_key', userId: null }],
    ['not text', { type: 'user', user_id: 7 }, { type: 'user', userId: null }],
  ])('reports no sender user when the id is %s', async (_case, sender, expected) => {
    await expect(receive(() => Promise.resolve(sent({ sender })))).resolves.toMatchObject({
      sender: expected,
    });
  });
}

function refusesUnreadableMessages(): void {
  it('keeps the parse error behind a message that is not JSON', async () => {
    const failure = await failureOf(receive(() => Promise.resolve('address-confirmed')));

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure instanceof Error ? failure.cause : undefined).toBeInstanceOf(SyntaxError);
  });

  it.each([
    ['text that is not JSON', 'confirmed'],
    ['a JSON scalar', '42'],
    ['JSON null', 'null'],
    ['nothing', undefined],
    ['no sender', JSON.stringify(sent({ sender: undefined }))],
    ['a sender that is text', JSON.stringify(sent({ sender: 'user' }))],
    ['a sender without a type', JSON.stringify(sent({ sender: { user_id: 'user-1' } }))],
    ['no id', JSON.stringify(sent({ id: undefined }))],
    ['a numeric id', JSON.stringify(sent({ id: 1 }))],
    ['no name', JSON.stringify(sent({ name: undefined }))],
    ['no send time', JSON.stringify(sent({ sent_at: undefined }))],
  ])('refuses %s', async (_case, result) => {
    const failure = receive(() => Promise.resolve(result));
    await expect(failure).rejects.toBeInstanceOf(TypeError);
    await expect(failure).rejects.toThrow('Volcano resumed the message wait with a message this SDK cannot read');
  });
}

function refusesInvalidArguments(): void {
  it.each([
    ['an empty name', [''], 'ctx.waitForMessage() requires a non-empty name'],
    ['a blank name', [' \t'], 'ctx.waitForMessage() requires a non-empty name'],
    ['a non-string name', [42], 'ctx.waitForMessage() requires a non-empty name'],
    ['a long name', ['n'.repeat(238)], 'ctx.waitForMessage() name must be at most 237 characters'],
    ['a name outside ASCII', ['dirección'], 'ctx.waitForMessage() name must be printable ASCII'],
    ['a name with a tab', ['a\tb'], 'ctx.waitForMessage() name must be printable ASCII'],
    ['a name with DEL', ['a\u007F'], 'ctx.waitForMessage() name must be printable ASCII'],
    ['null options', ['ok', null], 'ctx.waitForMessage() options must be an object'],
    ['text options', ['ok', '1h'], 'ctx.waitForMessage() options must be an object'],
    [
      'a timeout outside the execution lifetime',
      ['ok', { timeout: '367d' }],
      'timeout must be at most 31622400 seconds (366 days)',
    ],
  ])('refuses %s before registering anything', async (_case, args, message) => {
    await expect(run(callWith((ctx) => Reflect.apply(ctx.waitForMessage.bind(ctx), undefined, args)))).rejects.toThrow(
      message,
    );
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('accepts the longest name the platform stores', async () => {
    const name = `${' ~'.repeat(118)}n`;

    await run((_input, ctx) => ctx.waitForMessage(name));

    expect(bodyAt(0)).toMatchObject({ name });
  });
}

function refusesUnsupportedRuntimes(): void {
  it('explains that the platform URL is missing', async () => {
    process.env['VOLCANO_PLATFORM_API_URL'] = ' ';

    await expect(run(waiting)).rejects.toThrow(
      'ctx.waitForMessage() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to wait for messages.',
    );
  });

  it('refuses when the runtime did not report the execution', async () => {
    await expect(run(waiting, {})).rejects.toThrow(
      'ctx.waitForMessage() cannot tell which execution is running: the durable runtime did not report it',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('refuses a runtime without callbacks', async () => {
    runtimeDouble.contextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCallback');
      return context;
    };

    await expect(run(waiting)).rejects.toThrow(
      new TypeError(
        'The durable runtime does not support messages; redeploy the function so Volcano installs a current one',
      ),
    );
  });

  it('gives every nested context the root execution ref', async () => {
    await run(async (_input, ctx) => {
      await ctx.child('review', (child) => waitForAddress(child));
      await ctx.map('orders', [1], (_item, item) => waitForAddress(item));
      await ctx.parallel([(branch) => waitForAddress(branch)]);
    });

    expect(fetchMock()).toHaveBeenCalledTimes(3);
    for (let index = 0; index < 3; index += 1) {
      expect(bodyAt(index)).toMatchObject({ execution_ref: EXECUTION_ARN });
    }
  });
}

describe('ctx.waitForMessage()', () => {
  readsMessages();
  refusesUnreadableMessages();
  refusesInvalidArguments();
  refusesUnsupportedRuntimes();
});
