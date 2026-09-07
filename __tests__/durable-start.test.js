const { VolcanoClient } = require('../src/index.js');

const execution = {
  id: 'exec-1',
  function_id: 'fn-1',
  name: 'order-42',
  status: 'running',
  region: 'aws-us-east-1',
  created_at: '2026-09-06T12:00:00Z',
};

function clientWithTransport(overrides = {}, config = {}) {
  const transport = {
    startDurableExecutionFromApplication: jest
      .fn()
      .mockResolvedValue({ data: execution, status: 202 }),
    ...overrides,
  };
  const volcano = new VolcanoClient({
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    transportFactory: () => transport,
    ...config,
  });
  return { volcano, transport };
}

describe('durable.start', () => {
  test('starts with the anon key when there is no session, and returns the handle', async () => {
    const { volcano, transport } = clientWithTransport();

    await expect(volcano.durable.start('order pipeline', { order_id: 42 })).resolves.toEqual({
      data: execution,
      status: 202,
      error: null,
    });

    expect(transport.startDurableExecutionFromApplication).toHaveBeenCalledWith(
      'order%20pipeline',
      { order_id: 42 },
      expect.objectContaining({ volcanoAuthorization: 'anon', volcanoClient: volcano }),
    );
  });

  test('uses the session credential when one is held', async () => {
    const { volcano, transport } = clientWithTransport({}, { accessToken: 'user-access-token' });

    await volcano.durable.start('order-pipeline');

    expect(transport.startDurableExecutionFromApplication).toHaveBeenCalledWith(
      'order-pipeline',
      {},
      expect.objectContaining({ volcanoAuthorization: 'session' }),
    );
  });

  test('sends the execution name as the idempotency header, and no header without one', async () => {
    const { volcano, transport } = clientWithTransport();

    await volcano.durable.start('order-pipeline', {}, { executionName: ' order-42 ' });
    expect(transport.startDurableExecutionFromApplication.mock.calls[0][2]).toEqual(
      expect.objectContaining({ headers: { 'X-Volcano-Execution-Name': 'order-42' } }),
    );

    await volcano.durable.start('order-pipeline');
    expect(transport.startDurableExecutionFromApplication.mock.calls[1][2].headers).toBeUndefined();
  });

  test('refuses a missing function name before reaching the platform', async () => {
    const { volcano, transport } = clientWithTransport();

    for (const name of ['', '   ', undefined, 42]) {
      const { data, status, error } = await volcano.durable.start(name);
      expect(data).toBeNull();
      expect(status).toBeNull();
      expect(error.message).toContain('functionName must be a non-empty string');
    }
    expect(transport.startDurableExecutionFromApplication).not.toHaveBeenCalled();
  });

  test('refuses a blank execution name rather than starting an unnamed execution', async () => {
    const { volcano, transport } = clientWithTransport();

    const { error } = await volcano.durable.start('order-pipeline', {}, { executionName: '  ' });

    expect(error.message).toContain('executionName must be a non-empty string');
    expect(transport.startDurableExecutionFromApplication).not.toHaveBeenCalled();
  });

  // A refused start is not an exception: the caller gets the platform's status
  // so it can tell a private function (403) from a plan's concurrency cap (429).
  test('surfaces a platform refusal with its status', async () => {
    const refusal = Object.assign(new Error('too many executions in flight'), { status: 429 });
    const { volcano } = clientWithTransport({
      startDurableExecutionFromApplication: jest.fn().mockRejectedValue(refusal),
    });

    await expect(volcano.durable.start('order-pipeline')).resolves.toEqual({
      data: null,
      status: 429,
      error: refusal,
    });
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      startDurableExecutionFromApplication: jest.fn().mockRejectedValue('socket hang up'),
    });

    const { data, status, error } = await volcano.durable.start('order-pipeline');

    expect(data).toBeNull();
    expect(status).toBeNull();
    expect(error.message).toBe('Failed to start durable execution');
  });
});
