/** @jest-environment ./__tests__/node-environment.cjs */

import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.js';

const execution = {
  id: 'exec-1',
  function_id: 'fn-1',
  name: 'order-42',
  status: 'running',
  region: 'aws-us-east-1',
  created_at: '2026-09-06T12:00:00Z',
};

function realClient(): VolcanoClient {
  return new VolcanoClient({ apiUrl: 'https://api.test.com', anonKey: 'ak-durable' });
}

function mockExecutionResponse(): jest.SpiedFunction<typeof fetch> {
  return jest
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(Response.json(execution, { status: 202 }));
}

function firstRequest(
  fetchMock: jest.SpiedFunction<typeof fetch>,
): [RequestInfo | URL, RequestInit] {
  const call = fetchMock.mock.calls[0];
  if (call === undefined) {
    throw new Error('Expected durable start request');
  }
  if (call[1] === undefined) {
    throw new Error('Expected durable start request');
  }
  return [call[0], call[1]];
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

// Transport doubles cover credential selection and validation; these assertions
// verify the actual HTTP method, route and idempotency header.
describe('durable.start over the wire', () => {
  test('posts to the function executions collection with the anon key', async () => {
    const fetchMock = mockExecutionResponse();
    const { data, error } = await realClient().durable.start('order-pipeline', { order_id: 42 });

    expect(error).toBeNull();
    expect(data).toEqual(execution);

    const [url, init] = firstRequest(fetchMock);
    expect(requestUrl(url)).toBe(
      'https://api.test.com/durable-functions/order-pipeline/executions',
    );
    expect(init.method).toBe('POST');
    if (typeof init.body !== 'string') {
      throw new TypeError('Expected JSON request body');
    }
    expect(JSON.parse(init.body)).toEqual({ order_id: 42 });
    const headers = new Headers(init.headers);
    expect(headers.get('apikey') ?? headers.get('authorization')).toContain('ak-durable');
    expect(headers.get('x-volcano-execution-name')).toBeNull();
  });

  test('carries the execution name as the idempotency header', async () => {
    const fetchMock = mockExecutionResponse();
    await realClient().durable.start('order-pipeline', {}, { executionName: 'order-42' });

    const [, init] = firstRequest(fetchMock);
    expect(new Headers(init.headers).get('x-volcano-execution-name')).toBe('order-42');
  });

  test('escapes a function name that needs it', async () => {
    const fetchMock = mockExecutionResponse();
    await realClient().durable.start('order pipeline');

    const [url] = firstRequest(fetchMock);
    expect(requestUrl(url)).toContain('/durable-functions/order%20pipeline/executions');
  });
});
