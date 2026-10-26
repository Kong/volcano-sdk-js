import { jest } from '@jest/globals';
import type { ConvertAnonymousOptions } from '../../src/index.ts';
import { reply } from '../auth-concurrency-fixtures.ts';

function expiredUnauthorized(): Response {
  return reply(401, { error: 'expired' });
}

function unparseableUnauthorized(reason: string): () => Response {
  return () => {
    const denied = expiredUnauthorized();
    jest.spyOn(denied, 'json').mockRejectedValue(new SyntaxError(reason));
    return denied;
  };
}

/** 401 replies by body kind; only the JSON body parses. */
export const unauthorizedReplies: readonly [string, () => Response][] = [
  ['json', expiredUnauthorized],
  ['empty', unparseableUnauthorized('empty')],
  ['html', unparseableUnauthorized('html')],
];

/** Failures that must reach the caller without a refresh or replay. */
export const unrecoveredFailures: readonly [string, () => Promise<Response>][] = [
  ['transport', () => Promise.reject(new Error('response lost'))],
  ['503', () => Promise.resolve(reply(503))],
];

/** Profile options that call `read` from a getter or from `toJSON` during serialization. */
export const profileBoundaries: readonly [string, (read: () => { name: string }) => ConvertAnonymousOptions][] = [
  [
    'getter',
    (read) => ({
      email: 'replacement@example.com',
      password: 'synthetic',
      get metadata() {
        return read();
      },
    }),
  ],
  [
    'toJSON',
    (read) => ({
      email: 'replacement@example.com',
      password: 'synthetic',
      metadata: Object.defineProperty({}, 'toJSON', { value: read }),
    }),
  ],
];
