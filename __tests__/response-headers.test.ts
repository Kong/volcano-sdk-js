/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, jest, test } from '@jest/globals';
import { array, assert, constantFrom, property, stringMatching, tuple } from 'fast-check';
import { getHeaderValue, responseHeadersToObject } from '../src/response-headers.ts';
import { propertyOptions } from './support/property-options.ts';

test.each([undefined, null, {}, { headers: null }])(
  'handles a response without headers: %p',
  (response) => {
    expect(responseHeadersToObject(response)).toEqual({});
    expect(getHeaderValue(response, 'content-type')).toBeNull();
  },
);

test('creates separate header snapshots', () => {
  expect(responseHeadersToObject(null)).not.toBe(responseHeadersToObject(null));
});

test('copies native response headers into an independent object', () => {
  const response = new Response('body', { headers: { 'X-Request-ID': 'first' } });
  const snapshot = responseHeadersToObject(response);
  response.headers.set('X-Request-ID', 'second');

  expect(snapshot).toEqual({ 'content-type': 'text/plain;charset=UTF-8', 'x-request-id': 'first' });
  expect(getHeaderValue(response, 'X-REQUEST-id')).toBe('second');
  expect(getHeaderValue(response, 'missing')).toBeNull();
});

test('prefers forEach when the adapter also exposes entries', () => {
  const headers = new Headers({ 'Retry-After': '3' });
  const entries = jest.spyOn(headers, 'entries');

  expect(responseHeadersToObject({ headers })).toEqual({ 'retry-after': '3' });
  expect(entries).not.toHaveBeenCalled();
});

test('supports an adapter that exposes only entries', () => {
  const values = new Map([
    ['X-Version', 'v1'],
    ['Retry-After', '0'],
  ]);
  const headers = { entries: () => values.entries() };

  expect(responseHeadersToObject({ headers })).toEqual({ 'X-Version': 'v1', 'Retry-After': '0' });
});

test.each([{ headers: {} }, { headers: { forEach: 'plain value', entries: 'plain value' } }])(
  'keeps the existing empty snapshot for non-iterable adapters: %p',
  (response) => {
    expect(responseHeadersToObject(response)).toEqual({});
  },
);

test('looks up own plain-object headers without changing their values', () => {
  const headers = { 'Content-Type': 'Application/JSON', 'Retry-After': '', get: 'plain value' };

  expect(getHeaderValue({ headers }, 'CONTENT-TYPE')).toBe('Application/JSON');
  expect(getHeaderValue({ headers }, 'retry-after')).toBe('');
  expect(getHeaderValue({ headers }, 'GET')).toBe('plain value');
  expect(getHeaderValue({ headers }, 'missing')).toBeNull();
});

test('does not read inherited or non-enumerable plain-object headers', () => {
  const headers = { 'X-Version': 'v1' };
  Object.setPrototypeOf(headers, { 'Retry-After': '4' });
  Object.defineProperty(headers, 'Content-Type', { value: 'hidden' });

  expect(getHeaderValue({ headers }, 'retry-after')).toBeNull();
  expect(getHeaderValue({ headers }, 'content-type')).toBeNull();
});

test('preserves the adapter receiver and prefers get over plain-object values', () => {
  const headers = {
    value: 'native value',
    'X-Version': 'fallback value',
    get(name: string): string | null {
      return name === 'X-Version' ? this.value : null;
    },
  };

  expect(getHeaderValue({ headers }, 'X-Version')).toBe('native value');
  expect(getHeaderValue({ headers }, 'missing')).toBeNull();
});

test('preserves native normalization and repeated header values', () => {
  const pairs = array(
    tuple(
      constantFrom('X-Request-ID', 'x-request-id', 'Retry-After', 'Content-Type'),
      stringMatching(/^[a-z0-9]{0,24}$/),
    ),
    { maxLength: 20 },
  );
  assert(
    property(pairs, (values) => {
      const headers = new Headers(values);
      const snapshot = responseHeadersToObject({ headers });
      expect(snapshot).toEqual(Object.fromEntries(headers.entries()));
      for (const name of headers.keys()) {
        expect(getHeaderValue({ headers }, name.toUpperCase())).toBe(headers.get(name));
      }
    }),
    propertyOptions(),
  );
});
