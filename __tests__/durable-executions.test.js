const { VolcanoClient } = require('../src/index.js');

const execution = {
  id: 'exec-1',
  function_id: 'fn-1',
  name: 'order-42',
  status: 'succeeded',
  region: 'aws-us-east-1',
  created_at: '2026-09-06T12:00:00Z',
  completed_at: '2026-09-06T12:06:00Z',
  result: { shipped: true },
};

const page = { data: [execution], page: 1, limit: 20, total: 1, has_more: false };

function clientWithTransport(overrides = {}) {
  const transport = {
    getDurableExecution: jest.fn().mockResolvedValue({ data: execution, status: 200 }),
    listDurableExecutions: jest.fn().mockResolvedValue({ data: page, status: 200 }),
    stopDurableExecution: jest
      .fn()
      .mockResolvedValue({ data: { ...execution, status: 'stopped' }, status: 200 }),
    ...overrides,
  };
  const volcano = new VolcanoClient({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    accessToken: 'owner-token',
    transportFactory: () => transport,
  });
  return { volcano, transport };
}

describe('durable.get / durable.list / durable.stop', () => {
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

  test('lists executions, forwarding only the filters the caller set', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.list('proj-1', 'order-pipeline')).resolves.toEqual({
      data: page,
      status: 200,
      error: null,
    });
    // Strict, because a key carrying undefined is a query parameter the caller
    // never asked for.
    expect(transport.listDurableExecutions.mock.calls[0][2]).toStrictEqual({});

    await volcano.durable.list('proj-1', 'order-pipeline', {
      status: 'running',
      page: 2,
      limit: 50,
    });
    expect(transport.listDurableExecutions.mock.calls[1][2]).toStrictEqual({
      status: 'running',
      page: 2,
      limit: 50,
    });
  });

  test('stops an execution and hands back what the platform recorded', async () => {
    const { volcano, transport } = clientWithTransport();

    const { data, status, error } = await volcano.durable.stop(
      'proj-1',
      'order-pipeline',
      'exec-1',
    );

    expect(error).toBeNull();
    expect(status).toBe(200);
    expect(data.status).toBe('stopped');
    expect(transport.stopDurableExecution).toHaveBeenCalledWith(
      'proj-1',
      'order-pipeline',
      'exec-1',
      expect.objectContaining({ volcanoAuthorization: 'session' }),
    );
  });

  // An empty segment would address the collection instead of the execution, so
  // a stop with no execution id would otherwise be a request that cannot mean
  // what the caller meant.
  test('refuses an empty identifier before reaching the platform', async () => {
    const { volcano, transport } = clientWithTransport();

    const cases = [
      [['', 'order-pipeline', 'exec-1'], 'projectId'],
      [['proj-1', '  ', 'exec-1'], 'functionName'],
      [['proj-1', 'order-pipeline', undefined], 'executionId'],
      [['proj-1', 'order-pipeline', 42], 'executionId'],
    ];

    for (const [args, field] of cases) {
      for (const operation of ['get', 'stop']) {
        const { data, status, error } = await volcano.durable[operation](...args);
        expect(data).toBeNull();
        expect(status).toBeNull();
        expect(error.message).toContain(`${field} must be a non-empty string`);
      }
    }

    const listed = await volcano.durable.list('proj-1', '');
    expect(listed.error.message).toContain('functionName must be a non-empty string');

    expect(transport.getDurableExecution).not.toHaveBeenCalled();
    expect(transport.listDurableExecutions).not.toHaveBeenCalled();
    expect(transport.stopDurableExecution).not.toHaveBeenCalled();
  });

  test('escapes every segment it puts in the path', async () => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.get('proj/1', 'order pipeline', 'exec#1');
    await volcano.durable.stop('proj/1', 'order pipeline', 'exec#1');
    await volcano.durable.list('proj/1', 'order pipeline');

    expect(transport.getDurableExecution.mock.calls[0].slice(0, 3)).toEqual([
      'proj%2F1',
      'order%20pipeline',
      'exec%231',
    ]);
    expect(transport.stopDurableExecution.mock.calls[0].slice(0, 3)).toEqual([
      'proj%2F1',
      'order%20pipeline',
      'exec%231',
    ]);
    expect(transport.listDurableExecutions.mock.calls[0].slice(0, 2)).toEqual([
      'proj%2F1',
      'order%20pipeline',
    ]);
  });

  // These routes carry the project's own token. Without a session there is
  // nothing to send, and the platform's 401 costs a round trip to learn it.
  test('refuses an owner-scoped call with no session', async () => {
    const transport = {
      getDurableExecution: jest.fn(),
      listDurableExecutions: jest.fn(),
      stopDurableExecution: jest.fn(),
    };
    const volcano = new VolcanoClient({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      transportFactory: () => transport,
    });

    for (const call of [
      () => volcano.durable.get('proj-1', 'order-pipeline', 'exec-1'),
      () => volcano.durable.list('proj-1', 'order-pipeline'),
      () => volcano.durable.stop('proj-1', 'order-pipeline', 'exec-1'),
    ]) {
      const { data, status, error } = await call();
      expect(data).toBeNull();
      expect(status).toBeNull();
      expect(error.message).toContain('No active session');
    }

    expect(transport.getDurableExecution).not.toHaveBeenCalled();
    expect(transport.listDurableExecutions).not.toHaveBeenCalled();
    expect(transport.stopDurableExecution).not.toHaveBeenCalled();
  });

  // A refusal is not an exception: a caller polling an execution has to be able
  // to tell a deleted function (404) from a credential that may not read it.
  test('surfaces a platform refusal with its status', async () => {
    const refusal = Object.assign(new Error('durable function not found'), { status: 404 });
    const { volcano } = clientWithTransport({
      getDurableExecution: jest.fn().mockRejectedValue(refusal),
    });

    await expect(volcano.durable.get('proj-1', 'gone', 'exec-1')).resolves.toEqual({
      data: null,
      status: 404,
      error: refusal,
    });
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      stopDurableExecution: jest.fn().mockRejectedValue('socket hang up'),
    });

    const { data, status, error } = await volcano.durable.stop('proj-1', 'order-pipeline', 'e-1');

    expect(data).toBeNull();
    expect(status).toBeNull();
    expect(error.message).toBe('Failed to stop durable execution');
  });
});

