/** @jest-environment ./__tests__/node-environment.cjs */
import { expect, test } from '@jest/globals';
import {
  convertedPathSegment,
  hasLoneSurrogate,
  hasUnsafeSegment,
  pathSegment,
} from '../src/path-segments.ts';

const UNSAFE = 'field cannot contain "/" or be "." or ".."';

test.each(['.', '..', '../x', 'a/./b', 'x/..', '', '/', 'x/', '/x', 'a//b'])(
  'finds an empty or dot segment in %p',
  (value) => {
    expect(hasUnsafeSegment(value)).toBe(true);
  },
);

test.each(['x', 'a/b', '...', '.a', 'a.', '..x/y..', '%2e%2e/x', ' .. '])(
  'finds no empty or dot segment in %p',
  (value) => {
    expect(hasUnsafeSegment(value)).toBe(false);
  },
);

test.each([
  ['.', '/storage/bucket/x'],
  ['%2e', '/storage/bucket/x'],
  ['..', '/storage/x'],
  ['.%2e', '/storage/x'],
  ['%2E%2e', '/storage/x'],
])('URL parsing resolves %s, so encoding the dots would not prevent traversal', (segment, path) => {
  expect(new URL(`https://api.example.com/storage/bucket/${segment}/x`).pathname).toBe(path);
});

test.each([
  ['id', 'id'],
  [' a b ', '%20a%20b%20'],
  ['a%2Fb', 'a%252Fb'],
  ['a\\b', 'a%5Cb'],
  ['a?b#c', 'a%3Fb%23c'],
  ['%2e%2e', '%252e%252e'],
  ['...', '...'],
  [' .. ', '%20..%20'],
  ['..\n', '..%0A'],
])('encodes %p as one path segment', (value, segment) => {
  expect(pathSegment('field', value)).toEqual({ segment, error: null });
});

test.each([null, undefined, 4, {}, '', ' \n\t '])('refuses the missing value %p', (value) => {
  expect(pathSegment('field', value)).toEqual({
    segment: null,
    error: new Error('field must be a non-empty string'),
  });
});

test.each(['.', '..', '../x', 'x/..', '/', 'x/', '/x', 'a/b', 'main/branches/dev'])(
  'refuses %p, which is a dot segment or contains "/"',
  (value) => {
    expect(pathSegment('field', value)).toEqual({ segment: null, error: new Error(UNSAFE) });
  },
);

test.each([
  [2024, '2024'],
  [7n, '7'],
  [false, 'false'],
  ['id', 'id'],
])('converts %p as encodeURIComponent did', (value, segment) => {
  expect(convertedPathSegment('field', value)).toEqual({ segment, error: null });
});

test.each([null, undefined, {}, { toString: () => 'id' }, Symbol('id'), ''])(
  'refuses the unconverted value %p',
  (value) => {
    expect(convertedPathSegment('field', value)).toEqual({
      segment: null,
      error: new Error('field must be a non-empty string'),
    });
  },
);

test('applies the segment rule after converting', () => {
  expect(convertedPathSegment('field', '..')).toEqual({ segment: null, error: new Error(UNSAFE) });
});

test.each([
  ['a\uD800', true],
  ['\uDC00a', true],
  ['\uDC00\uD800', true],
  ['😀', false],
  ['café', false],
  ['', false],
])('finds a lone surrogate in %p: %p', (value, expected) => {
  expect(hasLoneSurrogate(value)).toBe(expected);
});

test.each(['a\uD800', '\uDFFF'])(
  'reports the lone surrogate in %p instead of throwing URIError',
  (value) => {
    expect(pathSegment('field', value)).toEqual({
      segment: null,
      error: new Error('field is not well-formed Unicode'),
    });
  },
);
