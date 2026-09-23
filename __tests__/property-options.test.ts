/** @jest-environment ./__tests__/node-environment.cjs */
import { afterEach, expect, jest, test } from '@jest/globals';
import { propertyOptions } from './support/property-options.ts';

afterEach(() => {
  jest.restoreAllMocks();
});

test('uses fast-check random seeds by default', () => {
  const environment = { ...process.env };
  delete environment['VOLCANO_PROPERTY_SEED'];
  jest.replaceProperty(process, 'env', environment);
  expect(propertyOptions()).toEqual({ numRuns: 200 });
});

test.each(['12345', '0', '-12345'])('replays integer seed %s', (seed) => {
  jest.replaceProperty(process, 'env', { ...process.env, VOLCANO_PROPERTY_SEED: seed });
  expect(propertyOptions()).toEqual({ numRuns: 200, seed: Number(seed) });
});

test.each(['', ' ', 'NaN', '1.5', 'Infinity', '9007199254740992'])(
  'rejects an invalid seed %s',
  (seed) => {
    jest.replaceProperty(process, 'env', { ...process.env, VOLCANO_PROPERTY_SEED: seed });
    expect(propertyOptions).toThrow('VOLCANO_PROPERTY_SEED must be an integer');
  },
);
