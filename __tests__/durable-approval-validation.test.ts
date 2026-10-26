/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { durable } from '../src/durable.ts';
import { expectInstanceOf } from './support/assertions.ts';
import {
  approvalDouble,
  askToShip,
  bodyAt,
  callbackCalls,
  circular,
  EXECUTION_ARN,
  failureOf,
  fetchMock,
  mockApprovalRuntime,
  requestAt,
  resetApprovalDouble,
  restoreApprovalDouble,
  run,
  shipping,
} from './support/durable-approval-double.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockApprovalRuntime(), { virtual: true });

beforeEach(resetApprovalDouble);

afterEach(restoreApprovalDouble);

const invalidArguments: [string, unknown, unknown, string][] = [
  ['an empty name', '', { title: 'Ship?' }, 'ctx.waitForApproval() requires a non-empty name'],
  ['a blank name', '  ', { title: 'Ship?' }, 'ctx.waitForApproval() requires a non-empty name'],
  ['a non-string name', 42, { title: 'Ship?' }, 'ctx.waitForApproval() requires a non-empty name'],
  ['a long name', 'n'.repeat(238), { title: 'Ship?' }, 'ctx.waitForApproval() name must be at most 237 characters'],
  [
    'a name outside ASCII',
    'aprobación-envío',
    { title: 'Ship?' },
    'ctx.waitForApproval() name must be printable ASCII',
  ],
  [
    'a name with a control character',
    'ship\torder',
    { title: 'Ship?' },
    'ctx.waitForApproval() name must be printable ASCII',
  ],
  ['a name with DEL', 'ship\u007F', { title: 'Ship?' }, 'ctx.waitForApproval() name must be printable ASCII'],
  ['a name with NUL', 'ship\0', { title: 'Ship?' }, 'ctx.waitForApproval() name must not contain NUL characters'],
  ['a title with NUL', 'ship', { title: 'Ship\0?' }, 'ctx.waitForApproval() title must not contain NUL characters'],
  [
    'a description with NUL',
    'ship',
    { title: 'Ship?', description: 'Express\0' },
    'ctx.waitForApproval() description must not contain NUL characters',
  ],
  [
    'details with NUL in a string',
    'ship',
    { title: 'Ship?', details: { items: ['a', 'b\0'] } },
    'ctx.waitForApproval() details must not contain NUL characters',
  ],
  [
    'details with NUL in a key',
    'ship',
    { title: 'Ship?', details: { order: { 'a\0': 1 } } },
    'ctx.waitForApproval() details must not contain NUL characters',
  ],
  [
    'details that are a string with NUL',
    'ship',
    { title: 'Ship?', details: '\0' },
    'ctx.waitForApproval() details must not contain NUL characters',
  ],
  ['no options', 'ship', undefined, 'ctx.waitForApproval() requires options with a title'],
  ['null options', 'ship', null, 'ctx.waitForApproval() requires options with a title'],
  ['no title', 'ship', {}, 'ctx.waitForApproval() requires a non-empty title'],
  ['a blank title', 'ship', { title: ' \t\n' }, 'ctx.waitForApproval() requires a non-empty title'],
  ['a long title', 'ship', { title: 't'.repeat(201) }, 'ctx.waitForApproval() title must be at most 200 characters'],
  [
    'a non-string description',
    'ship',
    { title: 'Ship?', description: 7 },
    'ctx.waitForApproval() description must be a string',
  ],
  [
    'a long description',
    'ship',
    { title: 'Ship?', description: 'd'.repeat(4001) },
    'ctx.waitForApproval() description must be at most 4000 characters',
  ],
  [
    'details that serialize to nothing',
    'ship',
    { title: 'Ship?', details: () => 42 },
    'ctx.waitForApproval() details must be serializable as JSON',
  ],
  [
    'details over the request limit',
    'ship',
    { title: 'Ship?', details: 'd'.repeat(64 * 1024) },
    'ctx.waitForApproval() request must be at most 64 KiB, details included',
  ],
];

