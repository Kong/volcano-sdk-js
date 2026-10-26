/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CallbackFailedError } from '../src/durable.ts';
import {
  awaitPayment,
  bodyAt,
  callbackCalls,
  callbackDouble,
  callWith,
  failureOf,
  fetchMock,
  mockCallbackRuntime,
  onlyCallbackCall,
  record,
  resetCallbackDouble,
  restoreCallbackDouble,
  run,
  runtimeError,
} from './support/durable-callback-double.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

jest.mock('@aws/durable-execution-sdk-js', () => mockCallbackRuntime(), { virtual: true });

beforeEach(resetCallbackDouble);

afterEach(restoreCallbackDouble);

function raisesCallbackFailures(): void {
  it('throws CallbackFailedError with the type and message the callback failed with', async () => {
    const failure = runtimeError(
      'CallbackExternalError',
      'insufficient funds',
      JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' }),
    );
    callbackDouble.outcome = () => Promise.reject(failure);

    const error = await failureOf(run(awaitPayment(record)));

    expect(error).toBeInstanceOf(CallbackFailedError);
    expect(error).toMatchObject({
      name: 'CallbackFailedError',
      type: 'CardDeclined',
      message: 'insufficient funds',
      cause: failure,
    });
  });

  it('keeps an empty failure message empty', async () => {
    callbackDouble.outcome = () =>
      Promise.reject(
        runtimeError('CallbackExternalError', 'Callback failed', JSON.stringify({ type: 'Cancelled', message: '' })),
      );

    const error = await failureOf(run(awaitPayment(record)));

    expect(error).toMatchObject({ type: 'Cancelled', message: '' });
  });

  it.each([
    ['a missing message', { type: 'Cancelled' }],
    ['a message that is not text', { type: 'Cancelled', message: 42 }],
  ])('reads %s as an empty one', async (_case, data) => {
    callbackDouble.outcome = () =>
      Promise.reject(runtimeError('CallbackExternalError', 'Callback failed', JSON.stringify(data)));

    const error = await failureOf(run(awaitPayment(record)));

    expect(error).toBeInstanceOf(CallbackFailedError);
    expect(error).toMatchObject({ type: 'Cancelled', message: '' });
  });
}

function rethrowsOtherFailures(): void {
  it.each([
    ['data that is not JSON', 'not json'],
    ['no data', undefined],
    ['data without a type', JSON.stringify({ message: 'insufficient funds' })],
    ['a type that is not text', JSON.stringify({ type: 7, message: 'insufficient funds' })],
  ])('rethrows a failure with %s as the runtime raised it', async (_case, data) => {
    const failure = runtimeError('CallbackExternalError', 'Callback failed', data);
    callbackDouble.outcome = () => Promise.reject(failure);

    await expect(failureOf(run(awaitPayment(record)))).resolves.toBe(failure);
  });

  it('reads failure data only as JSON text', async () => {
    const failure = Object.assign(new Error('Callback failed'), {
      errorType: 'CallbackExternalError',
      errorData: [JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' })],
    });
    callbackDouble.outcome = () => Promise.reject(failure);

    await expect(failureOf(run(awaitPayment(record)))).resolves.toBe(failure);
  });

  it.each([
    ['another runtime error', runtimeError('CallbackSubmitterError', 'the provider is down')],
    [
      'another runtime error carrying failure data',
      runtimeError(
        'CallbackSubmitterError',
        'the provider is down',
        JSON.stringify({ type: 'CardDeclined', message: 'insufficient funds' }),
      ),
    ],
    ['a thrown string', 'boom'],
    ['a thrown null', null],
  ])('rethrows %s', async (_case, failure) => {
    callbackDouble.outcome = () => rejectWithForeignValue(failure);

    await expect(failureOf(run(awaitPayment(record)))).resolves.toBe(failure);
  });
}

function propagatesFailures(): void {
  it('propagates a submitter failure', async () => {
    const refused = new Error('the provider refused the charge');

    await expect(
      failureOf(
        run(
          awaitPayment(() => {
            throw refused;
          }),
        ),
      ),
    ).resolves.toBe(refused);
  });

  it('fails on a result that is not JSON', async () => {
    callbackDouble.outcome = () => Promise.resolve('{not json');

    await expect(failureOf(run(awaitPayment(record)))).resolves.toThrow(
      'Volcano resumed the callback with a result this SDK cannot read',
    );
  });
}

function refusesBadArguments(): void {
  it.each([
    ['an empty name', [' ', record], 'ctx.waitForCallback() requires a non-empty name'],
    ['a non-string name', [42, record], 'ctx.waitForCallback() requires a non-empty name'],
    ['a long name', ['n'.repeat(238), record], 'ctx.waitForCallback() name must be at most 237 characters'],
    ['a name outside ASCII', ['paiement-réglé', record], 'ctx.waitForCallback() name must be printable ASCII'],
    ['no submitter', ['payment'], 'ctx.waitForCallback() requires a submitter function'],
    [
      'a submitter that is not a function',
      ['payment', 'https://payments.example.com'],
      'ctx.waitForCallback() requires a submitter function',
    ],
    ['text options', ['payment', record, '1h'], 'ctx.waitForCallback() options must be an object'],
    [
      'a heartbeat timeout under a second',
      ['payment', record, { heartbeatTimeout: 0 }],
      'heartbeatTimeout must be at least 1 second',
    ],
    [
      'a timeout outside the execution lifetime',
      ['payment', record, { timeout: '367d' }],
      'timeout must be at most 31622400 seconds (366 days)',
    ],
  ])('refuses %s before registering anything', async (_case, args, message) => {
    await expect(run(callWith((ctx) => Reflect.apply(ctx.waitForCallback.bind(ctx), undefined, args)))).rejects.toThrow(
      message,
    );
    expect(callbackCalls).toHaveLength(0);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('accepts a name of 237 characters', async () => {
    const name = 'n'.repeat(237);

    await run(callWith((ctx) => ctx.waitForCallback(name, record)));

    expect(onlyCallbackCall().name).toBe(name);
    expect(bodyAt(0)).toMatchObject({ name });
  });
}

function needsTheRuntimeAndPlatform(): void {
  it('needs the platform API URL Volcano sets on durable functions', async () => {
    Reflect.deleteProperty(process.env, 'VOLCANO_PLATFORM_API_URL');

    await expect(failureOf(run(awaitPayment(record)))).resolves.toThrow(
      'ctx.waitForCallback() needs VOLCANO_PLATFORM_API_URL, which Volcano sets on durable functions. Deploy this function as durable to wait for callbacks.',
    );
  });

  it('needs the runtime to report the execution', async () => {
    await expect(failureOf(run(awaitPayment(record), {}))).resolves.toThrow(
      'ctx.waitForCallback() cannot tell which execution is running',
    );
  });

  it('asks for a redeploy on a runtime without callbacks', async () => {
    callbackDouble.hasCallbacks = false;

    await expect(failureOf(run(awaitPayment(record)))).resolves.toThrow(
      'The durable runtime does not support callbacks; redeploy the function',
    );
  });
}

describe('ctx.waitForCallback()', () => {
  raisesCallbackFailures();
  rethrowsOtherFailures();
  propagatesFailures();
  refusesBadArguments();
  needsTheRuntimeAndPlatform();
});
