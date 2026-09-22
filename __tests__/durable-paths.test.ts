import { describe, expect, test } from '@jest/globals';
import { durablePathSegments } from '../src/durable-paths.ts';

const invalidIdentifiers: readonly unknown[] = [
  null,
  undefined,
  false,
  0,
  {},
  [],
  Symbol('identifier'),
  '',
  ' \n\t ',
];

describe('durable route identifiers', () => {
  test.each(invalidIdentifiers)('rejects an unusable identifier: %p', (functionName) => {
    expect(durablePathSegments({ functionName })).toEqual({
      error: new Error('functionName must be a non-empty string'),
    });
  });

  test('names the first invalid field without returning a partial route', () => {
    expect(
      durablePathSegments({ projectId: 'project', functionName: '', executionId: null }),
    ).toEqual({ error: new Error('functionName must be a non-empty string') });
  });

  test.each([
    ['  order-pipeline\t', 'order-pipeline'],
    ['folder/function', 'folder%2Ffunction'],
    ['a?b=c#fragment', 'a%3Fb%3Dc%23fragment'],
    ['already%2Fencoded', 'already%252Fencoded'],
    ['two words', 'two%20words'],
    ['café/🌋', 'caf%C3%A9%2F%F0%9F%8C%8B'],
  ])('encodes %s as one path segment', (functionName, encoded) => {
    expect(durablePathSegments({ functionName })).toEqual({
      segments: { functionName: encoded },
    });
  });

  test('encodes every owner-route field without mutating the input', () => {
    const fields = Object.freeze({
      projectId: ' project/id ',
      functionName: ' function/name ',
      executionId: ' execution/id ',
    });
    expect(durablePathSegments(fields)).toEqual({
      segments: {
        projectId: 'project%2Fid',
        functionName: 'function%2Fname',
        executionId: 'execution%2Fid',
      },
    });
    expect(fields).toEqual({
      projectId: ' project/id ',
      functionName: ' function/name ',
      executionId: ' execution/id ',
    });
  });

  test('preserves URIError for an unpaired surrogate', () => {
    expect(() => durablePathSegments({ functionName: '\uD800' })).toThrow(URIError);
  });

  test('returns no path segments when no fields are supplied', () => {
    expect(durablePathSegments({})).toEqual({ segments: {} });
  });
});
