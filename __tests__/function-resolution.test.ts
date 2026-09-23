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
  });

  test('rejects an empty successful response before caching it', async () => {
    const client = clientWithResponse({ ok: true, status: 200, data: null, error: null });

    await expect(resolveFunctionByHttp(client, 'orders', 'token', 'orders-key')).rejects.toThrow(
      'Resolve response missing valid function_id',
    );
    expect(client._functionResolveState.cache.has('orders-key')).toBe(false);
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
