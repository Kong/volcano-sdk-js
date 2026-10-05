import { expect, test } from '@jest/globals';
import { assert, constantFrom, integer, property } from 'fast-check';
import {
  channelFetchConfig,
  globalFetchConfig,
  realtimeWebSocketUrl,
} from '../src/realtime-config.ts';
import { propertyOptions } from './support/property-options.ts';

test('keeps the existing auto-fetch defaults and truthy overrides', () => {
  expect(globalFetchConfig()).toEqual({ batchWindowMs: 20, maxBatchSize: 50, enabled: true });
  expect(globalFetchConfig({ batchWindowMs: null, maxBatchSize: 0, enabled: false })).toEqual({
    batchWindowMs: 20,
    maxBatchSize: 50,
    enabled: false,
  });
  expect(globalFetchConfig({ batchWindowMs: 0, maxBatchSize: 0 })).toEqual({
    batchWindowMs: 20,
    maxBatchSize: 50,
    enabled: true,
  });
  expect(globalFetchConfig({ batchWindowMs: 75, maxBatchSize: 13, enabled: true })).toEqual({
    batchWindowMs: 75,
    maxBatchSize: 13,
    enabled: true,
  });
  expect(globalFetchConfig({ batchWindowMs: Number.NaN })).toEqual({
    batchWindowMs: 20,
    maxBatchSize: 50,
    enabled: true,
  });
  expect(globalFetchConfig({ batchWindowMs: false, maxBatchSize: '' })).toEqual({
    batchWindowMs: 20,
    maxBatchSize: 50,
    enabled: true,
  });
});

test('channel overrides inherit parent settings and cannot re-enable a disabled parent', () => {
  const parent = globalFetchConfig({ batchWindowMs: 75, maxBatchSize: 13 });
  expect(channelFetchConfig(parent, {})).toEqual(parent);
  expect(
    channelFetchConfig(parent, { fetchBatchWindowMs: 10, fetchMaxBatchSize: 2, autoFetch: false }),
  ).toEqual({ batchWindowMs: 10, maxBatchSize: 2, enabled: false });
  expect(
    channelFetchConfig(globalFetchConfig({ enabled: false }), {
      fetchBatchWindowMs: null,
      fetchMaxBatchSize: false,
      autoFetch: true,
    }),
  ).toEqual({ batchWindowMs: 20, maxBatchSize: 50, enabled: false });
});

test('arbitrary API authorities keep their host and discard paths, queries, and fragments', () => {
  assert(
    property(
      constantFrom('http', 'https'),
      constantFrom('localhost', 'api.example.com', '127.0.0.1'),
      integer({ min: 1000, max: 9999 }),
      (scheme, host, port) => {
        expect(
          realtimeWebSocketUrl(`${scheme}://${host}:${String(port)}/v1?token=secret#fragment`),
        ).toBe(
          `${scheme === 'https' ? 'wss' : 'ws'}://${host}:${String(port)}/realtime/v1/websocket`,
        );
      },
    ),
    propertyOptions(),
  );
  expect(() => realtimeWebSocketUrl('not a URL')).toThrow();
});
