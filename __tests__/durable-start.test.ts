import { describe, expect, jest, test } from '@jest/globals';
import { type VolcanoAuthConfig, VolcanoClient } from '../src/index.js';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const execution = {
  id: 'exec-1',
  function_id: 'fn-1',
  name: 'order-42',
  status: 'running',
  region: 'aws-us-east-1',
  created_at: '2026-09-06T12:00:00Z',
};

type StartOperation = (
  functionName: string,
  input: unknown,
  options: { headers?: Record<string, string> },
) => Promise<{ data: typeof execution; status: number }>;

interface StartTransport {
  startDurableExecutionFromApplication: jest.Mock<StartOperation>;
}

function clientWithTransport(
  overrides: Partial<StartTransport> = {},
  config: Partial<VolcanoAuthConfig> = {},
) {
  const transport = {
    startDurableExecutionFromApplication: jest.fn<StartOperation>().mockResolvedValue({
      data: execution,
      status: 202,
    }),
    ...overrides,
  };
  const options = {
    apiUrl: 'https://api.test.com',
    anonKey: 'ak-durable',
    transportFactory: () => transport,
    ...config,
  };
  const volcano = new VolcanoClient(options);
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
    expect(transport.startDurableExecutionFromApplication.mock.calls[0]?.[2]).toEqual(
      expect.objectContaining({ headers: { 'X-Volcano-Execution-Name': 'order-42' } }),
    );

    await volcano.durable.start('order-pipeline');
    expect(
      transport.startDurableExecutionFromApplication.mock.calls[1]?.[2].headers,
    ).toBeUndefined();
  });

  test('refuses a missing function name before reaching the platform', async () => {
    const { volcano, transport } = clientWithTransport();

    for (const name of ['', '   ', undefined, 42]) {
      const result: unknown = Reflect.apply(
        volcano.durable.start.bind(volcano.durable),
        undefined,
        [name],
      );
      await expect(result).resolves.toMatchObject({
        data: null,
        status: null,
        error: { message: expect.stringContaining('functionName must be a non-empty string') },
      });
    }
    expect(transport.startDurableExecutionFromApplication).not.toHaveBeenCalled();
  });

  test('refuses a blank execution name rather than starting an unnamed execution', async () => {
    const { volcano, transport } = clientWithTransport();

    const { error } = await volcano.durable.start('order-pipeline', {}, { executionName: '  ' });

    expect(error?.message).toContain('executionName must be a non-empty string');
    expect(transport.startDurableExecutionFromApplication).not.toHaveBeenCalled();
  });

  // The name is an idempotency key the caller has to be able to reproduce, so a
  // name it cannot use is worth saying locally instead of spending a start on a
  // 400. 255 is what the API documents, measured after the trim the SDK applies.
  test('refuses an execution name longer than the platform accepts', async () => {
    const { volcano, transport } = clientWithTransport();

    const { error } = await volcano.durable.start(
      'order-pipeline',
      {},
      { executionName: 'o'.repeat(256) },
    );

    expect(error?.message).toContain('executionName must be at most 255 characters');
    expect(transport.startDurableExecutionFromApplication).not.toHaveBeenCalled();

    await volcano.durable.start('order-pipeline', {}, { executionName: ` ${'o'.repeat(255)} ` });
    expect(transport.startDurableExecutionFromApplication).toHaveBeenCalledTimes(1);
  });

  // A refused start is not an exception: the caller gets the platform's status
  // so it can tell a private function (403) from a plan's concurrency cap (429).
  test('surfaces a platform refusal with its status', async () => {
    const refusal = Object.assign(new Error('too many executions in flight'), { status: 429 });
    const { volcano } = clientWithTransport({
      startDurableExecutionFromApplication: jest
        .fn<StartOperation>()
        .mockImplementation(() => Promise.reject(refusal)),
    });

    await expect(volcano.durable.start('order-pipeline')).resolves.toEqual({
      data: null,
      status: 429,
      error: refusal,
    });
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      startDurableExecutionFromApplication: jest
        .fn<StartOperation>()
        .mockImplementation(() => rejectWithForeignValue('socket hang up')),
    });

    const { data, status, error } = await volcano.durable.start('order-pipeline');

    expect(data).toBeNull();
    expect(status).toBeNull();
    expect(error?.message).toBe('Failed to start durable execution');
  });
});