// The transport tests above settle the credential and the validation; the route
// and the method are the real transport's work, and a wrong one of those reads
// or cancels nothing.
describe('durable owner operations over the wire', () => {
  beforeEach(() => {
    global.fetch.mockReset();
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve(execution),
      text: () => Promise.resolve(JSON.stringify(execution)),
    });
  });

  function realClient() {
    return new VolcanoClient({
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      accessToken: 'owner-token',
    });
  }

  test('reads an execution from the project collection', async () => {
    const { data, error } = await realClient().durable.get('proj-1', 'order-pipeline', 'exec-1');

    expect(error).toBeNull();
    expect(data).toEqual(execution);

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test.com/projects/proj-1/durable-functions/order-pipeline/executions/exec-1',
    );
    expect(init.method).toBe('GET');
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer owner-token');
  });

  test('carries list filters as query parameters', async () => {
    await realClient().durable.list('proj-1', 'order-pipeline', { status: 'running', limit: 5 });

    expect(String(global.fetch.mock.calls[0][0])).toBe(
      'https://api.test.com/projects/proj-1/durable-functions/order-pipeline/executions?status=running&limit=5',
    );
  });

  test('posts a stop to the execution', async () => {
    await realClient().durable.stop('proj-1', 'order-pipeline', 'exec-1');

    const [url, init] = global.fetch.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.test.com/projects/proj-1/durable-functions/order-pipeline/executions/exec-1/stop',
    );
    expect(init.method).toBe('POST');
  });
});
