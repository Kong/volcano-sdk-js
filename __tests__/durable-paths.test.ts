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

  test.each(['.', '..', ' .. ', '\t.\n', '../x', 'a/./b', 'folder/function', '..x/y..'])(
    'rejects %p, which is a dot segment or contains "/"',
    (functionName) => {
      expect(durablePathSegments({ functionName })).toEqual({
        error: new Error('functionName cannot contain "/" or be "." or ".."'),
      });
    },
  );

  test('names the field that is a dot segment', () => {
    expect(
      durablePathSegments({ projectId: 'project', approvalId: '..', functionName: 'f' }),
    ).toEqual({ error: new Error('approvalId cannot contain "/" or be "." or ".."') });
  });

  test.each([
    ['...', '...'],
    ['.hidden', '.hidden'],
    ['..x?y..', '..x%3Fy..'],
    ['%2e%2e', '%252e%252e'],
  ])('keeps the non-dot identifier %s as one encoded segment', (functionName, encoded) => {
    expect(durablePathSegments({ functionName })).toEqual({ segments: { functionName: encoded } });
  });

  test('names the first invalid field without returning a partial route', () => {
    expect(
      durablePathSegments({ projectId: 'project', functionName: '', executionId: null }),
    ).toEqual({ error: new Error('functionName must be a non-empty string') });
  });

  test.each([
    ['  order-pipeline\t', 'order-pipeline'],
    ['a?b=c#fragment', 'a%3Fb%3Dc%23fragment'],
    ['already%2Fencoded', 'already%252Fencoded'],
    ['two words', 'two%20words'],
    ['café 🌋', 'caf%C3%A9%20%F0%9F%8C%8B'],
  ])('encodes %s as one path segment', (functionName, encoded) => {
    expect(durablePathSegments({ functionName })).toEqual({
      segments: { functionName: encoded },
    });
  });

  test('encodes every owner-route field without mutating the input', () => {
    const fields = Object.freeze({
      projectId: ' project?id ',
      functionName: ' function?name ',
      executionId: ' execution?id ',
    });
    expect(durablePathSegments(fields)).toEqual({
      segments: {
        projectId: 'project%3Fid',
        functionName: 'function%3Fname',
        executionId: 'execution%3Fid',
      },
    });
    expect(fields).toEqual({
      projectId: ' project?id ',
      functionName: ' function?name ',
      executionId: ' execution?id ',
    });
  });

  test('reports an unpaired surrogate instead of throwing URIError', () => {
    expect(durablePathSegments({ functionName: '\uD800' })).toEqual({
      error: new Error('functionName is not well-formed Unicode'),
    });
  });

  test('returns no path segments when no fields are supplied', () => {
    expect(durablePathSegments({})).toEqual({ segments: {} });
  });
});
