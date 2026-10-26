/** @jest-environment ./__tests__/node-environment.cjs */
import { describe, expect, jest, test } from '@jest/globals';
import { VolcanoClient } from '../src/index.ts';
import { execution, mockClientFactory, type TransportOperation } from './support/durable-executions-fixtures.ts';
import { rejectWithForeignValue } from './support/non-error-rejection.ts';

const clientWithTransport = mockClientFactory(VolcanoClient);

function refusesWithoutSession(): void {
  // These routes carry the project's own token. Without a session there is
  // nothing to send, and the platform's 401 costs a round trip to learn it.
  test('refuses an owner-scoped call with no session', async () => {
    const transport = {
      getDurableExecution: jest.fn<TransportOperation>(),
      listDurableExecutions: jest.fn<TransportOperation>(),
      stopDurableExecution: jest.fn<TransportOperation>(),
    };
    const options = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      transportFactory: () => transport,
    };
    const volcano = new VolcanoClient(options);

    for (const call of [
      () => volcano.durable.get('proj-1', 'order-pipeline', 'exec-1'),
      () => volcano.durable.list('proj-1', 'order-pipeline'),
      () => volcano.durable.stop('proj-1', 'order-pipeline', 'exec-1'),
    ]) {
      const { data, status, error } = await call();
      expect(data).toBeNull();
      expect(status).toBeNull();
      expect(error?.message).toContain('No active session');
    }

    expect(transport.getDurableExecution).not.toHaveBeenCalled();
    expect(transport.listDurableExecutions).not.toHaveBeenCalled();
    expect(transport.stopDurableExecution).not.toHaveBeenCalled();
  });

  test('refuses an owner-scoped call when the stored token is empty', async () => {
    const getDurableExecution = jest.fn<TransportOperation>();
    const options = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      transportFactory: () => ({ getDurableExecution }),
    };
    const volcano = new VolcanoClient(options);
    expect(Reflect.set(volcano, 'accessToken', '')).toBe(true);

    await expect(volcano.durable.get('proj-1', 'orders', 'exec-1')).resolves.toMatchObject({
      error: { message: 'No active session' },
    });
    expect(getDurableExecution).not.toHaveBeenCalled();
  });
}

function surfacesRefusalsAndFailures(): void {
  // A refusal is not an exception: a caller polling an execution has to be able
  // to tell a deleted function (404) from a credential that may not read it.
  test('surfaces a platform refusal with its status', async () => {
    const refusal = Object.assign(new Error('durable function not found'), { status: 404 });
    const { volcano } = clientWithTransport({
      getDurableExecution: jest.fn<TransportOperation>().mockImplementation(() => Promise.reject(refusal)),
    });

    await expect(volcano.durable.get('proj-1', 'gone', 'exec-1')).resolves.toEqual({
      data: null,
      status: 404,
      error: refusal,
    });
  });

  test('reports a transport failure that carries no status', async () => {
    const { volcano } = clientWithTransport({
      stopDurableExecution: jest
        .fn<TransportOperation>()
        .mockImplementation(() => rejectWithForeignValue('socket hang up')),
    });

    const { data, status, error } = await volcano.durable.stop('proj-1', 'order-pipeline', 'e-1');

    expect(data).toBeNull();
    expect(status).toBeNull();
    expect(error?.message).toBe('Failed to stop durable execution');
  });

  test('reports a foreign list failure with the operation name', async () => {
    const { volcano } = clientWithTransport({
      listDurableExecutions: jest.fn<TransportOperation>().mockImplementation(() => rejectWithForeignValue(null)),
    });

    await expect(volcano.durable.list('proj-1', 'orders')).resolves.toMatchObject({
      data: null,
      status: null,
      error: { message: 'Failed to list durable executions' },
    });
  });
}

function keepsFailuresInTheEnvelope(): void {
  test('a null rejection preserves its cause and has no status', async () => {
    const { volcano } = clientWithTransport({
      getDurableExecution: jest.fn<TransportOperation>().mockImplementation(() => rejectWithForeignValue(null)),
    });

    const result = await volcano.durable.get('proj-1', 'orders', 'exec-1');
    expect(result.status).toBeNull();
    expect(result.error?.message).toBe('Failed to read durable execution');
    expect(result.error?.cause).toBeNull();
  });

  test('keeps malformed transport responses inside the durable result envelope', async () => {
    const getDurableExecution = jest
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce({ data: execution, status: 'not-a-status' })
      .mockResolvedValueOnce({ data: execution })
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => Promise.resolve())
      .mockImplementationOnce(() => rejectWithForeignValue({ status: 'not-a-status' }));
    const options = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      accessToken: 'owner-token',
      transportFactory: () => ({ getDurableExecution }),
    };
    const volcano = new VolcanoClient(options);

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const malformed = await volcano.durable.get('proj-1', 'order-pipeline', 'exec-1');
      expect(malformed).toMatchObject({
        data: null,
        status: null,
        error: { message: 'Failed to read durable execution' },
      });
    }
    const rejected = await volcano.durable.get('proj-1', 'order-pipeline', 'exec-1');
    expect(rejected).toMatchObject({
      data: null,
      status: null,
      error: { message: 'Failed to read durable execution' },
    });
    expect(rejected.error?.cause).toEqual({ status: 'not-a-status' });
  });
}

describe('durable.get / durable.list / durable.stop', () => {
  refusesWithoutSession();
  surfacesRefusalsAndFailures();
  keepsFailuresInTheEnvelope();
});
