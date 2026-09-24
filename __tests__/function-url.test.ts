/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import { assert, property, string } from 'fast-check';
import {
  functionInvokeUrl,
  sanitizeFunctionIdentifierForHost,
  validInvokeUrl,
} from '../src/function-url.ts';
import { propertyOptions } from './support/property-options.ts';

test.each([
  null,
  undefined,
  12,
  {},
  '',
  ' ',
  'Upper',
  '-start',
  'end-',
  'two.labels',
  'a_b',
  'a'.repeat(64),
])('rejects an invalid DNS function label: %p', (value) => {
  expect(sanitizeFunctionIdentifierForHost(value)).toBeNull();
});

test.each(['a', '0', 'function-123', 'a'.repeat(63)])(
  'accepts a bounded lowercase DNS label: %s',
  (value) => {
    expect(sanitizeFunctionIdentifierForHost(` ${value}\t`)).toBe(value);
  },
);

test.each([
  null,
  undefined,
  12,
  {},
  '',
  'not a URL',
  '/relative',
  'https://',
  'mailto:user@example.com',
  'ftp://example.com/file',
  new URL('https://example.com/invoke'),
])('rejects malformed or unsupported invocation URLs: %p', (value) => {
  expect(validInvokeUrl(value, 'https://api.example.com')).toBeNull();
});

test.each(['https://api.example.com', 'http://localhost:8080', 'not a URL'])(
  'accepts HTTPS invocation URLs with API URL %s',
  (apiUrl) => {
    expect(validInvokeUrl('https://EXAMPLE.com:443/a/../invoke?q=1#part', apiUrl)).toBe(
      'https://example.com/invoke?q=1#part',
    );
  },
);

test('allows HTTP only when the configured API is also HTTP', () => {
  expect(validInvokeUrl('http://localhost:8081/invoke', 'http://localhost:8080')).toBe(
    'http://localhost:8081/invoke',
  );
  expect(validInvokeUrl('http://localhost:8081/invoke', 'https://api.example.com')).toBeNull();
  expect(validInvokeUrl('http://localhost:8081/invoke', 'invalid API URL')).toBeNull();
  expect(validInvokeUrl('ftp://example.com/invoke', 'http://localhost:8080')).toBeNull();
});

test('rejects an invalid resolved function identifier before building a URL', () => {
  expect(() => functionInvokeUrl('https://api.example.com', 'Upper', null)).toThrow(
    'functionId must be DNS-safe',
  );
});

test('arbitrary invocation query values cannot downgrade an HTTPS API credential', () => {
  assert(
    property(string(), (value) => {
      const url = new URL('http://function.example.com/invoke');
      url.searchParams.set('input', value);
      expect(validInvokeUrl(url.href, 'https://api.example.com')).toBeNull();
      url.protocol = 'https:';
      const result = validInvokeUrl(url.href, 'https://api.example.com');
      expect(result).toBe(url.href);
    }),
    propertyOptions(),
  );
});
