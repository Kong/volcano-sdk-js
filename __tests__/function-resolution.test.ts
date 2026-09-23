import { beforeEach, describe, expect, test } from '@jest/globals';
import { type ResolutionClient, resolveFunctionByHttp } from '../src/function-resolution.ts';
import {
  clearSharedFunctionResolveStateForTests,
  getSharedFunctionResolveState,
} from '../src/function-resolve-cache.ts';

beforeEach(() => {
  clearSharedFunctionResolveStateForTests();
});

function clientWithResponse(
  response: Awaited<ReturnType<ResolutionClient['_anonFetch']>>,
): ResolutionClient {
  return {
    _functionResolveState: getSharedFunctionResolveState(),
    _anonFetch: () => Promise.resolve(response),
  };
}

describe('function resolution response boundary', () => {
  test('returns a useful error when a failed transport has no error object', async () => {
    const client = clientWithResponse({ ok: false, status: 503, data: null, error: null });

    await expect(
      resolveFunctionByHttp(client, 'orders', 'token', 'orders-key'),
    ).resolves.toMatchObject({
      functionId: null,
      status: 503,
      error: { message: 'Failed to resolve function' },
    });
    expect(client._functionResolveState.cache.size).toBe(0);
  });

  test('caches a missing function when the transport provides no error object', async () => {
    const client = clientWithResponse({ ok: false, status: 404, data: null, error: null });

    await expect(
      resolveFunctionByHttp(client, 'orders', 'token', 'orders-key'),
    ).resolves.toMatchObject({
      error: { message: 'Failed to resolve function' },
    });
    expect(client._functionResolveState.cache.get('orders-key')).toMatchObject({
      error: 'function not found',
      errorMetadata: { status: 404, code: undefined, retryAfter: undefined },
    });
  });

  test('a negative resolution evicts an older entry at the capacity limit', async () => {
    const client = clientWithResponse({ ok: false, status: 404, data: null, error: null });
    client._functionResolveState.maxEntries = 1;
    client._functionResolveState.lastPruneAtMs = Date.now();
    client._functionResolveState.cache.set('old-key', { expiresAt: Date.now() + 1000 });

    await resolveFunctionByHttp(client, 'orders', 'token', 'orders-key');

    expect([...client._functionResolveState.cache.keys()]).toEqual(['orders-key']);
  });

  test('rejects an empty successful response before caching it', async () => {
    const client = clientWithResponse({ ok: true, status: 200, data: null, error: null });

    await expect(resolveFunctionByHttp(client, 'orders', 'token', 'orders-key')).rejects.toThrow(
      'Resolve response missing valid function_id',
    );
    expect(client._functionResolveState.cache.has('orders-key')).toBe(false);
  });

  test('rejects a missing successful response with a stable boundary error', async () => {
    const client = clientWithResponse({ ok: true, status: 200, data: undefined, error: null });

    await expect(resolveFunctionByHttp(client, 'orders', 'token', 'orders-key')).rejects.toThrow(
      'Resolve response missing valid function_id',
    );
    expect(client._functionResolveState.cache.size).toBe(0);
  });

  test('rejects a zero lifetime before caching a successful resolution', async () => {
    const client = clientWithResponse({
      ok: true,
      status: 200,
      data: { function_id: 'fn-1', cache_ttl_seconds: 0 },
      error: null,
    });

    await expect(resolveFunctionByHttp(client, 'orders', 'token', 'orders-key')).rejects.toThrow(
      'Resolve response missing valid cache_ttl_seconds',
    );
    expect(client._functionResolveState.cache.size).toBe(0);
  });

  test('keeps the negative cache readable when the server returns an empty error message', async () => {
    const upstreamError = new Error('upstream error');
    upstreamError.message = '';
    const client = clientWithResponse({ ok: false, status: 404, data: null, error: upstreamError });

    await resolveFunctionByHttp(client, 'orders', 'token', 'orders-key');

    expect(client._functionResolveState.cache.get('orders-key')).toMatchObject({
      functionId: null,
      error: 'function not found',
    });
  });
});