function refusesBadArguments(): void {
  it.each([
    ['with a BigInt', { total: 10n }, 'BigInt'],
    ['that are circular', circular(), 'circular structure'],
  ])('refuses details %s before registering anything', async (_case, details, reason) => {
    const failure = await failureOf(
      run((_input, ctx) => ctx.waitForApproval('ship-order', { title: 'Ship?', details })),
    );

    expect(failure).toBeInstanceOf(TypeError);
    expect(failure).toMatchObject({
      message: 'ctx.waitForApproval() details must be serializable as JSON',
      cause: expect.objectContaining({ message: expect.stringContaining(reason) }),
    });
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it.each(invalidArguments)('refuses %s before registering anything', async (_case, name, options, message) => {
    await expect(
      run((_input, ctx) => {
        const result: unknown = Reflect.apply(ctx.waitForApproval.bind(ctx), undefined, [name, options]);
        expectInstanceOf(result, Promise);
        return result;
      }),
    ).rejects.toThrow(new TypeError(message));
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });
}

function needsThePlatformURL(): void {
  it.each([
    ['unset', {}],
    ['blank', { VOLCANO_PLATFORM_API_URL: '   ' }],
  ])('explains that the platform URL is missing when it is %s', async (_case, env) => {
    Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');
    Object.assign(process.env, env);

    await expect(run(shipping)).rejects.toThrow(
      'ctx.waitForApproval() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to request approvals.',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('trims the platform URL and its trailing slash', async () => {
    process.env['VOLCANO_PLATFORM_API_URL'] = ' http://localhost:8000/ ';

    await run(shipping);

    expect(requestAt(0).url).toBe('http://localhost:8000/durable-approvals');
  });
}

function needsTheExecution(): void {
  it.each([
    ['absent', {}],
    ['empty', { DurableExecutionArn: '' }],
    ['not a string', { DurableExecutionArn: 42 }],
  ])('refuses when the execution ref is %s', async (_case, event) => {
    await expect(run(shipping, event)).rejects.toThrow(
      'ctx.waitForApproval() cannot tell which execution is running: the durable runtime did not report it',
    );
    expect(callbackCalls).toHaveLength(0);
  });

  it('refuses when the runtime gives no execution metadata at all', async () => {
    approvalDouble.contextTransform = (context) => {
      Reflect.deleteProperty(context, 'executionContext');
      return context;
    };

    await expect(run(shipping)).rejects.toThrow('cannot tell which execution is running');
  });

  it('refuses a runtime without callbacks', async () => {
    approvalDouble.contextTransform = (context) => {
      Reflect.deleteProperty(context, 'waitForCallback');
      return context;
    };

    await expect(run(shipping)).rejects.toThrow(
      new TypeError(
        'The durable runtime does not support approvals; redeploy the function so Volcano installs a current one',
      ),
    );
  });
}

function threadsTheExecutionRef(): void {
  it('gives every nested context the root execution ref', async () => {
    await run(async (_input, ctx) => {
      await ctx.child('review', (child) => askToShip(child));
      await ctx.map('orders', [1], (_item, item) => askToShip(item));
      await ctx.parallel([(branch) => askToShip(branch), { name: 'named', run: (branch) => askToShip(branch) }]);
      await ctx.child((outer) => outer.child((inner) => askToShip(inner)));
    });

    expect(fetchMock()).toHaveBeenCalledTimes(5);
    for (let index = 0; index < 5; index += 1) {
      expect(bodyAt(index)).toMatchObject({ execution_ref: EXECUTION_ARN });
    }
  });

  it('keeps each invocation on its own execution', async () => {
    const handler = durable((_input, ctx) => askToShip(ctx));

    await handler({ input: {}, DurableExecutionArn: 'arn:exec-a' }, {});
    await handler({ input: {}, DurableExecutionArn: 'arn:exec-b' }, {});

    expect(bodyAt(0)).toMatchObject({ execution_ref: 'arn:exec-a' });
    expect(bodyAt(1)).toMatchObject({ execution_ref: 'arn:exec-b' });
  });
}

describe('ctx.waitForApproval()', () => {
  refusesBadArguments();
  needsThePlatformURL();
  needsTheExecution();
  threadsTheExecutionRef();
});
