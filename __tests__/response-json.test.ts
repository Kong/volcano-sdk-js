/** @jest-environment node */
import { afterEach, expect, jest, test } from '@jest/globals';
import { assert, asyncProperty, jsonValue } from 'fast-check';
import { safeJsonParse } from '../src/response-json.ts';
import { propertyOptions } from './support/property-options.ts';

function AbortError(): never {
  throw new Error('the failure must not be invoked');
}

afterEach(() => {
  jest.restoreAllMocks();
});

test('preserves arbitrary JSON on the wire', async () => {
  await assert(
    asyncProperty(jsonValue(), async (value) => {
      const result = await safeJsonParse(Response.json(value));
      expect(JSON.stringify(result)).toBe(JSON.stringify(value));
    }),
    // Seed -744480547 produced -0, which JSON serialization sends as 0.
    { ...propertyOptions(), examples: [[-0]] },
  );
});

test('preserves a negative zero explicitly supplied in the response body', async () => {
  await expect(safeJsonParse(new Response('-0'))).resolves.toBe(-0);
});

test.each([null, true, false, 0, '', 'text', [], { nested: [1, null, false] }])(
  'preserves the JSON value %p',
  async (value) => {
    await expect(safeJsonParse(Response.json(value))).resolves.toEqual(value);
  },
);

test.each(['', '{', '<html>unavailable</html>'])('returns an empty object for %p', async (body) => {
  await expect(safeJsonParse(new Response(body))).resolves.toEqual({});
});

test('creates separate fallback objects for failed responses', async () => {
  const first = await safeJsonParse(new Response('invalid'));
  const second = await safeJsonParse(new Response('invalid'));
  expect(first).not.toBe(second);
});

test.each([undefined, null, 0, 'failure', {}, new Error('read failed'), () => 'failure'])(
  'returns the fallback for a non-abort body failure: %p',
  async (error) => {
    const response = new Response('unused');
    jest.spyOn(response, 'json').mockRejectedValue(error);
    await expect(safeJsonParse(response)).resolves.toEqual({});
  },
);

test.each([new DOMException('aborted', 'AbortError'), { name: 'AbortError' }])(
  'propagates an abort-shaped body failure: %p',
  async (error) => {
    const response = new Response('unused');
    const caller = new AbortController();
    jest.spyOn(response, 'json').mockRejectedValue(error);
    await expect(safeJsonParse(response, caller.signal)).rejects.toBe(error);
  },
);

test('propagates cancellation instead of treating its failed body as malformed JSON', async () => {
  const caller = new AbortController();
  const reason = new Error('caller cancelled');
  caller.abort(reason);

  await expect(safeJsonParse(new Response('invalid'), caller.signal)).rejects.toBe(reason);
});

test('propagates an abort-shaped callable failure without invoking it', async () => {
  const response = new Response('unused');
  jest.spyOn(response, 'json').mockRejectedValue(AbortError);
  await expect(safeJsonParse(response)).rejects.toBe(AbortError);
});

test.each([null, false, 0, '', Number.NaN])(
  'preserves the body failure when the abort reason is falsy: %p',
  async (reason) => {
    const caller = new AbortController();
    const error = new Error('body failed');
    const response = new Response('unused');
    caller.abort(reason);
    jest.spyOn(response, 'json').mockRejectedValue(error);

    await expect(safeJsonParse(response, caller.signal)).rejects.toBe(error);
  },
);

test('preserves the default AbortController reason', async () => {
  const caller = new AbortController();
  caller.abort();
  await expect(safeJsonParse(new Response('invalid'), caller.signal)).rejects.toBe(
    caller.signal.reason,
  );
});

test('accepts a successful body even when the supplied signal is already aborted', async () => {
  const caller = new AbortController();
  caller.abort();
  await expect(safeJsonParse(new Response('true'), caller.signal)).resolves.toBe(true);
});

test('keeps malformed-response handling with an active signal', async () => {
  const caller = new AbortController();
  await expect(safeJsonParse(new Response('invalid'), caller.signal)).resolves.toEqual({});
});
