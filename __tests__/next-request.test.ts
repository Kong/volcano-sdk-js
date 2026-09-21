/** @jest-environment node */
import { afterEach, expect, test } from '@jest/globals';
import {
  getTokenFromRequest,
  isBrowser,
  isServer,
  type MiddlewareRequest,
} from '../src/next/request.ts';

function request(authorization?: string, cookie?: string): MiddlewareRequest {
  const headers = new Headers();
  if (authorization !== undefined) {
    headers.set('authorization', authorization);
  }
  return {
    headers,
    cookies: { get: () => (cookie === undefined ? undefined : { value: cookie }) },
  };
}

test('prefers the bearer token to a cookie', () => {
  expect(getTokenFromRequest(request('Bearer header-token', 'cookie-token'))).toBe('header-token');
});

test('preserves an empty bearer token instead of falling back to a cookie', () => {
  // Headers trims trailing whitespace; this typed header implementation keeps it.
  const headers = new Headers();
  headers.get = () => 'Bearer ';
  expect(
    getTokenFromRequest({ headers, cookies: { get: () => ({ value: 'cookie-token' }) } }),
  ).toBe('');
});

test.each([undefined, 'Basic credentials', 'bearer lower-case'])(
  'uses a cookie without a bearer header: %s',
  (authorization) => {
    expect(getTokenFromRequest(request(authorization, 'cookie-token'))).toBe('cookie-token');
  },
);

test.each([undefined, ''])('returns null for a missing or empty cookie: %s', (cookie) => {
  expect(getTokenFromRequest(request(undefined, cookie))).toBeNull();
});

test('accepts a standard request without Next.js cookies', () => {
  expect(getTokenFromRequest(new Request('https://example.com/'))).toBeNull();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window');
});

test('recognizes a server without window', () => {
  expect(isBrowser()).toBe(false);
  expect(isServer()).toBe(true);
});

test('recognizes a browser with a document', () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { document: {} } });
  expect(isBrowser()).toBe(true);
  expect(isServer()).toBe(false);
});

test('requires a document even when window exists', () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
  expect(isBrowser()).toBe(false);
  expect(isServer()).toBe(true);
});
