/** @jest-environment ./__tests__/node-environment.cjs */
import { beforeEach, describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { fetchCall } from './auth-concurrency-fixtures.ts';
import { execution, mockClientFactory, page, type TransportOperation } from './support/durable-executions-fixtures.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function readsExecutions(): void {
  test('rejects malformed successful execution and page payloads', async () => {
    const { volcano } = clientWithTransport({
      getDurableExecution: jest
        .fn<TransportOperation>()
        .mockResolvedValue({ data: { ...execution, status: 'queued' }, status: 200 }),
      listDurableExecutions: jest
        .fn<TransportOperation>()
        .mockResolvedValue({ data: { ...page, has_more: 'no' }, status: 200 }),
    });

    await expect(volcano.durable.get('proj-1', 'orders', 'exec-1')).resolves.toMatchObject({
      data: null,
      status: null,
      error: new TypeError('Invalid durable response: Failed to read durable execution'),
    });
    await expect(volcano.durable.list('proj-1', 'orders')).resolves.toMatchObject({
      data: null,
      status: null,
      error: expect.any(TypeError),
    });
  });

  test('reads an execution with the project owner’s credential', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.get('proj-1', 'order pipeline', 'exec-1')).resolves.toEqual({
      data: execution,
      status: 200,
      error: null,
    });

    expect(transport.getDurableExecution).toHaveBeenCalledWith(
      'proj-1',
      'order%20pipeline',
      'exec-1',
      // Never the anon key: these routes belong to the project, not to whoever
      // loaded the page.
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
  });
}

function listsAndStopsExecutions(): void {
  test('lists executions, forwarding only the filters the caller set', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.list('proj-1', 'order-pipeline')).resolves.toEqual({
      data: page,
      status: 200,
      error: null,
    });
    expect(transport.listDurableExecutions).toHaveBeenCalledWith(
      'proj-1',
      'order-pipeline',
      {},
      expect.objectContaining({ volcanoAuthorization: 'session', volcanoClient: volcano }),
    );
    // Strict, because a key carrying undefined is a query parameter the caller
    // never asked for.
    expect(transport.listDurableExecutions.mock.calls[0]?.[2]).toStrictEqual({});

    await volcano.durable.list('proj-1', 'order-pipeline', {
      status: 'running',
      page: 2,
      limit: 50,
    });
    expect(transport.listDurableExecutions.mock.calls[1]?.[2]).toStrictEqual({
      status: 'running',
      page: 2,
      limit: 50,
    });
  });

  test('stops an execution and hands back what the platform recorded', async () => {
    const { volcano, transport } = clientWithTransport();

    const { data, status, error } = await volcano.durable.stop('proj-1', 'order-pipeline', 'exec-1');

    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(data).toMatchObject({ status: 'stopped' });
    expect(transport.stopDurableExecution).toHaveBeenCalledWith(
      'proj-1',
      'order-pipeline',
      'exec-1',
      expect.objectContaining({ volcanoAuthorization: 'session' }),
    );
  });
}

function refusesEmptyIdentifiers(): void {
  // An empty segment would address the collection instead of the execution, so
  // a stop with no execution id would otherwise be a request that cannot mean
  // what the caller meant.
  test('refuses an empty identifier before reaching the platform', async () => {
    const { volcano, transport } = clientWithTransport();

    const cases: [unknown[], string][] = [
      [['', 'order-pipeline', 'exec-1'], 'projectId'],
      [['proj-1', '  ', 'exec-1'], 'functionName'],
      [['proj-1', 'order-pipeline', undefined], 'executionId'],
      [['proj-1', 'order-pipeline', 42], 'executionId'],
    ];

    const operations = [volcano.durable.get.bind(volcano.durable), volcano.durable.stop.bind(volcano.durable)];
    await Promise.all(
      cases.flatMap(([args, field]) =>
        operations.map((operation) => {
          const result: unknown = Reflect.apply(operation, undefined, args);
          return expect(result).resolves.toMatchObject({
            data: null,
            status: null,
            error: { message: expect.stringContaining(`${field} must be a non-empty string`) },
          });
        }),
      ),
    );

    const listed = await volcano.durable.list('proj-1', '');
    expect(listed.error?.message).toContain('functionName must be a non-empty string');

    expect(transport.getDurableExecution).not.toHaveBeenCalled();
    expect(transport.listDurableExecutions).not.toHaveBeenCalled();
    expect(transport.stopDurableExecution).not.toHaveBeenCalled();
  });
}

function escapesPathSegments(): void {
  test('escapes every segment it puts in the path', async () => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.get('proj?1', 'order pipeline', 'exec#1');
    await volcano.durable.stop('proj?1', 'order pipeline', 'exec#1');
    await volcano.durable.list('proj?1', 'order pipeline');

    expect(transport.getDurableExecution.mock.calls[0]?.slice(0, 3)).toEqual([
      'proj%3F1',
      'order%20pipeline',
      'exec%231',
    ]);
    expect(transport.stopDurableExecution.mock.calls[0]?.slice(0, 3)).toEqual([
      'proj%3F1',
      'order%20pipeline',
      'exec%231',
    ]);
    expect(transport.listDurableExecutions.mock.calls[0]?.slice(0, 2)).toEqual(['proj%3F1', 'order%20pipeline']);
  });
}

describe('durable.get / durable.list / durable.stop', () => {
  readsExecutions();
  listsAndStopsExecutions();
  refusesEmptyIdentifiers();
  escapesPathSegments();
});

// The transport tests above settle the credential and the validation; the route
// and the method are the real transport's work, and a wrong one of those reads
// or cancels nothing.
function realClient() {
  return new VolcanoClient({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    accessToken: 'owner-token',
  });
}

describe('durable owner operations over the wire', () => {
  beforeEach(() => {
    jest.mocked(globalThis.fetch).mockReset();
    jest.mocked(globalThis.fetch).mockResolvedValue(Response.json(execution));
  });

  test('reads an execution from the project collection', async () => {
    const { data, error } = await realClient().durable.get('proj-1', 'order-pipeline', 'exec-1');

    expect(error).toBeNull();
    expect(data).toEqual(execution);

    const [url, init] = fetchCall(0);
    expect(url).toBe('https://api.test.com/projects/proj-1/durable-functions/order-pipeline/executions/exec-1');
    expect(init?.method).toBe('GET');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer owner-token');
  });

  test('carries list filters as query parameters', async () => {
    await realClient().durable.list('proj-1', 'order-pipeline', { status: 'running', limit: 5 });

    const [url, init] = fetchCall(0);
    expect(url).toBe(
      'https://api.test.com/projects/proj-1/durable-functions/order-pipeline/executions?status=running&limit=5',
    );
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer owner-token');
  });

  test('posts a stop to the execution', async () => {
    await realClient().durable.stop('proj-1', 'order-pipeline', 'exec-1');

    const [url, init] = fetchCall(0);
    expect(url).toBe('https://api.test.com/projects/proj-1/durable-functions/order-pipeline/executions/exec-1/stop');
    expect(init?.method).toBe('POST');
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer owner-token');
  });
});
