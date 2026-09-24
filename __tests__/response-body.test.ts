/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { assert, asyncProperty, jsonValue } from 'fast-check';
import { parseResponseBody } from '../src/response-body.ts';
import { propertyOptions } from './support/property-options.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

test.each([undefined, null, {}])('returns null for an absent body reader: %p', async (response) => {
  await expect(parseResponseBody(response)).resolves.toBeNull();
});

test('preserves arbitrary JSON response values', async () => {
  await assert(
    asyncProperty(jsonValue(), async (value) => {
      const result = await parseResponseBody(Response.json(value));
      expect(JSON.stringify(result)).toBe(JSON.stringify(value));
    }),
    { ...propertyOptions(), examples: [[-0]] },
  );
});

test.each(['application/json', 'APPLICATION/JSON; charset=UTF-8'])(
  'parses scalar JSON with content type %s',
  async (contentType) => {
    const response = new Response('false', { headers: { 'Content-Type': contentType } });
    await expect(parseResponseBody(response)).resolves.toBe(false);
  },
);

test.each([
  ['{}', {}],
  ['[null,1]', [null, 1]],
])('parses an unlabelled JSON container: %s', async (body, expected) => {
  const response = new Response(body);
  await expect(parseResponseBody(response)).resolves.toEqual(expected);
});

test.each(['plain text', 'false', 'null', '123', '  {"key":1}', ' ', '{invalid', '[invalid'])(
  'preserves the unlabelled body %p',
  async (body) => {
    await expect(parseResponseBody(new Response(body))).resolves.toBe(body);
  },
);

test('preserves malformed JSON with a JSON content type', async () => {
  const response = new Response('not json', { headers: { 'Content-Type': 'application/json' } });
  await expect(parseResponseBody(response)).resolves.toBe('not json');
});

test('returns null for an empty text response', async () => {
  await expect(parseResponseBody(new Response(''))).resolves.toBeNull();
});

test('uses the JSON reader when no text reader exists', async () => {
  const value = { success: true };
  const json = jest.fn<() => Promise<unknown>>().mockResolvedValue(value);
  await expect(parseResponseBody({ json })).resolves.toBe(value);
  expect(json).toHaveBeenCalledTimes(1);
});

test('preserves an undefined JSON-reader result', async () => {
  await expect(parseResponseBody({ json: () => Promise.resolve() })).resolves.toBeUndefined();
});

test('returns null when a JSON-only response cannot be read', async () => {
  const json = jest.fn<() => Promise<unknown>>().mockRejectedValue(new Error('read failed'));
  await expect(parseResponseBody({ json })).resolves.toBeNull();
});

test('prefers the text reader without consuming the JSON reader', async () => {
  const response = new Response('payload');
  const json = jest.spyOn(response, 'json');
  await expect(parseResponseBody(response)).resolves.toBe('payload');
  expect(json).not.toHaveBeenCalled();
});

test.each([new Error('read failed'), new DOMException('cancelled', 'AbortError')])(
  'propagates a text-reader failure: %p',
  async (error) => {
    const response = new Response('unused');
    jest.spyOn(response, 'text').mockRejectedValue(error);
    await expect(parseResponseBody(response)).rejects.toBe(error);
  },
);

test.each([undefined, null, false, 0, '', Number.NaN])(
  'treats a falsy content type as absent: %p',
  async (value) => {
    const response = { text: () => Promise.resolve('false'), headers: { get: () => value } };
    await expect(parseResponseBody(response)).resolves.toBe('false');
  },
);

test.each([true, 1, {}, []])('rejects a truthy non-string content type: %p', async (value) => {
  const response = { text: () => Promise.resolve('payload'), headers: { get: () => value } };
  const result = parseResponseBody(response);
  await expect(result).rejects.toBeInstanceOf(TypeError);
  await expect(result).rejects.toThrow('Content-Type header must be a string');
});

test('accepts a text-only adapter without headers', async () => {
  await expect(parseResponseBody({ text: () => Promise.resolve('[]') })).resolves.toEqual([]);
});
