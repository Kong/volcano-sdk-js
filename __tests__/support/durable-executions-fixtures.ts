import { jest } from '@jest/globals';
import type { VolcanoClient } from '../../src/index.ts';

export const execution = {
  id: 'exec-1',
  function_id: 'fn-1',
  name: 'order-42',
  status: 'succeeded',
  region: 'aws-us-east-1',
  created_at: '2026-09-06T12:00:00Z',
  completed_at: '2026-09-06T12:06:00Z',
  result: { shipped: true },
};

export const page = { data: [execution], page: 1, limit: 20, total: 1, has_more: false };

export type TransportOperation = (...args: unknown[]) => Promise<{ data: unknown; status: number }>;
type TransportMock = jest.Mock<TransportOperation>;

interface DurableTransport {
  getDurableExecution: TransportMock;
  getDurableExecutionFromApplication: TransportMock;
  listDurableExecutions: TransportMock;
  stopDurableExecution: TransportMock;
  stopDurableExecutionFromApplication: TransportMock;
}

type ClientWithTransport = (
  overrides?: Partial<DurableTransport>,
  credentials?: { accessToken?: string },
) => {
  volcano: VolcanoClient;
  transport: DurableTransport;
};

const owner = { accessToken: 'owner-token' };

export function mockClientFactory(Client: typeof VolcanoClient): ClientWithTransport {
  return (overrides = {}, credentials = owner) => {
    const transport = {
      getDurableExecution: jest.fn<TransportOperation>().mockResolvedValue({ data: execution, status: 200 }),
      getDurableExecutionFromApplication: jest
        .fn<TransportOperation>()
        .mockResolvedValue({ data: execution, status: 200 }),
      listDurableExecutions: jest.fn<TransportOperation>().mockResolvedValue({ data: page, status: 200 }),
      stopDurableExecution: jest
        .fn<TransportOperation>()
        .mockResolvedValue({ data: { ...execution, status: 'stopped' }, status: 200 }),
      stopDurableExecutionFromApplication: jest
        .fn<TransportOperation>()
        .mockResolvedValue({ data: { ...execution, status: 'stopped' }, status: 200 }),
      ...overrides,
    };
    const options = {
      apiUrl: 'https://api.test.com',
      anonKey: 'ak-durable',
      ...credentials,
      transportFactory: () => transport,
    };
    const volcano = new Client(options);
    return { volcano, transport };
  };
}
