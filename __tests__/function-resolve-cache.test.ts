import { afterEach, beforeEach, expect, test } from '@jest/globals';
import {
  clearSharedFunctionResolveStateForTests,
  getSharedFunctionResolveState,
  pruneFunctionResolveCache,
} from '../src/function-resolve-cache.ts';

beforeEach(() => {
  globalThis.__VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__ = undefined;
});

afterEach(() => {
  globalThis.__VOLCANO_SDK_FUNCTION_RESOLVE_STATE_V1__ = undefined;
});

test('shares one cache between SDK copies and resets all mutable state', () => {
  const state = getSharedFunctionResolveState();
  expect(getSharedFunctionResolveState()).toBe(state);
  state.cache.set('entry', { expiresAt: 9000 });
  state.inFlight.set('entry', Promise.resolve());
  state.maxEntries = 1;
  state.lastPruneAtMs = 6000;

  clearSharedFunctionResolveStateForTests();
  expect(state.cache.size).toBe(0);
  expect(state.inFlight.size).toBe(0);
  expect(state.maxEntries).toBe(1024);
  expect(state.lastPruneAtMs).toBe(0);
});

test('prunes on the normal interval and leaves recent entries untouched between scans', () => {
  const state = getSharedFunctionResolveState();
  state.cache.set('expired', { expiresAt: 1 });
  pruneFunctionResolveCache(state);
  expect(state.cache.has('expired')).toBe(false);

  state.cache.set('new', { expiresAt: 1 });
  const previousPrune = state.lastPruneAtMs;
  pruneFunctionResolveCache(state, previousPrune + 100);
  expect(state.cache.has('new')).toBe(true);
  expect(state.lastPruneAtMs).toBe(previousPrune);
});

test('prunes when the interval has elapsed exactly', () => {
  const state = getSharedFunctionResolveState();
  state.lastPruneAtMs = 1000;
  state.cache.set('expired', { expiresAt: 5000 });

  pruneFunctionResolveCache(state, 6000);

  expect(state.cache.has('expired')).toBe(false);
  expect(state.lastPruneAtMs).toBe(6000);
});

test('forced scans reject stale and malformed shared entries', () => {
  const state = getSharedFunctionResolveState();
  state.cache.set('null', null);
  state.cache.set('scalar', 42);
  state.cache.set('missing', {});
  state.cache.set('wrong-type', { expiresAt: '9000' });
  state.cache.set('expired', { expiresAt: 6000 });
  state.cache.set('future', { expiresAt: 9000 });

  pruneFunctionResolveCache(state, 6000, true);
  expect([...state.cache.keys()]).toEqual(['future']);
  expect(state.lastPruneAtMs).toBe(6000);
});

test('evicts earliest expirations first when the shared cache reaches its bound', () => {
  const state = getSharedFunctionResolveState();
  state.maxEntries = 2;
  state.cache.set('latest', { expiresAt: 9000 });
  state.cache.set('earliest', { expiresAt: 7000 });
  state.cache.set('middle', { expiresAt: 8000 });

  pruneFunctionResolveCache(state, 6000, true);
  expect([...state.cache.keys()]).toEqual(['latest', 'middle']);
});

test('retains every live entry while the cache remains below its bound', () => {
  const state = getSharedFunctionResolveState();
  state.maxEntries = 3;
  state.cache.set('first', { expiresAt: 7000 });
  state.cache.set('second', { expiresAt: 8000 });

  pruneFunctionResolveCache(state, 6000, true);

  expect([...state.cache.keys()]).toEqual(['first', 'second']);
});
